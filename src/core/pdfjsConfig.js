import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

/**
 * Devuelve los parámetros de carga para `pdfjsLib.getDocument` con soporte
 * completo para decodificadores WASM (OpenJPEG/JPX, JBIG2, QCMS),
 * tablas CMap empaquetadas y fuentes PDF estándar.
 */
export function getPdfJsDocumentParams(customParams) {
    const origin =
        typeof window !== 'undefined' && window.location.origin
            ? window.location.origin
            : 'http://tauri.localhost';

    const base = `${origin}/pdfjs/`;

    return {
        ...customParams,
        wasmUrl: `${base}wasm/`,
        cMapUrl: `${base}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${base}standard_fonts/`
    };
}
