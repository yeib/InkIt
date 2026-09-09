// InkIt - Frontend Entry Point
console.log("InkIt Inicializado: Yeib Ecosystem");

import { invoke } from '@tauri-apps/api/core';
import { open, save, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { initPdfViewer, loadDocument } from './core/pdfViewer.js';
import { initTypewriter } from './modules/typewriter.js';
import { initSignatures } from './modules/signatures.js';

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
                await message('Abre un PDF primero antes de guardar.', { title: 'InkIt', kind: 'warning' });
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

                    // 3. Procesar e incrustar textos
                    for (const textAnno of annotations) {
                        const page = pdfDoc.getPage(textAnno.pageNum - 1);
                        const { height: pageHeight } = page.getSize();
                        
                        const pdfY = pageHeight - textAnno.y - textAnno.fontSize;
                        
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
                    
                    await message('PDF Aplanado guardado exitosamente!', { title: 'InkIt', kind: 'info' });
                }
            } catch (error) {
                console.error('Error guardando PDF:', error);
                await message('Error al guardar: ' + error, { title: 'Error', kind: 'error' });
            }
        });

        document.getElementById('menu-print')?.addEventListener('click', () => {
            mainMenuDropdown.style.display = 'none';
            window.print();
        });
        
        document.getElementById('menu-export-png')?.addEventListener('click', async () => {
            mainMenuDropdown.style.display = 'none';
            if (!currentPdfPath) {
                await message('Abre un PDF primero para poder exportar.', { title: 'Atención', kind: 'warning' });
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
                    
                    await message('Página exportada con éxito como PNG.', { title: 'InkIt', kind: 'info' });
                }
            } catch (error) {
                console.error('Error exportando PNG:', error);
                await message('Error al exportar: ' + error.message, { title: 'Error', kind: 'error' });
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
    const btnSign = document.getElementById('btn-sign');

    const updateToolButtons = (activeBtnId) => {
        [btnPointer, btnTypewriter, btnSign].forEach(btn => {
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
        });
    }

    if (btnTypewriter) {
        btnTypewriter.addEventListener('click', () => {
            updateToolButtons('btn-typewriter');
            if (window.disableSignatures) window.disableSignatures();
        });
    }

    if (btnSign) {
        btnSign.addEventListener('click', () => {
            updateToolButtons('btn-sign');
            if (window.disableTypewriter) window.disableTypewriter();
        });
    }

    // Inicializar el visor de PDF (HTML Canvas container)
    await initPdfViewer('pdf-viewer');
    
    // Inicializar herramienta Typewriter
    initTypewriter('pdf-viewer');
    
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
        } catch (error) {
            console.error("Error en flujo de apertura:", error);
            await message('Hubo un error al abrir el documento.', { title: 'Error', kind: 'error' });
        }
    });
});
