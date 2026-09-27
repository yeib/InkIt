import { invoke } from '@tauri-apps/api/core';
import { save, message } from '@tauri-apps/plugin-dialog';
import { t } from '../modules/translations.js';

export async function savePdf(currentPdfPath) {
    if (!currentPdfPath) {
        await message(t('alert.open_first'), { title: 'InkIt', kind: 'warning' });
        return;
    }

    try {
        const { annotations } = await import('../modules/typewriter.js');
        const { imageAnnotations } = await import('../modules/signatures.js');
        const { highlightAnnotations } = await import('../modules/highlights.js');
        const { documentDir, join, basename } = await import('@tauri-apps/api/path');
        const { mkdir } = await import('@tauri-apps/plugin-fs');

        const docsPath = await documentDir();
        const editedFolder = await join(docsPath, 'InkIt', 'Edited');
        await mkdir(editedFolder, { recursive: true });

        const originalName = await basename(currentPdfPath);
        const newName = originalName.replace('.pdf', `_inkit_${Date.now()}.pdf`);
        const targetPath = await join(editedFolder, newName);

        if (targetPath) {
            let operations = [];

            // 1. Imágenes (Firmas/Sellos)
            for (const imgAnno of imageAnnotations) {
                operations.push({
                    type: "image",
                    page: imgAnno.pageNum,
                    x: imgAnno.x,
                    y: imgAnno.y,
                    width: imgAnno.width,
                    height: imgAnno.height,
                    base64_data: imgAnno.dataUrl
                });
            }

            // 2. Highlights (Resaltador)
            for (const hl of highlightAnnotations) {
                if (hl.points.length > 1) {
                    let r = 250, g = 204, b = 21, opacity = 0.4;
                    const rgbaMatch = hl.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                    if (rgbaMatch) {
                        r = parseInt(rgbaMatch[1]);
                        g = parseInt(rgbaMatch[2]);
                        b = parseInt(rgbaMatch[3]);
                        opacity = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1.0;
                    }
                    const hexColor = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
                    
                    operations.push({
                        type: "highlight",
                        page: hl.pageNum,
                        points: hl.points.map(p => ({ x: p.x, y: p.y })),
                        color: hexColor,
                        opacity: opacity
                    });
                }
            }

            // 3. Textos (Typewriter)
            for (const textAnno of annotations) {
                let bgColor = null;
                if (textAnno.bgColor && textAnno.bgColor !== 'transparent') {
                    if (textAnno.bgColor === 'black') bgColor = "#000000";
                    else if (textAnno.bgColor === 'gray') bgColor = "#f0f0f0";
                    else if (textAnno.bgColor === 'white') bgColor = "#ffffff";
                    else bgColor = textAnno.bgColor;
                }

                // Invertir automáticamente texto negro si el fondo es negro
                let finalColor = textAnno.color;
                if (textAnno.bgColor === 'black' && textAnno.color === '#000000') {
                    finalColor = '#ffffff';
                }

                operations.push({
                    type: "text",
                    page: textAnno.pageNum,
                    x: textAnno.x,
                    y: textAnno.y,
                    text: textAnno.text,
                    font_size: textAnno.fontSize,
                    color: finalColor,
                    bg_color: bgColor
                });
            }

            const recipe = {
                file_path: currentPdfPath,
                output_path: targetPath,
                pages_config: [], 
                operations: operations
            };

            // Pasamos "La Receta" al motor nativo en Rust
            await invoke('flatten_pdf', { recipe });
            
            const { setDirty } = await import('../modules/state.js');
            setDirty(false);
            
            // Show toast instead of blocking dialog
            showToast(t('alert.saved') || 'Documento guardado', targetPath);
        }
    } catch (error) {
        console.error('Error guardando PDF:', error);
        await message(t('alert.error_save') + error, { title: t('alert.title.error'), kind: 'error' });
    }
}

function showToast(msg, path) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'glass-panel';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '8px';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '12px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    toast.style.animation = 'fadeIn 0.3s ease-out';
    toast.style.background = 'rgba(20, 20, 20, 0.85)';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.1)';

    const text = document.createElement('span');
    text.textContent = msg;
    text.style.color = '#fff';
    text.style.fontSize = '13px';

    const btn = document.createElement('button');
    btn.className = 'btn-glass primary';
    const btnText = document.documentElement.lang === 'es' || document.documentElement.lang === 'es-ES' ? 'Ver Archivo' : 'Show File';
    btn.textContent = btnText;
    btn.style.padding = '4px 12px';
    btn.style.fontSize = '12px';
    btn.onclick = async () => {
        try {
            await invoke('open_file', { path });
        } catch(e) { console.error(e); }
    };

    toast.appendChild(text);
    toast.appendChild(btn);
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 280);
    }, 5000);
}

export async function exportPng(currentPdfPath) {
    if (!currentPdfPath) {
        await message(t('alert.open_first_export'), { title: t('alert.title.attention'), kind: 'warning' });
        return;
    }

    try {
        // Obtener el módulo de visor para llamar a nuestra nueva función
        const { exportCurrentPageAsPng } = await import('./pdfViewer.js');
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
}

