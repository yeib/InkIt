/**
 * signService.js
 *
 * Orquestación de la firma criptográfica de PDFs: diálogos (selector .pfx,
 * contraseña, confirmación de guardado previo), llamadas IPC a Tauri
 * (`sign_pdf`, `save_file`) y alertas al usuario.
 */
import { t } from '../translations.js';
import { promptPassword } from './passwordModal.js';
import { showAlert, showConfirm } from '../confirmModal.js';

/**
 * Flujo de "Firmar con .pfx existente" (botón dedicado en la toolbar, fuera
 * de la bóveda). Abre selector de .pfx, pide contraseña, firma el PDF
 * abierto y guarda el resultado en Documentos/InkIt/Signed.
 * Si hay cambios sin guardar, pide confirmación y guarda antes de firmar.
 * @returns {Promise<void>}
 */
export async function signCurrentPdfWithPfx() {
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
 * Firma el PDF indicado (o el actualmente abierto) con el .pfx/contraseña
 * dados y lo guarda en Documentos/InkIt/Signed. Compartido entre el botón de
 * la toolbar (`signCurrentPdfWithPfx`) y el botón 🔐 de cada identidad en la
 * bóveda (vault.js).
 * @param {object} params
 * @param {Function} params.invoke Función `invoke` de Tauri.
 * @param {Function} [params.showAlert] Función de alertas; por defecto `showAlert` de confirmModal.
 * @param {object} [params.pdfViewer] Módulo pdfViewer, usado para resolver la ruta del PDF abierto.
 * @param {string} params.pfxPath Ruta del certificado .pfx/.p12.
 * @param {string} params.password Contraseña del certificado.
 * @param {string} [params.targetPdfPath] Ruta del PDF a firmar; si falta se usa el PDF abierto.
 * @returns {Promise<void>}
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
