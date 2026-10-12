/**
 * identity.js
 *
 * Gestión del modal de identidades (crear sello / importar .pfx) y guardado
 * de las identidades en LocalStorage (`inkit_esigns`).
 *
 * El renderizado de sellos vive en `stampRenderer.js` y la firma criptográfica
 * en `signService.js`; ambos se re-exportan aquí para mantener la
 * compatibilidad con `vault.js`, `footer.js` y `signatures.js`.
 */
import { t } from '../translations.js';
import { renderVaults, getEsignLang, setEsignLang } from './vault.js';
import { promptNewPassword } from './passwordModal.js';
import { showAlert } from '../confirmModal.js';
import { generateVisualStamp, generateFooterStamp } from './stampRenderer.js';
import { signCurrentPdfWithPfx } from './signService.js';

export { SEAL_TEXTS, formatStampDate, generateVisualStamp, generateFooterStamp } from './stampRenderer.js';
export { signAndExport } from './signService.js';

/**
 * Enlaza el modal de identidades, el selector de idioma e-Sign y el botón
 * "Firmar con .pfx" de la toolbar.
 * @returns {void}
 */
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
    const pfxImportPassword = document.getElementById('pfx-import-password');

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
            if (pfxImportPassword) pfxImportPassword.value = '';
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

    /**
     * Abre el selector de archivos .pfx/.p12, guarda la ruta elegida y
     * rellena el nombre sugerido en el formulario de importación.
     * @returns {Promise<string|null>} Ruta elegida, o `null` si se canceló.
     */
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
        pfxImportPassword?.focus();
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
        pfxImportPassword?.focus();
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
                pfxImportPassword,
                selectedPfxPath,
                stampModal,
                esignVault
            });
        }
    });
}

/**
 * Genera los sellos (es/en) de una identidad nueva, crea opcionalmente su
 * certificado .pfx protegido con contraseña y guarda todo en LocalStorage.
 * @param {object} els Elementos del DOM del modal.
 * @returns {Promise<void>}
 */
async function onGenerateStamp({ inputName, inputDetail, inputExtra, stampModal, esignVault }) {
    const name = inputName.value.trim();
    if (!name) return;
    const detail = inputDetail.value.trim();
    const extra = inputExtra ? inputExtra.value.trim() : '';

    stampModal.style.display = 'none';

    try {
        const now = new Date();
        const activeLang = getEsignLang();

        const [dataUrlEs, footerDataUrlEs, dataUrlEn, footerDataUrlEn] = await Promise.all([
            generateVisualStamp({ name, detail, extra }, now, 'es'),
            generateFooterStamp({ name, detail, extra }, now, 'es'),
            generateVisualStamp({ name, detail, extra }, now, 'en'),
            generateFooterStamp({ name, detail, extra }, now, 'en')
        ]);

        const saved = JSON.parse(localStorage.getItem('inkit_esigns') || '[]');

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

/**
 * Valida la contraseña del .pfx con Rust, extrae automáticamente su
 * identidad (CN y organización/email), genera los sellos y guarda la
 * identidad en LocalStorage.
 * @param {object} params
 * @param {HTMLInputElement} params.pfxImportPassword Campo de contraseña.
 * @param {string|null} params.selectedPfxPath Ruta del archivo .pfx elegido.
 * @param {HTMLElement} params.stampModal Modal de sellos.
 * @param {HTMLElement} params.esignVault Contenedor de la bóveda e-Sign.
 * @returns {Promise<void>}
 */
async function onImportPfxStamp({
    pfxImportPassword,
    selectedPfxPath,
    stampModal,
    esignVault
}) {
    if (!selectedPfxPath) {
        await showAlert('InkIt', t('modal.pfx.no_file'), 'warning');
        return;
    }
    const password = pfxImportPassword ? pfxImportPassword.value : '';
    if (!password) {
        await showAlert('InkIt', t('modal.pw.empty'), 'warning');
        pfxImportPassword?.focus();
        return;
    }

    const { invoke } = await import('@tauri-apps/api/core');

    let certInfo;
    try {
        certInfo = await invoke('inspect_pfx', {
            pfxPath: selectedPfxPath,
            password
        });
    } catch (err) {
        console.warn('Error inspeccionando PFX:', err);
        const errStr = String(err || '');
        let msg = t('alert.pfx_wrong_pw');
        if (errStr.includes('INVALID_PFX')) {
            msg = t('alert.pfx_invalid');
        } else if (errStr.includes('MISSING_CERT')) {
            msg = t('alert.pfx_missing_cert');
        } else if (errStr.includes('WRONG_PASSWORD')) {
            msg = t('alert.pfx_wrong_pw');
        }
        await showAlert('InkIt', msg, 'error');
        pfxImportPassword?.select();
        pfxImportPassword?.focus();
        return;
    }

    stampModal.style.display = 'none';

    try {
        const name = certInfo.name || 'Certificado';
        const detail = certInfo.detail || '';
        const extra = '';
        const now = new Date();
        const activeLang = getEsignLang();

        const [dataUrlEs, footerDataUrlEs, dataUrlEn, footerDataUrlEn] = await Promise.all([
            generateVisualStamp({ name, detail, extra }, now, 'es'),
            generateFooterStamp({ name, detail, extra }, now, 'es'),
            generateVisualStamp({ name, detail, extra }, now, 'en'),
            generateFooterStamp({ name, detail, extra }, now, 'en')
        ]);

        const saved = JSON.parse(localStorage.getItem('inkit_esigns') || '[]');
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
