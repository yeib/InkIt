import { message } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { t } from '../modules/translations.js';

export function setupWindowControls(appWindow) {
    document.getElementById('titlebar-minimize')?.addEventListener('click', () => appWindow.minimize());
    
    const maxBtn = document.getElementById('titlebar-maximize');
    const updateMaxIcon = async () => {
        if (!maxBtn) return;
        const isMax = await appWindow.isMaximized();
        if (isMax) {
            maxBtn.innerHTML = '<svg viewBox="0 0 10 10"><path d="M 2,2 L 8,2 L 8,8 L 2,8 Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M 4,2 L 4,0 L 10,0 L 10,6 L 8,6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
        } else {
            maxBtn.innerHTML = '<svg viewBox="0 0 10 10"><path d="M 0,0 0,10 10,10 10,0 Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
        }
    };
    
    maxBtn?.addEventListener('click', async () => {
        await appWindow.toggleMaximize();
        setTimeout(updateMaxIcon, 100);
    });
    
    appWindow.onResized(updateMaxIcon);

    document.getElementById('titlebar-close')?.addEventListener('click', () => appWindow.close());

    // Bloquear menú contextual de Edge (clic derecho) para que se sienta nativo
    document.addEventListener('contextmenu', e => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.isContentEditable) {
            e.preventDefault();
        }
    });
}

export function setupDragAndDrop(appWindow, onFileLoaded) {
    // Handle Drag & Drop with Tauri v2
    try {
        appWindow.onDragDropEvent(async (event) => {
            if (event.payload.type === 'drop') {
                const paths = event.payload.paths;
                if (paths && paths.length > 0) {
                    const selectedPath = paths[0];
                    if (selectedPath.toLowerCase().endsWith('.pdf')) {
                        console.log("PDF Dropped:", selectedPath);
                        try {
                            const pdfBytes = await invoke('read_pdf', { path: selectedPath });
                            const uint8Array = new Uint8Array(pdfBytes);
                            onFileLoaded(selectedPath, uint8Array);
                        } catch (e) {
                            console.error("Error loading dropped PDF:", e);
                            await message(t('alert.error_open'), { title: t('alert.title.error'), kind: 'error' });
                        }
                    } else {
                        await message("Only PDF files are supported.", { title: "InkIt", kind: 'warning' });
                    }
                }
            }
        });
    } catch (e) {
        console.warn('Tauri window listener error', e);
    }

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    onFileLoaded(file.name, new Uint8Array(arrayBuffer));
                } catch (err) {
                    console.error("Error loading HTML5 dropped PDF:", err);
                }
            }
        }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
}
