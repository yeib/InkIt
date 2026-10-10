import { t } from '../translations.js';
import { renderVaults, getEsignLang, setEsignLang } from './vault.js';
import { promptPassword, promptNewPassword } from './passwordModal.js';
import { showAlert, showConfirm } from '../confirmModal.js';

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

export function setupIdentity() {
    const btnNewIdentity = document.getElementById('btn-new-identity');
    const btnImportIdentity = document.getElementById('btn-import-identity');
    const btnEsignLangEs = document.getElementById('btn-esign-lang-es');
    const btnEsignLangEn = document.getElementById('btn-esign-lang-en');

    const stampModal = document.getElementById('stamp-modal');
    const tabPfxCreate = document.getElementById('tab-pfx-create');
    const tabPfxImport = document.getElementById('tab-pfx-import');
    const pfxCreateSection = document.getElementById('pfx-create-section');
    const pfxImportSection = document.getElementById('pfx-import-section');
    const stampModalHeading = document.getElementById('stamp-modal-heading');
    const stampModalDesc = document.getElementById('stamp-modal-desc');

    const inputName = document.getElementById('stamp-input-name');
    const inputDetail = document.getElementById('stamp-input-detail');
    const inputExtra = document.getElementById('stamp-input-extra');

    const btnBrowsePfx = document.getElementById('btn-browse-pfx');
    const pfxChosenFilename = document.getElementById('pfx-chosen-filename');
    const pfxImportName = document.getElementById('pfx-import-name');
    const pfxImportDetail = document.getElementById('pfx-import-detail');
    const pfxImportExtra = document.getElementById('pfx-import-extra');

    const btnCancelStamp = document.getElementById('btn-cancel-stamp');
    const btnGenerateStamp = document.getElementById('btn-generate-stamp');
    const esignVault = document.getElementById('esign-vault');

    let currentTab = 'create';
    let selectedPfxPath = null;

    function setTab(tab) {
        currentTab = tab;
        if (tab === 'create') {
            tabPfxCreate?.classList.add('active');
            tabPfxImport?.classList.remove('active');
            if (pfxCreateSection) pfxCreateSection.style.display = 'flex';
            if (pfxImportSection) pfxImportSection.style.display = 'none';
            if (stampModalHeading) stampModalHeading.textContent = t('modal.stamp.title');
            if (stampModalDesc) stampModalDesc.textContent = t('modal.stamp.desc');
            if (btnGenerateStamp) btnGenerateStamp.textContent = t('modal.btn.generate');
        } else {
            tabPfxImport?.classList.add('active');
            tabPfxCreate?.classList.remove('active');
            if (pfxImportSection) pfxImportSection.style.display = 'flex';
            if (pfxCreateSection) pfxCreateSection.style.display = 'none';
            if (stampModalHeading) stampModalHeading.textContent = t('modal.pfx.tab_import');
            if (stampModalDesc) stampModalDesc.textContent = t('modal.pfx.hint');
            if (btnGenerateStamp) btnGenerateStamp.textContent = t('modal.btn.import');
        }
    }

    tabPfxCreate?.addEventListener('click', () => setTab('create'));
    tabPfxImport?.addEventListener('click', () => setTab('import'));

    // Selector de idioma e-Sign
    btnEsignLangEs?.addEventListener('click', (e) => {
        e.stopPropagation();
        setEsignLang('es');
    });
    btnEsignLangEn?.addEventListener('click', (e) => {
        e.stopPropagation();
        setEsignLang('en');
    });

    if (btnNewIdentity) {
        btnNewIdentity.addEventListener('click', () => {
            setTab('create');
            if (stampModal) stampModal.style.display = 'flex';
            if (inputName) inputName.value = '';
            if (inputDetail) inputDetail.value = '';
            if (inputExtra) inputExtra.value = '';
            inputName?.focus();
        });
    }

    async function pickPfxFile() {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
            multiple: false,
            filters: [{ name: 'PKCS#12 Certificate', extensions: ['pfx', 'p12'] }]
        });
        if (!selected) return null;

        selectedPfxPath = selected;
        const fileName = selected.split(/[/\\]/).pop() || '';
        const cleanName = fileName.replace(/\.(pfx|p12)$/i, '').replace(/_/g, ' ') || 'Certificado';

        if (pfxChosenFilename) {
            pfxChosenFilename.textContent = fileName;
            pfxChosenFilename.style.color = '#10b981';
        }
        if (pfxImportName) pfxImportName.value = cleanName;
        return selected;
    }

    btnBrowsePfx?.addEventListener('click', async () => {
        await pickPfxFile();
    });

    btnImportIdentity?.addEventListener('click', async () => {
        const picked = await pickPfxFile();
        if (!picked) return;
        setTab('import');
        if (stampModal) stampModal.style.display = 'flex';
        pfxImportName?.focus();
    });

    const btnSignPfx = document.getElementById('btn-sign-pfx');
    if (btnSignPfx) {
        btnSignPfx.addEventListener('click', () => signCurrentPdfWithPfx());
    }

    btnCancelStamp?.addEventListener('click', () => {
        if (stampModal) stampModal.style.display = 'none';
    });

    btnGenerateStamp?.addEventListener('click', () => {
        if (currentTab === 'create') {
            void onGenerateStamp({ inputName, inputDetail, inputExtra, stampModal, esignVault });
        } else {
            void onImportPfxStamp({
                pfxImportName,
                pfxImportDetail,
                pfxImportExtra,
                selectedPfxPath,
                stampModal,
                esignVault
            });
        }
    });
}

/**
 * Flujo de "Firmar con .pfx existente" (botón dedicado en la toolbar, fuera
 * de la bóveda). Abre selector de .pfx, pide contraseña, firma el PDF
 * abierto y pide dónde guardar el resultado.
 */
async function signCurrentPdfWithPfx() {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const { savePdf } = await import('../../core/pdfExport.js');

    const pfxPath = await open({
        multiple: false,
        filters: [{ name: 'PKCS#12 Certificate', extensions: ['pfx', 'p12'] }]
    });
    if (!pfxPath) return;

    const password = await promptPassword(t('modal.pfx.title'), t('modal.pfx.hint'));
    if (password === null) return;

    const stateModule = await import('../../modules/state.js');
    const pdfViewer = await import('../../core/pdfViewer.js');

    let pathToSign = pdfViewer?.getCurrentPdfPath?.() || pdfViewer?.currentPdfPath || window.currentPdfPath;
    if (stateModule.isDirty) {
        const wantsToSave = await showConfirm(
            t('alert.title.unsaved'),
            t('alert.unsaved_sign'),
            t('alert.btn_continue'),
            t('modal.btn.cancel')
        );
        if (!wantsToSave) return;
        const savedPath = await savePdf(pathToSign);
        if (!savedPath) return;
        pathToSign = savedPath;
    }

    await signAndExport({ invoke, showAlert, pdfViewer, pfxPath, password, targetPdfPath: pathToSign });
}

/**
 * Firma el PDF actualmente abierto con el .pfx/contraseña dados, y pregunta
 * dónde guardar el PDF firmado resultante. Compartido entre el botón de la
 * toolbar (signCurrentPdfWithPfx) y el botón 🔐 de cada identidad en la
 * bóveda (vault.js).
 */
export async function signAndExport({ invoke, showAlert: alertFn, pdfViewer, pfxPath, password, targetPdfPath }) {
    const notifyAlert = alertFn || showAlert;
    try {
        const currentPath = targetPdfPath || pdfViewer?.getCurrentPdfPath?.() || pdfViewer?.currentPdfPath || window.currentPdfPath;
        if (!currentPath) {
            await notifyAlert('InkIt', t('alert.open_first_sign'), 'warning');
            return;
        }

        const signedBytes = await invoke('sign_pdf', {
            pdfPath: currentPath,
            pfxPath: pfxPath,
            pfxPassword: password
        });

        const { documentDir, join, basename } = await import('@tauri-apps/api/path');
        const { mkdir } = await import('@tauri-apps/plugin-fs');

        const docsPath = await documentDir();
        const signedFolder = await join(docsPath, 'InkIt', 'Signed');
        await mkdir(signedFolder, { recursive: true });

        const originalName = await basename(currentPath);
        const newName = originalName.replace('.pdf', `_signed_${Date.now()}.pdf`);
        const targetPath = await join(signedFolder, newName);

        if (targetPath) {
            await invoke('save_file', { path: targetPath, contents: signedBytes });
            await notifyAlert('InkIt', `${t('alert.signed_saved')}\n${targetPath}`, 'info');
        }
    } catch (err) {
        console.error(err);
        await notifyAlert('InkIt', t('alert.error_sign') + err, 'error');
    }
}

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

    const logo = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = '/InkIt_Logo.png';
    });

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

    const logo = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = '/InkIt_Logo.png';
    });

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

async function onGenerateStamp({ inputName, inputDetail, inputExtra, stampModal, esignVault }) {
    const name = inputName.value.trim();
    if (!name) return;
    const detail = inputDetail.value.trim();
    const extra = inputExtra ? inputExtra.value.trim() : '';

    stampModal.style.display = 'none';

    try {
        const now = new Date();
        const { getEsignLang } = await import('./vault.js');
        const activeLang = getEsignLang();

        const [dataUrlEs, footerDataUrlEs, dataUrlEn, footerDataUrlEn] = await Promise.all([
            generateVisualStamp({ name, detail, extra }, now, 'es'),
            generateFooterStamp({ name, detail, extra }, now, 'es'),
            generateVisualStamp({ name, detail, extra }, now, 'en'),
            generateFooterStamp({ name, detail, extra }, now, 'en')
        ]);

        let saved = JSON.parse(localStorage.getItem('inkit_esigns') || '[]');

        const password = await promptNewPassword(
            t('modal.pfx_new.title'),
            t('modal.pfx_new.hint')
        );

        let outPath = null;
        if (password !== null && password.trim() !== '') {
            const { documentDir, join } = await import('@tauri-apps/api/path');
            const { mkdir } = await import('@tauri-apps/plugin-fs');
            const { invoke } = await import('@tauri-apps/api/core');

            const docsPath = await documentDir();
            const folderPath = await join(docsPath, 'InkIt', 'Identities');
            await mkdir(folderPath, { recursive: true });

            outPath = await join(folderPath, `${name.replace(/\s+/g, '_')}_Identity.pfx`);

            if (outPath) {
                try {
                    await invoke('create_pfx', { name, detail, password, outPath });
                } catch (e) {
                    console.error(e);
                    await showAlert('InkIt', t('alert.error_create_cert') + e, 'error');
                    outPath = null;
                }
            }
        }

        saved.push({
            name,
            detail,
            extra,
            pfxPath: outPath,
            dataUrl: activeLang === 'en' ? dataUrlEn : dataUrlEs,
            footerDataUrl: activeLang === 'en' ? footerDataUrlEn : footerDataUrlEs,
            dataUrlEs,
            footerDataUrlEs,
            dataUrlEn,
            footerDataUrlEn
        });

        localStorage.setItem('inkit_esigns', JSON.stringify(saved));
        renderVaults();
        if (esignVault) esignVault.style.display = 'flex';
    } catch (err) {
        console.error('Error generando identidad:', err);
        await showAlert('InkIt', t('alert.error_create_cert') + err, 'error');
    }
}

async function onImportPfxStamp({
    pfxImportName,
    pfxImportDetail,
    pfxImportExtra,
    selectedPfxPath,
    stampModal,
    esignVault
}) {
    if (!selectedPfxPath) {
        await showAlert('InkIt', t('modal.pfx.no_file'), 'warning');
        return;
    }
    const name = pfxImportName.value.trim();
    if (!name) {
        await showAlert('InkIt', t('modal.stamp.name'), 'warning');
        return;
    }
    const detail = pfxImportDetail.value.trim();
    const extra = pfxImportExtra ? pfxImportExtra.value.trim() : '';

    stampModal.style.display = 'none';

    try {
        const now = new Date();
        const { getEsignLang } = await import('./vault.js');
        const activeLang = getEsignLang();

        const [dataUrlEs, footerDataUrlEs, dataUrlEn, footerDataUrlEn] = await Promise.all([
            generateVisualStamp({ name, detail, extra }, now, 'es'),
            generateFooterStamp({ name, detail, extra }, now, 'es'),
            generateVisualStamp({ name, detail, extra }, now, 'en'),
            generateFooterStamp({ name, detail, extra }, now, 'en')
        ]);

        let saved = JSON.parse(localStorage.getItem('inkit_esigns') || '[]');
        saved.push({
            name,
            detail,
            extra,
            pfxPath: selectedPfxPath,
            dataUrl: activeLang === 'en' ? dataUrlEn : dataUrlEs,
            footerDataUrl: activeLang === 'en' ? footerDataUrlEn : footerDataUrlEs,
            dataUrlEs,
            footerDataUrlEs,
            dataUrlEn,
            footerDataUrlEn
        });

        localStorage.setItem('inkit_esigns', JSON.stringify(saved));
        renderVaults();
        if (esignVault) esignVault.style.display = 'flex';
        await showAlert('InkIt', t('alert.pfx_imported'), 'info');
    } catch (err) {
        console.error('Error al importar certificado:', err);
        await showAlert('InkIt', t('alert.error_pfx_import') + err, 'error');
    }
}



