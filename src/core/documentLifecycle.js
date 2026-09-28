import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { showAlert, showConfirm } from '../modules/confirmModal.js';
import { isDirty, setDirty } from '../modules/state.js';
import { t } from '../modules/translations.js';
import { closeDocument, loadDocument } from './pdfViewer.js';
import { setupDragAndDrop } from '../ui/windowControls.js';

export function setupDocumentLifecycle(appWindow) {
    let currentPdfPath = null;
    const openButton = document.getElementById('btn-open-pdf');
    const closeButton = document.getElementById('menu-close-pdf');

    openButton?.addEventListener('click', async () => {
        hideMainMenu();
        if (!(await confirmDiscardChanges())) return;

        try {
            const selectedPath = await open({
                multiple: false,
                filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });
            if (selectedPath) await openDocumentFromPath(selectedPath);
        } catch (error) {
            console.error(error);
            await showAlert(t('alert.title.error'), t('alert.error_open'), 'error');
        }
    });

    closeButton?.addEventListener('click', async () => {
        hideMainMenu();
        if (!(await confirmDiscardChanges())) return;

        await closeDocument();
        currentPdfPath = null;
        closeButton.style.display = 'none';
        setDirty(false);
    });

    setupDragAndDrop(appWindow, async (path, pdfBytes) => {
        if (!(await confirmDiscardChanges())) return;
        currentPdfPath = path;
        showCloseButton();
        await loadDocument(pdfBytes);
    });

    void openInitialDocument();

    return {
        getCurrentPdfPath: () => currentPdfPath
    };

    async function confirmDiscardChanges() {
        if (!isDirty) return true;
        return showConfirm(
            t('alert.title.unsaved'),
            t('alert.unsaved_close_doc'),
            t('alert.close_without_saving'),
            t('modal.btn.cancel')
        );
    }

    async function openDocumentFromPath(path) {
        console.log('Archivo seleccionado:', path);
        currentPdfPath = path;
        showCloseButton();
        const pdfBytes = await invoke('read_pdf', { path });
        await loadDocument(new Uint8Array(pdfBytes));
    }

    async function openInitialDocument() {
        try {
            const initialPath = await invoke('get_initial_pdf');
            if (!initialPath) return;

            console.log('Archivo inicial detectado:', initialPath);
            currentPdfPath = initialPath;
            showCloseButton();
            const pdfBytes = await invoke('read_pdf', { path: initialPath });
            await loadDocument(new Uint8Array(pdfBytes));
        } catch (error) {
            console.error('Error al cargar PDF inicial:', error);
        }
    }

    function showCloseButton() {
        if (closeButton) closeButton.style.display = 'block';
    }

    function hideMainMenu() {
        const menu = document.getElementById('main-menu-dropdown');
        if (menu) menu.style.display = 'none';
    }
}
