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
    
    // Configurar Window Controls
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
            if (!currentPdfPath) {
                await message(t('alert.open_first'), { title: 'InkIt', kind: 'warning' });
                return;
            }

            try {
                const { annotations } = await import('./modules/typewriter.js');
                const { imageAnnotations } = await import('./modules/signatures.js');
                
                const payload = {
                    texts: annotations,
                    images: imageAnnotations
                };

                const targetPath = await save({
                    filters: [{ name: 'PDF', extensions: ['pdf'] }],
                    defaultPath: currentPdfPath.replace('.pdf', '_inkit.pdf')
                });

                if (targetPath) {
                    const { PDFDocument, rgb } = await import('pdf-lib');
                    
                    // 1. Leer el archivo PDF original desde Rust para evitar restricciones de permisos del frontend
                    const pdfBytes = await invoke('read_pdf', { path: currentPdfPath });
                    const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBytes));
                    
                    // Función auxiliar para convertir hex a rgb
                    const hexToRgb = (hex) => {
                        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return result ? rgb(parseInt(result[1], 16)/255, parseInt(result[2], 16)/255, parseInt(result[3], 16)/255) : rgb(0,0,0);
                    };

                    // 2. Procesar e incrustar imágenes
                    for (const imgAnno of imageAnnotations) {
                        const page = pdfDoc.getPage(imgAnno.pageNum - 1);
                        const { height: pageHeight } = page.getSize();
                        
                        // Extraer solo la parte de los datos base64
                        const b64Data = imgAnno.dataUrl.split(',')[1];
                        const img = await pdfDoc.embedPng(b64Data);
                        
                        // En pdf-lib el sistema de coordenadas Y empieza abajo, así que invertimos Y
                        const pdfY = pageHeight - imgAnno.y - imgAnno.height;
                        
                        page.drawImage(img, {
                            x: imgAnno.x,
                            y: pdfY,
                            width: imgAnno.width,
                            height: imgAnno.height,
                        });
                    }

                    // 2.5 Procesar highlights
                    for (const hl of highlightAnnotations) {
                        const page = pdfDoc.getPage(hl.pageNum - 1);
                        const { height: pageHeight } = page.getSize();
                        
                        if (hl.points.length > 1) {
                            let pathData = `M ${hl.points[0].x} ${pageHeight - hl.points[0].y}`;
                            for (let i = 1; i < hl.points.length; i++) {
                                pathData += ` L ${hl.points[i].x} ${pageHeight - hl.points[i].y}`;
                            }
                            
                            // Parse rgba to pdf-lib rgb and extract opacity
                            let r = 1, g = 1, b = 0, opacity = 0.4;
                            const rgbaMatch = hl.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                            if (rgbaMatch) {
                                r = parseInt(rgbaMatch[1]) / 255;
                                g = parseInt(rgbaMatch[2]) / 255;
                                b = parseInt(rgbaMatch[3]) / 255;
                                opacity = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1.0;
                            }
                            
                            page.drawSvgPath(pathData, {
                                borderColor: rgb(r, g, b),
                                borderWidth: 15,
                                borderOpacity: opacity,
                                color: undefined // sin relleno
                            });
                        }
                    }

                    // 3. Procesar e incrustar textos
                    for (const textAnno of annotations) {
                        const page = pdfDoc.getPage(textAnno.pageNum - 1);
                        const { height: pageHeight } = page.getSize();
                        
                        const pdfY = pageHeight - textAnno.y - textAnno.fontSize;
                        
                        if (textAnno.bgColor && textAnno.bgColor !== 'transparent') {
                            const estimatedWidth = textAnno.text.length * (textAnno.fontSize * 0.55);
                            let r=1, g=1, b=1;
                            if (textAnno.bgColor === 'black') { r=0; g=0; b=0; }
                            else if (textAnno.bgColor === 'gray') { r=0.94; g=0.94; b=0.94; }
                            page.drawRectangle({
                                x: textAnno.x - 2,
                                y: pdfY - 2,
                                width: estimatedWidth + 4,
                                height: textAnno.fontSize + 4,
                                color: rgb(r, g, b),
                            });
                        }

                        page.drawText(textAnno.text, {
                            x: textAnno.x,
                            y: pdfY,
                            size: textAnno.fontSize,
                            color: hexToRgb(textAnno.color),
                        });
                    }

                    // 4. Guardar archivo final
                    const pdfBytesFinal = await pdfDoc.save();
                    // Usamos Rust para guardar y evitar problemas de permisos de fs en frontend
                    await invoke('save_file', { path: targetPath, contents: Array.from(pdfBytesFinal) });
                    
                    await message(t('alert.saved'), { title: 'InkIt', kind: 'info' });
                }
            } catch (error) {
                console.error('Error guardando PDF:', error);
                await message(t('alert.error_save') + error, { title: t('alert.title.error'), kind: 'error' });
            }
        });

        document.getElementById('menu-print')?.addEventListener('click', () => {
            mainMenuDropdown.style.display = 'none';
            window.print();
        });
        
        document.getElementById('menu-export-png')?.addEventListener('click', async () => {
            mainMenuDropdown.style.display = 'none';
            if (!currentPdfPath) {
                await message(t('alert.open_first_export'), { title: t('alert.title.attention'), kind: 'warning' });
                return;
            }

            try {
                // Obtener el módulo de visor para llamar a nuestra nueva función
                const { exportCurrentPageAsPng } = await import('./core/pdfViewer.js');
                const base64Data = await exportCurrentPageAsPng();

                const targetPath = await save({
                    filters: [{ name: 'PNG Image', extensions: ['png'] }],
                    defaultPath: currentPdfPath.replace('.pdf', '_page.png')
                });

                if (targetPath) {
                    const binaryString = window.atob(base64Data);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    // Usamos Rust para guardar y evitar permisos
                    await invoke('save_file', { path: targetPath, contents: Array.from(bytes) });
                    await message(t('alert.exported'), { title: 'InkIt', kind: 'info' });
                }
            } catch (error) {
                console.error('Error exportando:', error);
                await message(t('alert.error_export') + error.message, { title: t('alert.title.error'), kind: 'error' });
            }
        });

        document.getElementById('menu-settings')?.addEventListener('click', () => {
            document.getElementById('settings-modal').style.display = 'flex';
            mainMenuDropdown.style.display = 'none';
        });
    }
    
    document.getElementById('btn-settings-close')?.addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'none';
    });

    // Settings Logic
    const settingDarkMode = document.getElementById('setting-dark-mode');
    const settingHighQuality = document.getElementById('setting-high-quality');
    
    // Load from localStorage
    const savedSettings = JSON.parse(localStorage.getItem('inkit_settings') || '{"darkMode": false, "highQuality": true, "autoFlatten": true}');
    if (settingDarkMode) settingDarkMode.checked = savedSettings.darkMode;
    if (settingHighQuality) settingHighQuality.checked = savedSettings.highQuality;
    document.getElementById('setting-auto-flatten').checked = savedSettings.autoFlatten;

    const applySettings = () => {
        // Guardar
        localStorage.setItem('inkit_settings', JSON.stringify({
            darkMode: settingDarkMode.checked,
            highQuality: settingHighQuality.checked,
            autoFlatten: document.getElementById('setting-auto-flatten').checked
        }));



        // Aplicar Modo Oscuro a los canvas de PDF
        const viewer = document.getElementById('pdf-viewer');
        if (settingDarkMode.checked) {
            viewer.classList.add('dark-pdf-mode');
        } else {
            viewer.classList.remove('dark-pdf-mode');
        }
    };

    // Apply on startup and change
    applySettings();
    document.querySelectorAll('.glass-checkbox').forEach(cb => {
        cb.addEventListener('change', applySettings);
    });

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

    // Handle Drag & Drop with Tauri v2
    try {
        getCurrentWindow().onDragDropEvent(async (event) => {
            if (event.payload.type === 'drop') {
                const paths = event.payload.paths;
                if (paths && paths.length > 0) {
                    const selectedPath = paths[0];
                    if (selectedPath.toLowerCase().endsWith('.pdf')) {
                        console.log("PDF Dropped:", selectedPath);
                        currentPdfPath = selectedPath;
                        try {
                            const pdfBytes = await invoke('read_pdf', { path: selectedPath });
                            const uint8Array = new Uint8Array(pdfBytes);
                            await loadDocument(uint8Array);
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
                    currentPdfPath = file.name;
                    await loadDocument(new Uint8Array(arrayBuffer));
                } catch (err) {
                    console.error("Error loading HTML5 dropped PDF:", err);
                }
            }
        }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
});
