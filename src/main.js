// InkIt - Frontend Entry Point
console.log("InkIt Inicializado: Yeib Ecosystem");

import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { initPdfViewer, loadDocument } from './core/pdfViewer.js';
import { initTypewriter } from './modules/typewriter.js';
import { initSignatures } from './modules/signatures.js';

let currentPdfPath = null;

document.addEventListener('DOMContentLoaded', async () => {
    const appWindow = getCurrentWindow();
    
    // Configurar Window Controls
    document.getElementById('titlebar-minimize')?.addEventListener('click', () => appWindow.minimize());
    document.getElementById('titlebar-maximize')?.addEventListener('click', () => appWindow.toggleMaximize());
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
                alert('Abre un PDF primero antes de guardar.');
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
                    
                    alert('PDF Aplanado guardado exitosamente!');
                }
            } catch (error) {
                console.error('Error guardando PDF:', error);
                alert('Error al guardar: ' + error);
            }
        });

        document.getElementById('menu-print')?.addEventListener('click', () => {
            mainMenuDropdown.style.display = 'none';
            window.print();
        });
        
        document.getElementById('menu-export-png')?.addEventListener('click', async () => {
            mainMenuDropdown.style.display = 'none';
            if (!currentPdfPath) {
                alert('Abre un PDF primero para poder exportar.');
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
                    
                    alert('Página exportada con éxito como PNG.');
                }
            } catch (error) {
                console.error('Error exportando PNG:', error);
                alert('Error al exportar: ' + error.message);
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
            alert("Hubo un error al abrir el documento.");
        }
    });
});
