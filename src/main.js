// InkIt - Frontend Entry Point
console.log("InkIt Inicializado: Yeib Ecosystem");

import { invoke } from '@tauri-apps/api/core';
import { open, save, message } from '@tauri-apps/plugin-dialog';
import { getVersion } from '@tauri-apps/api/app';
import { applyTranslations, setLang, getLang, t } from './modules/translations.js';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { initSignatures, imageAnnotations, renderImageAnnotationsForPage } from './modules/signatures.js';
import { initHighlights, highlightAnnotations } from "./modules/highlights.js";
import { initTypewriter, renderAnnotationsForPage, annotations, updateAnnotationsMode } from './modules/typewriter.js';
import { initHistoryUI } from "./modules/history_ui.js";
import { globalHistory } from './modules/history.js';
import { getGlobalState, restoreGlobalState } from './modules/state.js';
import { initPdfViewer, loadDocument } from "./core/pdfViewer.js";
import { getCurrentWindow } from '@tauri-apps/api/window';

// Setup language early
const langSelect = document.getElementById('setting-language');
langSelect.value = getLang();
applyTranslations();

langSelect.addEventListener('change', (e) => {
    setLang(e.target.value);
});

// Setup Version
async function setupVersion() {
    try {
        const version = await getVersion();
        document.getElementById('app-version-display').innerText = `InkIt v${version}`;
        document.getElementById('about-app-version').innerText = `v${version}`;
    } catch (e) {
        console.error("No se pudo obtener la versión de Tauri:", e);
    }
}
setupVersion();

// Setup About Modal
const aboutModal = document.getElementById('about-modal');
document.getElementById('menu-about').addEventListener('click', () => {
    document.getElementById('main-menu-dropdown').style.display = 'none';
    aboutModal.style.display = 'flex';
});
document.getElementById('btn-about-close').addEventListener('click', () => {
    aboutModal.style.display = 'none';
});


let currentPdfPath = null;

document.addEventListener('DOMContentLoaded', async () => {
    const appWindow = getCurrentWindow();
    
    const { setupWindowControls } = await import('./ui/windowControls.js');
    setupWindowControls(appWindow);

    // Configurar Hamburger Menu
    const btnMainMenu = document.getElementById('btn-main-menu');
    const mainMenuDropdown = document.getElementById('main-menu-dropdown');
    
    if (btnMainMenu && mainMenuDropdown) {
        btnMainMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = mainMenuDropdown.style.display === 'flex';
            mainMenuDropdown.style.display = isVisible ? 'none' : 'flex';
        });
        
        // Cerrar menú al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!mainMenuDropdown.contains(e.target) && e.target !== btnMainMenu) {
                mainMenuDropdown.style.display = 'none';
            }
        });

        // Configurar botones del menú
        document.getElementById('menu-save-as')?.addEventListener('click', async () => {
            mainMenuDropdown.style.display = 'none';
            const { savePdf } = await import('./core/pdfExport.js');
            await savePdf(currentPdfPath);
        });

        document.getElementById('menu-print')?.addEventListener('click', () => {
            mainMenuDropdown.style.display = 'none';
            window.print();
        });
        
        document.getElementById('menu-export-png')?.addEventListener('click', async () => {
            mainMenuDropdown.style.display = 'none';
            const { exportPng } = await import('./core/pdfExport.js');
            await exportPng(currentPdfPath);
        });

        document.getElementById('menu-settings')?.addEventListener('click', () => {
            document.getElementById('settings-modal').style.display = 'flex';
            mainMenuDropdown.style.display = 'none';
        });
    }
    
    document.getElementById('btn-settings-close')?.addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'none';
    });

    const { setupSettings } = await import('./ui/theme.js');
    setupSettings();

    // Manejo unificado de Herramientas (Radio Buttons)
    const btnPointer = document.getElementById('btn-pointer');
    const btnTypewriter = document.getElementById('btn-typewriter');
    const btnStamp = document.getElementById('btn-stamp');
    const btnEsign = document.getElementById('btn-esign');
    const btnHighlight = document.getElementById('btn-highlight');

    const updateToolButtons = (activeBtnId) => {
        [btnPointer, btnTypewriter, btnStamp, btnEsign, btnHighlight].forEach(btn => {
            if (btn && btn.id === activeBtnId) {
                btn.classList.add('primary');
            } else if (btn) {
                btn.classList.remove('primary');
            }
        });
    };

    if (btnPointer) {
        btnPointer.addEventListener('click', () => {
            updateToolButtons('btn-pointer');
            if (window.disableTypewriter) window.disableTypewriter();
            if (window.disableSignatures) window.disableSignatures();
            if (window.disableHighlights) window.disableHighlights();
            import('./modules/typewriter.js').then(m => m.updateAnnotationsMode('pointer'));
        });
    }

    if (btnTypewriter) {
        btnTypewriter.addEventListener('click', () => {
            updateToolButtons('btn-typewriter');
            if (window.disableSignatures) window.disableSignatures();
            if (window.disableHighlights) window.disableHighlights();
            import('./modules/typewriter.js').then(m => m.updateAnnotationsMode('typewriter'));
        });
    }

    if (btnHighlight) {
        btnHighlight.addEventListener('click', () => {
            updateToolButtons('btn-highlight');
            if (window.disableTypewriter) window.disableTypewriter();
            if (window.disableSignatures) window.disableSignatures();
            import('./modules/typewriter.js').then(m => m.updateAnnotationsMode('pointer'));
            if (window.enableHighlights) window.enableHighlights();
        });
    }

    if (btnStamp) {
        btnStamp.addEventListener('click', () => {
            // Allow deselecting the active tool button
            if (btnStamp.classList.contains('primary')) {
                updateToolButtons('btn-pointer');
                if (window.disableSignatures) window.disableSignatures();
                import('./modules/typewriter.js').then(m => m.updateAnnotationsMode('pointer'));
                return;
            }
            updateToolButtons('btn-stamp');
            if (window.disableTypewriter) window.disableTypewriter();
            if (window.disableHighlights) window.disableHighlights();
            import('./modules/typewriter.js').then(m => m.updateAnnotationsMode('pointer'));
            // Note: btnStamp listener in signatures.js will open the vault
        });
    }
    
    if (btnEsign) {
        btnEsign.addEventListener('click', () => {
            if (btnEsign.classList.contains('primary')) {
                updateToolButtons('btn-pointer');
                if (window.disableSignatures) window.disableSignatures();
                import('./modules/typewriter.js').then(m => m.updateAnnotationsMode('pointer'));
                return;
            }
            updateToolButtons('btn-esign');
            if (window.disableTypewriter) window.disableTypewriter();
            if (window.disableHighlights) window.disableHighlights();
            import('./modules/typewriter.js').then(m => m.updateAnnotationsMode('pointer'));
            // Note: btnEsign listener in signatures.js will open the vault
        });
    }

    // Inicializar el visor de PDF (HTML Canvas container)
    await initPdfViewer('pdf-viewer');
    
    // Inicializar herramienta Typewriter
    initTypewriter('pdf-viewer');
    initHighlights('pdf-viewer');
    
    // Inicializar Bóveda de Firmas
    initSignatures('pdf-viewer');
    
    // Inicialización de componentes UI
    const btnOpenPdf = document.getElementById('btn-open-pdf');
    
    btnOpenPdf.addEventListener('click', async () => {
        try {
            const selectedPath = await open({
                multiple: false,
                filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });
            
            if (selectedPath) {
                console.log("Archivo seleccionado:", selectedPath);
                currentPdfPath = selectedPath;
                
                const pdfBytes = await invoke('read_pdf', { path: selectedPath });
                const uint8Array = new Uint8Array(pdfBytes);
                await loadDocument(uint8Array);
            }
        } catch (e) {
            console.error(e);
            await message(t('alert.error_open'), { title: t('alert.title.error'), kind: 'error' });
        }
    });

    const { setupDragAndDrop } = await import('./ui/windowControls.js');
    setupDragAndDrop(appWindow, async (path, uint8Array) => {
        currentPdfPath = path;
        await loadDocument(uint8Array);
    });
});
