import { t } from '../translations.js';
import { renderVaults } from './vault.js';
import { promptPassword, promptNewPassword } from './passwordModal.js';
import { showAlert, showConfirm } from '../confirmModal.js';


export function setupIdentity() {
    const btnNewIdentity = document.getElementById('btn-new-identity');
    const stampModal = document.getElementById('stamp-modal');
    const inputName = document.getElementById('stamp-input-name');
    const inputDetail = document.getElementById('stamp-input-detail');
    const inputExtra = document.getElementById('stamp-input-extra');
    const btnCancelStamp = document.getElementById('btn-cancel-stamp');
    const btnGenerateStamp = document.getElementById('btn-generate-stamp');
    const esignVault = document.getElementById('esign-vault');

    if (!btnNewIdentity) return;

    btnNewIdentity.addEventListener('click', () => {
        stampModal.style.display = 'flex';
        inputName.value = '';
        inputDetail.value = '';
        if (inputExtra) inputExtra.value = '';
        inputName.focus();
    });

    const btnSignPfx = document.getElementById('btn-sign-pfx');
    if (btnSignPfx) {
        btnSignPfx.addEventListener('click', () => signCurrentPdfWithPfx());
    }

    btnCancelStamp.addEventListener('click', () => {
        stampModal.style.display = 'none';
    });

    btnGenerateStamp.addEventListener('click', () => {
        void onGenerateStamp({ inputName, inputDetail, inputExtra, stampModal, esignVault });
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

    if (stateModule.isDirty) {
        const wantsToSave = await showConfirm(
            t('alert.title.unsaved'),
            t('alert.unsaved_sign'),
            t('alert.btn_continue'),
            t('modal.btn.cancel')
        );
        if (!wantsToSave) return;
        await savePdf(pdfViewer.currentPdfPath);
    }

    await signAndExport({ invoke, showAlert, pdfViewer, pfxPath, password });
}

/**
 * Firma el PDF actualmente abierto con el .pfx/contraseña dados, y pregunta
 * dónde guardar el PDF firmado resultante. Compartido entre el botón de la
 * toolbar (signCurrentPdfWithPfx) y el botón 🔐 de cada identidad en la
 * bóveda (vault.js).
 */
export async function signAndExport({ invoke, showAlert: alertFn, pdfViewer, pfxPath, password }) {
    const notifyAlert = alertFn || showAlert;
    try {
        const currentPath = pdfViewer.currentPdfPath || window.currentPdfPath;
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

async function onGenerateStamp({ inputName, inputDetail, inputExtra, stampModal, esignVault }) {
    const name = inputName.value.trim();
    if (!name) return;
    const detail = inputDetail.value.trim();
    const extra = inputExtra ? inputExtra.value.trim() : '';

    stampModal.style.display = 'none';

    const stampCanvas = document.createElement('canvas');
    stampCanvas.width = 700;
    stampCanvas.height = 200;
    const sCtx = stampCanvas.getContext('2d');
    sCtx.scale(2, 2);

    // Fondo y borde
    sCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    sCtx.fillRect(0, 0, 350, 100);
    sCtx.strokeStyle = '#003399';
    sCtx.lineWidth = 2;
    sCtx.strokeRect(1, 1, 348, 98);

    const drawBody = (withLogo) => {
        if (withLogo) {
            sCtx.fillStyle = '#003399';
            sCtx.font = 'italic 12px "Segoe Script", cursive, Arial';
            sCtx.fillText('InkIt', 18, 75);
            sCtx.fillText(t('stamp.verified'), 10, 88);
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
        sCtx.font = 'bold 16px Arial';
        sCtx.fillText(t('stamp.signed_by'), 75, 25);
        sCtx.font = 'bold 16px Arial';
        sCtx.fillStyle = '#003399';
        sCtx.fillText(name, 75, 45);

        sCtx.fillStyle = '#333333';
        sCtx.font = '11px Arial';
        const dateStr = new Date().toLocaleString();
        sCtx.fillText(`${t('stamp.date_label')} ${dateStr}`, 75, 60);
        if (detail) sCtx.fillText(detail, 75, 75);
        if (extra) sCtx.fillText(extra, 75, 90);
    };

    // --- Único punto donde se genera el sello + (opcionalmente) el .pfx ----
    // Antes este bloque estaba duplicado: una copia dentro del callback de
    // éxito de la carga del logo, y otra dentro del fallback por si el logo
    // no cargaba. Ahora `drawBody` decide solo el detalle visual (logo o
    // ícono), y este bloque de guardado corre una sola vez.
    const finalizeStamp = async () => {
        const dataUrl = stampCanvas.toDataURL('image/png');
        let saved = JSON.parse(localStorage.getItem('inkit_esigns') || '[]');

        // --- Generar versión FOOTER ---
        const dateStr = new Date().toLocaleString();
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
        fCtx.font = 'bold 16px Arial';
        fCtx.fillText(`${t('stamp.signed_by_electronic')} ${name} ${detail ? '- ' + detail : ''}`, 20, 25);
        fCtx.fillStyle = '#333333';
        fCtx.font = '12px Arial';
        fCtx.fillText(`${t('stamp.footer_date_label')} ${dateStr} | ${t('stamp.footer_verified')} | ${extra}`, 20, 45);
        
        // Agregar el logo de InkIt a la derecha con imagen real
        await new Promise((resolve) => {
            const logo = new Image();
            logo.onload = () => {
                fCtx.drawImage(logo, 730, 5, 50, 50);
                resolve();
            };
            logo.onerror = resolve;
            logo.src = '/InkIt_Logo.png';
        });
        
        fCtx.fillStyle = '#003399';
        fCtx.font = 'italic 20px "Segoe Script", cursive, Arial';
        fCtx.fillText('InkIt', 650, 30);
        fCtx.font = '12px Arial';
        fCtx.fillText('VERIFIED', 655, 45);

        const footerDataUrl = footerCanvas.toDataURL('image/png');
        // ------------------------------

        const password = await promptNewPassword(
            t('modal.pfx_new.title'),
            t('modal.pfx_new.hint')
        );

        if (password !== null && password.trim() !== '') {
            const { documentDir, join } = await import('@tauri-apps/api/path');
            const { mkdir } = await import('@tauri-apps/plugin-fs');
            const { invoke } = await import('@tauri-apps/api/core');

            const docsPath = await documentDir();
            const folderPath = await join(docsPath, 'InkIt', 'Identities');
            await mkdir(folderPath, { recursive: true });

            const outPath = await join(folderPath, `${name.replace(/\s+/g, '_')}_Identity.pfx`);

            if (outPath) {
                try {
                    await invoke('create_pfx', { name, detail, password, outPath });
                    saved.push({ dataUrl, pfxPath: outPath, footerDataUrl, name, detail, extra });
                } catch (e) {
                    console.error(e);
                    await showAlert('InkIt', t('alert.error_create_cert') + e, 'error');
                    saved.push({ dataUrl, footerDataUrl, name, detail, extra });
                }
            } else {
                saved.push({ dataUrl, footerDataUrl, name, detail, extra });
            }
        } else {
            saved.push({ dataUrl, footerDataUrl, name, detail, extra });
        }

        localStorage.setItem('inkit_esigns', JSON.stringify(saved));
        renderVaults();
        if (esignVault) esignVault.style.display = 'flex';
    };

    const logoImg = new Image();
    logoImg.src = '/InkIt_Logo.png';
    logoImg.onload = () => {
        sCtx.drawImage(logoImg, 10, 15, 45, 45);
        drawBody(true);
        void finalizeStamp();
    };
    logoImg.onerror = () => {
        drawBody(false);
        void finalizeStamp();
    };
}



