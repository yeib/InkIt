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

    const handleClose = async () => {
        const { isDirty } = await import("../modules/state.js");
        if (isDirty) {
            const wantsToClose = await showCustomConfirm();
            if (wantsToClose) {
                appWindow.destroy();
            }
        } else {
            appWindow.close();
        }
    };

    document.getElementById("titlebar-close")?.addEventListener("click", handleClose);

    appWindow.onCloseRequested(async (event) => {
        const { isDirty } = await import("../modules/state.js");
        if (isDirty) {
            event.preventDefault();
            const wantsToClose = await showCustomConfirm();
            if (wantsToClose) {
                appWindow.destroy();
            }
        }
    });
    // Bloquear men contextual de Edge (clic derecho) para que se sienta nativo
    document.addEventListener("contextmenu", e => {
        if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA" && !e.target.isContentEditable) {
            e.preventDefault();
        }
    });

    // Bloquear F5 y Ctrl+R para evitar reinicio accidental de la app
    document.addEventListener("keydown", e => {
        if (e.key === "F5" || (e.ctrlKey && (e.key === "r" || e.key === "R")) || (e.metaKey && (e.key === "r" || e.key === "R"))) {
            e.preventDefault();
        }
    });
}

function showCustomConfirm() {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.style.display = "flex";
        overlay.style.zIndex = "99999";

        const content = document.createElement("div");
        content.className = "modal-content glass-panel";
        content.style.minWidth = "350px";
        content.style.textAlign = "center";

        const isEn = document.documentElement.lang === "en" || document.documentElement.lang === "en-US";
        const title = isEn ? "⚠️ Unsaved Changes" : "⚠️ Cambios sin guardar";
        const msg = isEn 
            ? "You have unsaved changes. Are you sure you want to exit and lose them?" 
            : "Hay cambios sin guardar. ¿Seguro que deseas salir y perder los cambios?";
        const btnCancelText = isEn ? "Cancel" : "Cancelar";
        const btnQuitText = isEn ? "Exit without saving" : "Salir sin guardar";

        content.innerHTML = `
            <h3>${title}</h3>
            <p style="margin: 16px 0; color: rgba(255,255,255,0.8); font-size: 14px;">${msg}</p>
            <div class="modal-actions" style="margin-top: 24px; justify-content: space-around;">
                <button class="btn-glass" id="btn-custom-cancel">${btnCancelText}</button>
                <button class="btn-glass primary" id="btn-custom-quit" style="background: rgba(255, 107, 107, 0.2); border: 1px solid rgba(255, 107, 107, 0.5); color: #ff6b6b;">${btnQuitText}</button>
            </div>
        `;

        overlay.appendChild(content);
        document.body.appendChild(overlay);

        document.getElementById("btn-custom-cancel").onclick = () => {
            overlay.remove();
            resolve(false);
        };
        
        document.getElementById("btn-custom-quit").onclick = () => {
            overlay.remove();
            resolve(true);
        };
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
