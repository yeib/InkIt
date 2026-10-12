//! Generación de identidades digitales autofirmadas (PKCS#12 / `.pfx`).
//!
//! El `.pfx` resultante es el que consume [`super::signer::sign_pdf_pkcs12`].

use openssl::asn1::Asn1Time;
use openssl::bn::{BigNum, MsbOption};
use openssl::hash::MessageDigest;
use openssl::pkcs12::Pkcs12;
use openssl::pkey::PKey;
use openssl::rsa::Rsa;
use openssl::x509::{
    extension::{BasicConstraints, ExtendedKeyUsage, KeyUsage, SubjectKeyIdentifier},
    X509NameBuilder, X509,
};
use std::error::Error;

/// Genera una identidad digital autofirmada (RSA-2048 + SHA-256) y la
/// empaqueta como PKCS#12 (.pfx).
///
/// IMPORTANTE — alcance y límites de este certificado:
/// Es un certificado **autofirmado** (issuer == subject): no hay ninguna
/// Entidad Certificadora de por medio, así que no existe cadena de
/// confianza verificable por terceros. Sirve como:
///   - Sello de **integridad** (permite detectar si el PDF fue alterado
///     después de firmarlo).
///   - Identidad **local** reconocible por quien ya confía en esta llave
///     (por ejemplo, el propio usuario firmando sus propios documentos).
///
/// NO constituye una Firma Electrónica Avanzada con validez legal (en
/// Chile, Ley 19.799 exige un certificado emitido por un prestador
/// acreditado). La UI y el README deben dejar esto explícito para que
/// nadie asuma un valor legal que el certificado no tiene.
///
/// # Errores
///
/// Falla si `name` está vacío o si OpenSSL no puede generar la llave, el
/// certificado o el bundle PKCS#12.
pub fn generate_pfx(name: &str, detail: &str, password: &str) -> Result<Vec<u8>, Box<dyn Error>> {
    if name.trim().is_empty() {
        return Err("El nombre del firmante no puede estar vacío".into());
    }

    // Generate RSA key
    let rsa = Rsa::generate(2048)?;
    let pkey = PKey::from_rsa(rsa)?;

    // Build X509 Name
    let mut x509_name = X509NameBuilder::new()?;
    x509_name.append_entry_by_text("CN", name)?;
    if !detail.is_empty() {
        x509_name.append_entry_by_text("O", detail)?;
    }
    let x509_name = x509_name.build();

    // Create Certificate
    let mut cert_builder = X509::builder()?;
    cert_builder.set_version(2)?; // X509v3 — requerido para poder llevar extensiones

    // Serial number (64 bits aleatorios, no predecible — RFC 5280 §4.1.2.2)
    let mut serial_bn = BigNum::new()?;
    serial_bn.rand(64, MsbOption::MAYBE_ZERO, false)?;
    let serial = serial_bn.to_asn1_integer()?;
    cert_builder.set_serial_number(&serial)?;

    cert_builder.set_subject_name(&x509_name)?;
    cert_builder.set_issuer_name(&x509_name)?;

    // Valid from now to 10 years
    let not_before = Asn1Time::days_from_now(0)?;
    let not_after = Asn1Time::days_from_now(3650)?;
    cert_builder.set_not_before(&not_before)?;
    cert_builder.set_not_after(&not_after)?;

    cert_builder.set_pubkey(&pkey)?;

    // --- Extensiones X509v3 -------------------------------------------------
    // Sin estas extensiones el certificado es criptográficamente válido pero
    // no declara para qué está autorizado a usarse. Adobe Reader y otros
    // validadores PAdES suelen marcar como "no confiable" o "propósito no
    // verificado" un certificado de firma que no las lleva.

    // CA:FALSE — este certificado no debe poder emitir otros certificados.
    // Al ser autofirmado (issuer == subject) es técnicamente "su propia
    // raíz", así que declarar explícitamente que no actúa como CA es
    // importante para no dar pie a ambigüedad.
    let basic_constraints = BasicConstraints::new().critical().build()?;
    cert_builder.append_extension(basic_constraints)?;

    // digitalSignature + nonRepudiation: exactamente lo que se necesita para
    // firmar documentos con intención de no repudio. Marcado como "critical"
    // porque cualquier validador que lo entienda debe respetar esta
    // restricción.
    let key_usage = KeyUsage::new()
        .critical()
        .digital_signature()
        .non_repudiation()
        .build()?;
    cert_builder.append_extension(key_usage)?;

    // OID 1.2.840.113583.1.1.5 = "Adobe PDF Signing" — ayuda a que Acrobat/
    // Reader reconozcan el propósito del certificado sin ambigüedad.
    let ext_key_usage = ExtendedKeyUsage::new()
        .other("1.2.840.113583.1.1.5")
        .build()?;
    cert_builder.append_extension(ext_key_usage)?;

    // Buena práctica RFC 5280: permite a un verificador identificar la
    // clave pública sin depender solo del Subject Name.
    let subject_key_id =
        SubjectKeyIdentifier::new().build(&cert_builder.x509v3_context(None, None))?;
    cert_builder.append_extension(subject_key_id)?;

    cert_builder.sign(&pkey, MessageDigest::sha256())?;

    let cert = cert_builder.build();

    // Package as PKCS#12
    let mut pkcs12_builder = Pkcs12::builder();
    let pkcs12 = pkcs12_builder
        .name(name)
        .pkey(&pkey)
        .cert(&cert)
        .build2(password)?;

    Ok(pkcs12.to_der()?)
}

/// Metadatos extraídos de un certificado PKCS#12 (.pfx/.p12).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PfxIdentityInfo {
    pub name: String,
    pub detail: String,
}

/// Valida la contraseña e inspecciona el contenido de un archivo `.pfx/.p12`,
/// extrayendo automáticamente el nombre común (CN) y organización/email.
pub fn inspect_pfx_bytes(pfx_bytes: &[u8], password: &str) -> Result<PfxIdentityInfo, Box<dyn Error>> {
    let _legacy_provider = openssl::provider::Provider::try_load(None, "legacy", true).ok();
    let _default_provider = openssl::provider::Provider::try_load(None, "default", true).ok();

    let pkcs12 = Pkcs12::from_der(pfx_bytes)
        .map_err(|_| "INVALID_PFX")?;
    let identity = pkcs12.parse2(password)
        .map_err(|_| "WRONG_PASSWORD")?;
    let cert = identity.cert
        .ok_or("MISSING_CERT")?;

    let mut name = String::new();
    let mut detail = String::new();

    for entry in cert.subject_name().entries() {
        let s = String::from_utf8_lossy(entry.data().as_slice()).to_string();
        if !s.is_empty() {
            let obj = entry.object();
            if obj.nid() == openssl::nid::Nid::COMMONNAME {
                name = s;
            } else if obj.nid() == openssl::nid::Nid::ORGANIZATIONNAME {
                detail = s;
            } else if detail.is_empty()
                && (obj.nid() == openssl::nid::Nid::ORGANIZATIONALUNITNAME
                    || obj.nid() == openssl::nid::Nid::PKCS9_EMAILADDRESS)
            {
                detail = s;
            }
        }
    }

    if name.is_empty() {
        name = "Certificado".to_string();
    }

    Ok(PfxIdentityInfo { name, detail })
}
