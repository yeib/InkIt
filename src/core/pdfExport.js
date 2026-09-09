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
