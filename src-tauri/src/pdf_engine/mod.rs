//! Motor PDF de InkIt.
//!
//! Se divide en tres dominios independientes:
//!
//! - [`flatten`]: aplanado visual (imágenes, texto, resaltados y modo oscuro)
//!   sobre un PDF existente usando `lopdf`.
//! - [`pfx`]: generación de identidades digitales autofirmadas (PKCS#12).
//! - [`signer`]: firma criptográfica PAdES / PKCS#7 *detached* mediante
//!   actualización incremental.
//!
//! La API pública que consume `lib.rs` se re-exporta aquí, de modo que los
//! imports existentes (`pdf_engine::FlattenRecipe`, `pdf_engine::generate_pfx`,
//! etc.) siguen funcionando sin cambios.

pub mod flatten;
pub mod pfx;
pub mod signer;

pub use flatten::{process_flatten, FlattenRecipe, PageConfig, PdfOperation, Point};
pub use pfx::{generate_pfx, inspect_pfx_bytes, PfxIdentityInfo};
pub use signer::sign_pdf_pkcs12;
