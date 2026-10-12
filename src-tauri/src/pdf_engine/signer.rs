//! Firma criptográfica de archivos PDF (estilo Adobe/PAdES-B-B) usando un
//! certificado PKCS#12 (.pfx / .p12).
//!
//! Implementa el flujo estándar descrito en ISO 32000-1 §12.8:
//!   1. Se agrega una *actualización incremental* (incremental update) al
//!      PDF original: sus bytes no se tocan ni se re-serializan.
//!   2. La actualización agrega un campo de firma invisible (`/FT /Sig`)
//!      con un diccionario de firma (`/Type /Sig`) cuyo `/Contents` es un
//!      placeholder de ceros y cuyo `/ByteRange` es un placeholder numérico.
//!   3. Se ubican esos placeholders en el buffer final, se calcula el
//!      `/ByteRange` real y se hashea exactamente ese rango de bytes
//!      (todo el archivo, excluyendo el propio `/Contents`).
//!   4. Se firma ese hash con CMS/PKCS#7 *detached* (`adbe.pkcs7.detached`)
//!      usando la identidad del .pfx, y el DER resultante se vuelca en
//!      hexadecimal exactamente dentro del placeholder de `/Contents`
//!      (que nunca cambia de tamaño, así que ningún otro offset se mueve).

use lopdf::{dictionary, Dictionary, Document, IncrementalDocument, Object, ObjectId, StringFormat};
use openssl::pkcs12::Pkcs12;
use openssl::pkcs7::{Pkcs7, Pkcs7Flags};
use openssl::provider::Provider;
use openssl::stack::Stack;
use openssl::x509::X509;
use std::error::Error;

/// Bytes reservados para el DER de la firma CMS/PKCS#7. 8 KiB alcanza sin
/// problema para RSA-2048/3072 con atributos firmados y una cadena de
/// certificados de 2-3 eslabones. Si `Pkcs7::sign` devuelve algo más grande
/// (cadenas muy largas o certificados con muchas extensiones), la función
/// retorna un error explícito indicando que hay que subir esta constante.
pub(crate) const SIGNATURE_PLACEHOLDER_BYTES: usize = 8192;

/// Ancho decimal fijo reservado para los 3 números variables de
/// `/ByteRange` (el primero siempre es literalmente "0" y no necesita
/// relleno). 10 dígitos cubren archivos de hasta ~9.3 GB.
pub(crate) const BYTE_RANGE_DIGIT_WIDTH: usize = 10;

/// Firma digitalmente `pdf_bytes` usando la identidad (certificado + clave
/// privada) contenida en `pfx_bytes`, protegida por `pfx_password`.
///
/// Devuelve los bytes del PDF ya firmado (el original + la actualización
/// incremental con la firma). El PDF de entrada **no** se modifica; el
/// resultado es siempre estrictamente más largo.
///
/// Limitaciones conocidas (razonables para la inmensa mayoría de PDFs, pero
/// vale la pena tenerlas presentes):
/// - El PDF de entrada no debe estar cifrado (`/Encrypt`).
/// - Si el documento ya tiene un `/AcroForm`, se reutiliza y se le agrega el
///   nuevo campo (no se pisa), pero solo se soporta el caso en que `/Fields`
///   sea un arreglo directo o una referencia a un arreglo (el caso normal).
/// - El campo de firma se ancla siempre a la primera página.
pub fn sign_pdf_pkcs12(
    pdf_bytes: &[u8],
    pfx_bytes: &[u8],
    pfx_password: &str,
) -> Result<Vec<u8>, Box<dyn Error>> {
    // --- 1. Cargar la identidad de firma desde el .pfx/.p12 -----------------
    //
    // Muchos .pfx "clásicos" (los que exportan Windows/certutil o CAs viejas)
    // cifran su contenido con RC2-40-CBC o 3DES. OpenSSL 3.x movió esos
    // algoritmos al proveedor "legacy" y ya no los activa por defecto: sin
    // esto, `parse2` fallaría con un error de "unsupported" en un porcentaje
    // importante de .pfx reales aunque la contraseña sea correcta. Se
    // ignoran los errores de carga (con `.ok()`) porque en builds
    // "vendored"/estáticas de OpenSSL puede no existir el proveedor legacy
    // como módulo cargable, y en ese caso solo fallarán los .pfx que
    // realmente lo necesiten (con un error claro de OpenSSL en `parse2`).
    //
    // IMPORTANTE: hay que conservar estos `Provider` con nombre (no `let _ =
    // ...`) porque `Provider` hace `OSSL_PROVIDER_unload` en su `Drop`. Un
    // `let _ = Provider::try_load(...)` descarta el valor en el acto y
    // desactiva el proveedor en la misma línea, antes de llegar a `parse2`
    // — falla en silencio justo para los .pfx "legacy" que esto debía
    // arreglar. Deben vivir al menos hasta después de `parse2`.
    let _legacy_provider = Provider::try_load(None, "legacy", true).ok();
    let _default_provider = Provider::try_load(None, "default", true).ok();

    let pkcs12 = Pkcs12::from_der(pfx_bytes)?;
    let identity = pkcs12.parse2(pfx_password)?;
    let signer_cert = identity
        .cert
        .ok_or("El .pfx no contiene un certificado de firma")?;
    let signer_key = identity
        .pkey
        .ok_or("El .pfx no contiene una clave privada")?;

    let mut chain = Stack::<X509>::new()?;
    if let Some(ca_certs) = identity.ca {
        for cert in ca_certs {
            chain.push(cert)?;
        }
    }

    // --- 2. Preparar la actualización incremental ---------------------------
    let prev_document = Document::load_mem(pdf_bytes)?;
    if prev_document.is_encrypted() {
        return Err("El PDF está cifrado; descífralo antes de firmarlo".into());
    }
    let mut incremental = IncrementalDocument::create_from(pdf_bytes.to_vec(), prev_document);

    let root_id = incremental
        .get_prev_documents()
        .trailer
        .get(b"Root")?
        .as_reference()?;
    incremental.opt_clone_object_to_new_document(root_id)?;

    let page_id = *incremental
        .get_prev_documents()
        .get_pages()
        .values()
        .next()
        .ok_or("El PDF no contiene ninguna página")?;
    incremental.opt_clone_object_to_new_document(page_id)?;

    // --- 3. Crear el diccionario de firma y el Widget invisible -------------
    let sig_id = incremental.new_document.new_object_id();
    let widget_id = incremental.new_document.new_object_id();

    let now_local =
        time::OffsetDateTime::now_local().unwrap_or_else(|_| time::OffsetDateTime::now_utc());
    let signing_time: Object = now_local.into();
    let byte_range_placeholder: i64 = 10i64.pow(BYTE_RANGE_DIGIT_WIDTH as u32) - 1; // 9999999999

    let sig_dict = dictionary! {
        "Type" => "Sig",
        "Filter" => "Adobe.PPKLite",
        "SubFilter" => "adbe.pkcs7.detached",
        "ByteRange" => Object::Array(vec![
            Object::Integer(0),
            Object::Integer(byte_range_placeholder),
            Object::Integer(byte_range_placeholder),
            Object::Integer(byte_range_placeholder),
        ]),
        "Contents" => Object::String(
            vec![0u8; SIGNATURE_PLACEHOLDER_BYTES],
            StringFormat::Hexadecimal,
        ),
        "M" => signing_time,
        "Reason" => Object::string_literal("Documento firmado digitalmente"),
    };
    incremental
        .new_document
        .set_object(sig_id, Object::Dictionary(sig_dict));

    let widget_dict = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Widget",
        "FT" => "Sig",
        "Rect" => Object::Array(vec![
            Object::Integer(0),
            Object::Integer(0),
            Object::Integer(0),
            Object::Integer(0),
        ]),
        // Flag "Print" (4). El Rect es 0x0, así que el campo no se ve en
        // pantalla ni al imprimir; solo existe para portar la firma.
        "F" => Object::Integer(4),
        "V" => Object::Reference(sig_id),
        "P" => Object::Reference(page_id),
        "T" => Object::string_literal("Signature1"),
    };
    incremental
        .new_document
        .set_object(widget_id, Object::Dictionary(widget_dict));

    // --- 4. Enlazar el Widget a la página y al AcroForm ---------------------
    append_reference_to_array_field(&mut incremental, page_id, b"Annots", widget_id)?;

    let acroform_id = get_or_create_acroform(&mut incremental, root_id)?;
    append_reference_to_array_field(&mut incremental, acroform_id, b"Fields", widget_id)?;
    {
        let acroform_dict = incremental
            .new_document
            .get_object_mut(acroform_id)?
            .as_dict_mut()?;
        // Bit 1 (Signatures Exist) | Bit 2 (Append Only).
        acroform_dict.set("SigFlags", Object::Integer(3));
    }

    // --- 5. Serializar con los placeholders todavía en blanco ---------------
    let mut buffer = Vec::new();
    incremental.save_to(&mut buffer)?;

    // Nota: `IncrementalDocument::save_to` (lopdf 0.34) inserta una línea
    // extra "%PDF-x.y" entre la revisión anterior y los nuevos objetos.
    // Fuera de la posición 0 del archivo, cualquier línea que empiece con
    // '%' es un *comentario* según ISO 32000-1 §7.2.3, así que los lectores
    // conformes la ignoran; se deja tal cual a propósito porque los offsets
    // del xref que lopdf ya escribió en `buffer` la dan por existente —
    // quitarla correría todos los offsets posteriores y rompería el archivo.

    let search_from = incremental.get_prev_documents_bytes().len();

    // --- 6. Ubicar los placeholders de /Contents y /ByteRange ---------------
    let mut contents_marker = Vec::with_capacity(SIGNATURE_PLACEHOLDER_BYTES * 2 + 2);
    contents_marker.push(b'<');
    contents_marker.extend(std::iter::repeat(b'0').take(SIGNATURE_PLACEHOLDER_BYTES * 2));
    contents_marker.push(b'>');
    let contents_pos = find_subslice(&buffer[search_from..], &contents_marker)
        .ok_or("No se pudo ubicar el placeholder de /Contents en el PDF generado")?
        + search_from;
    let contents_hex_start = contents_pos + 1; // justo después de '<'
    let contents_hex_end = contents_pos + contents_marker.len() - 1; // posición de '>'

    let byte_range_marker = format!("{p} {p} {p}", p = byte_range_placeholder).into_bytes();
    let byte_range_pos = find_subslice(&buffer[search_from..], &byte_range_marker)
        .ok_or("No se pudo ubicar el placeholder de /ByteRange en el PDF generado")?
        + search_from;

    // --- 7. Calcular el /ByteRange real y sobrescribirlo (mismo ancho) ------
    let total_len = buffer.len();
    let range_values = [
        contents_pos as i64,
        (contents_hex_end + 1) as i64,
        (total_len - (contents_hex_end + 1)) as i64,
    ];
    for (i, value) in range_values.into_iter().enumerate() {
        let text = format!("{:0width$}", value, width = BYTE_RANGE_DIGIT_WIDTH);
        if text.len() != BYTE_RANGE_DIGIT_WIDTH {
            return Err(format!(
                "El PDF (>{BYTE_RANGE_DIGIT_WIDTH} dígitos) excede el ancho reservado para /ByteRange"
            )
            .into());
        }
        let start = byte_range_pos + i * (BYTE_RANGE_DIGIT_WIDTH + 1);
        buffer[start..start + BYTE_RANGE_DIGIT_WIDTH].copy_from_slice(text.as_bytes());
    }

    // --- 8. Hashear/firmar exactamente los bytes cubiertos por /ByteRange ---
    let mut signed_content = Vec::with_capacity(total_len - SIGNATURE_PLACEHOLDER_BYTES * 2);
    signed_content.extend_from_slice(&buffer[0..contents_pos]);
    signed_content.extend_from_slice(&buffer[contents_hex_end + 1..]);

    // DETACHED: el contenido no se re-incluye dentro del PKCS#7 (ya está en
    // el propio PDF). BINARY: evita que OpenSSL intente "normalizar" saltos
    // de línea como si fuera texto S/MIME. Al no pasar NOATTR, se agregan
    // los atributos firmados (contentType + messageDigest), tal como espera
    // adbe.pkcs7.detached.
    let pkcs7 = Pkcs7::sign(
        &signer_cert,
        &signer_key,
        &chain,
        &signed_content,
        Pkcs7Flags::DETACHED | Pkcs7Flags::BINARY,
    )?;
    let der = pkcs7.to_der()?;
    if der.len() > SIGNATURE_PLACEHOLDER_BYTES {
        return Err(format!(
            "La firma PKCS#7 ({} bytes) no cabe en el espacio reservado ({} bytes); \
             sube SIGNATURE_PLACEHOLDER_BYTES y vuelve a firmar",
            der.len(),
            SIGNATURE_PLACEHOLDER_BYTES
        )
        .into());
    }

    // --- 9. Volcar la firma en hex (mayúsculas) dentro del placeholder ------
    let mut hex = String::with_capacity(SIGNATURE_PLACEHOLDER_BYTES * 2);
    for byte in &der {
        hex.push_str(&format!("{byte:02X}"));
    }
    // Relleno con ceros: un lector de PDF ubica el fin real de la firma
    // parseando el propio DER (que declara su longitud), así que los bytes
    // 00 sobrantes al final del hex se ignoran sin problema.
    while hex.len() < SIGNATURE_PLACEHOLDER_BYTES * 2 {
        hex.push('0');
    }
    buffer[contents_hex_start..contents_hex_end].copy_from_slice(hex.as_bytes());

    Ok(buffer)
}

/// Encuentra el `id` del `/AcroForm` del catálogo, clonándolo al documento
/// nuevo si ya existía (por referencia o inline), o creando uno vacío si no
/// existía.
pub(crate) fn get_or_create_acroform(
    incremental: &mut IncrementalDocument,
    root_id: ObjectId,
) -> Result<ObjectId, Box<dyn Error>> {
    let existing = incremental
        .new_document
        .get_object(root_id)?
        .as_dict()?
        .get(b"AcroForm")
        .ok()
        .cloned();

    let acroform_id = match existing {
        Some(Object::Reference(af_id)) => {
            incremental.opt_clone_object_to_new_document(af_id)?;
            af_id
        }
        Some(Object::Dictionary(inline_dict)) => {
            // Caso raro: /AcroForm embebido directamente en el catálogo en
            // vez de como referencia indirecta. Se promueve a objeto propio
            // para poder actualizarlo de forma incremental.
            let af_id = incremental
                .new_document
                .add_object(Object::Dictionary(inline_dict));
            incremental
                .new_document
                .get_object_mut(root_id)?
                .as_dict_mut()?
                .set("AcroForm", Object::Reference(af_id));
            af_id
        }
        _ => {
            let af_id = incremental.new_document.new_object_id();
            incremental
                .new_document
                .set_object(af_id, Object::Dictionary(Dictionary::new()));
            incremental
                .new_document
                .get_object_mut(root_id)?
                .as_dict_mut()?
                .set("AcroForm", Object::Reference(af_id));
            af_id
        }
    };
    Ok(acroform_id)
}

/// Agrega `Object::Reference(new_ref)` al arreglo guardado bajo `field` en el
/// diccionario `container_id`, sin importar si ese arreglo está inline o es
/// una referencia indirecta, y creándolo si todavía no existe.
pub(crate) fn append_reference_to_array_field(
    incremental: &mut IncrementalDocument,
    container_id: ObjectId,
    field: &[u8],
    new_ref: ObjectId,
) -> Result<(), Box<dyn Error>> {
    let existing = incremental
        .new_document
        .get_object(container_id)?
        .as_dict()?
        .get(field)
        .ok()
        .cloned();

    match existing {
        Some(Object::Reference(array_ref)) => {
            incremental.opt_clone_object_to_new_document(array_ref)?;
            let arr = incremental
                .new_document
                .get_object_mut(array_ref)?
                .as_array_mut()?;
            arr.push(Object::Reference(new_ref));
        }
        Some(Object::Array(mut arr)) => {
            arr.push(Object::Reference(new_ref));
            incremental
                .new_document
                .get_object_mut(container_id)?
                .as_dict_mut()?
                .set(field.to_vec(), Object::Array(arr));
        }
        _ => {
            incremental
                .new_document
                .get_object_mut(container_id)?
                .as_dict_mut()?
                .set(
                    field.to_vec(),
                    Object::Array(vec![Object::Reference(new_ref)]),
                );
        }
    }
    Ok(())
}

/// Busca la primera aparición de `needle` dentro de `haystack` y devuelve su
/// offset. Devuelve `None` si `needle` está vacío o no aparece.
pub(crate) fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}
