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
        
        const targetPath = await save({
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
            defaultPath: currentPdfPath.replace('.pdf', '_inkit.pdf')
        });

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
                    const xs = hl.points.map(p => p.x);
                    const ys = hl.points.map(p => p.y);
                    const minX = Math.min(...xs) - 7.5; // Ajuste por grosor del trazo
                    const minY = Math.min(...ys) - 7.5;
                    const maxX = Math.max(...xs) + 7.5;
                    const maxY = Math.max(...ys) + 7.5;
                    
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
                        x: minX,
                        y: minY,
                        width: maxX - minX,
                        height: maxY - minY,
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
                    else bgColor = textAnno.bgColor;
                }

                operations.push({
                    type: "text",
                    page: textAnno.pageNum,
                    x: textAnno.x,
                    y: textAnno.y,
                    text: textAnno.text,
                    font_size: textAnno.fontSize,
                    color: textAnno.color,
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
            
            await message(t('alert.saved'), { title: 'InkIt', kind: 'info' });
        }
    } catch (error) {
        console.error('Error guardando PDF:', error);
        await message(t('alert.error_save') + error, { title: t('alert.title.error'), kind: 'error' });
    }
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
