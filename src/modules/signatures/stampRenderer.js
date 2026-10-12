/**
 * stampRenderer.js
 *
 * Renderizado gráfico de los sellos de firma en Canvas 2D.
 * Lógica pura: no toca modales, DOM de la app, LocalStorage ni Tauri IPC.
 */

/** Textos localizados que se dibujan dentro de los sellos. */
export const SEAL_TEXTS = {
    es: {
        signedBy: 'Firmado digitalmente por:',
        date: 'Fecha:',
        electronicSignedBy: 'Firmado electrónicamente por:',
        cryptoValidation: 'Validación criptográfica PAdES / PKCS#7',
        verified: 'VERIFIED',
        verifiedIdentity: 'Identidad verificada mediante criptografía de clave pública'
    },
    en: {
        signedBy: 'Digitally signed by:',
        date: 'Date:',
        electronicSignedBy: 'Digitally signed by:',
        cryptoValidation: 'PAdES / PKCS#7 Cryptographic Validation',
        verified: 'VERIFIED',
        verifiedIdentity: 'Identity verified by public key cryptography'
    }
};

/**
 * Formatea una fecha para el sello: `DD/MM/YYYY HH:mm:ss` (es) o `MM/DD/YYYY HH:mm:ss` (en).
 * @param {Date} [date=new Date()] Fecha a formatear.
 * @param {'es'|'en'} [lang='es'] Idioma del formato.
 * @returns {string}
 */
export function formatStampDate(date = new Date(), lang = 'es') {
    const pad = (n) => n.toString().padStart(2, '0');
    const d = pad(date.getDate());
    const m = pad(date.getMonth() + 1);
    const y = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return lang === 'en'
        ? `${m}/${d}/${y} ${hours}:${minutes}:${seconds}`
        : `${d}/${m}/${y} ${hours}:${minutes}:${seconds}`;
}

/**
 * Carga el logo de InkIt. Resuelve `null` si no se puede cargar.
 * @returns {Promise<HTMLImageElement|null>}
 */
function loadLogo() {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = '/InkIt_Logo.png';
    });
}

/**
 * Genera el sello visual rectangular (con logo) de una identidad.
 * @param {{ name: string, detail?: string, extra?: string }} identity Datos mostrados en el sello.
 * @param {Date} [date=new Date()] Fecha impresa en el sello.
 * @param {'es'|'en'} [lang='es'] Idioma de los textos del sello.
 * @returns {Promise<string>} Data URL PNG del sello.
 */
export async function generateVisualStamp({ name, detail = '', extra = '' }, date = new Date(), lang = 'es') {
    const texts = SEAL_TEXTS[lang] || SEAL_TEXTS.es;
    const stampCanvas = document.createElement('canvas');
    stampCanvas.width = 700;
    stampCanvas.height = 200;
    const sCtx = stampCanvas.getContext('2d');
    sCtx.scale(2, 2);

    sCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    sCtx.fillRect(0, 0, 350, 100);
    sCtx.strokeStyle = '#003399';
    sCtx.lineWidth = 2;
    sCtx.strokeRect(1, 1, 348, 98);

    const logo = await loadLogo();

    if (logo) {
        sCtx.drawImage(logo, 10, 12, 45, 45);
        sCtx.textAlign = 'center';
        sCtx.fillStyle = '#003399';
        sCtx.font = 'italic 12px "Segoe Script", cursive, Arial';
        sCtx.fillText('InkIt', 32, 72);
        sCtx.font = 'bold 8.5px Arial';
        sCtx.fillText(texts.verified, 32, 85);
        sCtx.textAlign = 'left';
    } else {
        sCtx.fillStyle = '#003399';
        sCtx.font = '36px Arial';
        sCtx.fillText('🖋️', 15, 60);
    }

    sCtx.beginPath();
    sCtx.moveTo(65, 10);
    sCtx.lineTo(65, 90);
    sCtx.stroke();

    sCtx.fillStyle = '#000000';
    sCtx.font = 'bold 15px Arial';
    sCtx.fillText(texts.signedBy, 75, 25);
    sCtx.font = 'bold 16px Arial';
    sCtx.fillStyle = '#003399';
    sCtx.fillText(name, 75, 45);

    sCtx.fillStyle = '#333333';
    sCtx.font = '11px Arial';
    const dateStr = formatStampDate(date, lang);
    sCtx.fillText(`${texts.date} ${dateStr}`, 75, 60);
    if (detail) sCtx.fillText(detail, 75, 75);
    if (extra) {
        sCtx.fillText(extra, 75, 90);
    } else {
        sCtx.font = 'italic 9.5px Arial';
        sCtx.fillStyle = '#64748b';
        sCtx.fillText(texts.cryptoValidation, 75, 90);
    }

    return stampCanvas.toDataURL('image/png');
}

/**
 * Genera el sello de pie de página (franja horizontal) de una identidad.
 * @param {{ name: string, detail?: string, extra?: string }} identity Datos mostrados en el sello.
 * @param {Date} [date=new Date()] Fecha impresa en el sello.
 * @param {'es'|'en'} [lang='es'] Idioma de los textos del sello.
 * @returns {Promise<string>} Data URL PNG del sello.
 */
export async function generateFooterStamp({ name, detail = '', extra = '' }, date = new Date(), lang = 'es') {
    const texts = SEAL_TEXTS[lang] || SEAL_TEXTS.es;
    const footerCanvas = document.createElement('canvas');
    footerCanvas.width = 1600;
    footerCanvas.height = 120;
    const fCtx = footerCanvas.getContext('2d');
    fCtx.scale(2, 2);

    fCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    fCtx.fillRect(0, 0, 800, 60);
    fCtx.strokeStyle = '#003399';
    fCtx.lineWidth = 2;
    fCtx.beginPath();
    fCtx.moveTo(0, 0);
    fCtx.lineTo(800, 0);
    fCtx.stroke();

    fCtx.fillStyle = '#003399';
    fCtx.font = 'bold 15px Arial';
    fCtx.fillText(`${texts.electronicSignedBy} ${name} ${detail ? '- ' + detail : ''}`, 20, 25);
    fCtx.fillStyle = '#333333';
    fCtx.font = '11px Arial';
    const dateStr = formatStampDate(date, lang);
    const extraPart = extra ? ` | ${extra}` : '';
    fCtx.fillText(`${texts.date} ${dateStr} | ${texts.verifiedIdentity}${extraPart}`, 20, 45);

    const logo = await loadLogo();

    if (logo) {
        fCtx.drawImage(logo, 730, 5, 50, 50);
    }
    fCtx.fillStyle = '#003399';
    fCtx.textAlign = 'right';
    fCtx.font = 'italic 18px "Segoe Script", cursive, Arial';
    fCtx.fillText('InkIt', 720, 28);
    fCtx.font = 'bold 9px Arial';
    fCtx.fillText(texts.verified, 720, 43);
    fCtx.textAlign = 'left';

    return footerCanvas.toDataURL('image/png');
}
