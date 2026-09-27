import { state, imageAnnotations } from './state.js';
import { t } from '../translations.js';
import { commitAction } from '../state.js';

export function renderImageAnnotation(anno, wrapper, scale) {
    const img = document.createElement('img');
    img.src = anno.dataUrl;
    img.className = 'img-annotation';
    img.dataset.id = anno.id;
    img.title = t('ctx.img_title');
    
    img.style.left = (anno.x * scale) + 'px';
    img.style.top = (anno.y * scale) + 'px';
    img.style.width = (anno.width * scale) + 'px';
    img.style.height = (anno.height * scale) + 'px';
    
    img.style.opacity = anno.opacity || 1.0;
    wrapper.appendChild(img);
    
    // Drag & Drop logic
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    img.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = parseFloat(img.style.left);
        initialTop = parseFloat(img.style.top);
        img.style.cursor = 'grabbing';
        e.stopPropagation();
    });

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        img.style.left = (initialLeft + dx) + 'px';
        img.style.top = (initialTop + dy) + 'px';
    };

    const onMouseUp = () => {
        if (isDragging) {
            isDragging = false;
            img.style.cursor = 'move';
            // Guardar nueva posición
            anno.x = parseFloat(img.style.left) / scale;
            anno.y = parseFloat(img.style.top) / scale;
            commitAction();
        }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Context Menu (Right Click)
    img.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        state.ctxMenuActiveAnno = anno;
        state.ctxMenuActiveImg = img;
        state.ctxMenuActiveScale = scale;
        
        const sigCtxMenu = document.getElementById('sig-context-menu');
        if(sigCtxMenu) {
            sigCtxMenu.style.display = 'flex';
            const opBtn = document.getElementById('sig-ctx-opacity-container');
            if (opBtn) opBtn.style.display = anno.type === 'esign' ? 'none' : 'block';
            
            // Evitar que el menú se salga de la pantalla
            const rect = sigCtxMenu.getBoundingClientRect();
            let top = e.clientY;
            let left = e.clientX;
            
            if (top + rect.height > window.innerHeight) {
                top -= rect.height;
            }
            if (left + rect.width > window.innerWidth) {
                left -= rect.width;
            }
            
            sigCtxMenu.style.left = left + 'px';
            sigCtxMenu.style.top = top + 'px';
        }
    });
}

export function renderImageAnnotationsForPage(wrapper, pageNum, scale) {
    const pageAnnos = imageAnnotations.filter(a => a.pageNum === pageNum);
    pageAnnos.forEach(anno => {
        renderImageAnnotation(anno, wrapper, scale);
    });
}

export function setupInteractionsMenu() {
    const sigCtxMenu = document.getElementById('sig-context-menu');
    
    document.addEventListener('click', (e) => {
        if (sigCtxMenu && sigCtxMenu.style.display === 'flex' && !sigCtxMenu.contains(e.target)) {
            sigCtxMenu.style.display = 'none';
            commitAction();
        }
    });

    document.getElementById('sig-ctx-delete')?.addEventListener('click', () => {
        if (state.ctxMenuActiveImg && state.ctxMenuActiveAnno) {
            state.ctxMenuActiveImg.remove();
            // find index and remove
            const idx = imageAnnotations.findIndex(a => a.id === state.ctxMenuActiveAnno.id);
            if (idx > -1) {
                imageAnnotations.splice(idx, 1);
            }
            if (sigCtxMenu) sigCtxMenu.style.display = 'none';
            commitAction();
        }
    });
    
    const applySize = (sizeType) => {
        if (state.ctxMenuActiveImg && state.ctxMenuActiveAnno) {
            let anno = state.ctxMenuActiveAnno;
            let ratio = anno.originalRatio || (anno.width / anno.height);
            
            // Si pasamos de L (footer) a S o M, y tenemos el original guardado, restauramos
            if ((sizeType === 'S' || sizeType === 'M') && anno.footerDataUrl && anno.dataUrl === anno.footerDataUrl) {
                anno.dataUrl = anno.normalDataUrl;
                state.ctxMenuActiveImg.src = anno.normalDataUrl;
                ratio = anno.normalRatio || ratio;
                anno.originalRatio = ratio;
            }

            const isStamp = ratio > 3; 
            const baseW = anno.initialWidth || (isStamp ? 300 : 150);
            const baseH = baseW / ratio;
            
            let newW, newH;
            if (sizeType === 'S') {
                newW = baseW * 0.6;
                newH = baseH * 0.6;
            } else if (sizeType === 'M') {
                newW = baseW;
                newH = baseH;
            } else if (sizeType === 'L' && anno.type !== 'esign') {
                newW = baseW * 1.5;
                newH = baseH * 1.5;
            } else if (sizeType === 'L' && anno.type === 'esign') {
                const wrapper = state.ctxMenuActiveImg.closest('.pdf-page-wrapper');
                let pdfPageWidth = 595.28; 
                let pdfPageHeight = 841.89;
                if (wrapper) {
                    const canvas = wrapper.querySelector('canvas');
                    if (canvas) {
                        pdfPageWidth = (canvas.width / window.devicePixelRatio) / state.ctxMenuActiveScale;
                        pdfPageHeight = (canvas.height / window.devicePixelRatio) / state.ctxMenuActiveScale;
                    }
                }
                
                // Generador dinámico de Footer si no existe (para firmas antiguas o imágenes normales)
                if (!anno.footerDataUrl) {
                    const fCanvas = document.createElement('canvas');
                    fCanvas.width = 1600;
                    fCanvas.height = 120;
                    const fCtx = fCanvas.getContext('2d');
                    fCtx.scale(2, 2);
                    
                    fCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    fCtx.fillRect(0, 0, 800, 60);
                    fCtx.strokeStyle = '#003399';
                    fCtx.lineWidth = 2;
                    fCtx.beginPath();
                    fCtx.moveTo(0, 0);
                    fCtx.lineTo(800, 0);
                    fCtx.stroke();
                    
                    const originalImg = new Image();
                    originalImg.src = anno.normalDataUrl || anno.dataUrl;
                    
                    // Esperamos sincrónicamente (onload) para generar y aplicar
                    originalImg.onload = () => {
                        // Dibujar la firma original a la izquierda sin distorsionar
                        const oRatio = originalImg.width / originalImg.height;
                        let drawW = 150;
                        let drawH = drawW / oRatio;
                        if (drawH > 40) {
                            drawH = 40;
                            drawW = drawH * oRatio;
                        }
                        
                        fCtx.drawImage(originalImg, 20, 10, drawW, drawH);
                        
                        fCtx.fillStyle = '#333333';
                        fCtx.font = '12px Arial';
                        fCtx.fillText(`Verificado digitalmente por validación criptográfica PAdES`, 20 + drawW + 20, 25);
                        fCtx.fillText(`Fecha de firma: ${new Date().toLocaleString()}`, 20 + drawW + 20, 45);
                        
                        // Agregar el logo de InkIt a la derecha
                        const drawLogo = () => {
                            fCtx.fillStyle = '#003399';
                            fCtx.font = 'italic 20px "Segoe Script", cursive, Arial';
                            fCtx.fillText('InkIt', 650, 30);
                            fCtx.font = '12px Arial';
                            fCtx.fillText('VERIFIED', 655, 45);
                            
                            anno.footerDataUrl = fCanvas.toDataURL('image/png');
                            
                            // Ahora aplicamos el flujo normal de footer
                            anno.dataUrl = anno.footerDataUrl;
                            state.ctxMenuActiveImg.src = anno.footerDataUrl;
                            
                            const tmpImg = new Image();
                            tmpImg.onload = () => {
                                const newRatio = tmpImg.width / tmpImg.height;
                                anno.originalRatio = newRatio;
                                const w = pdfPageWidth - 40; 
                                const h = w / newRatio;
                                
                                anno.width = w;
                                anno.height = h;
                                anno.x = 20;
                                anno.y = pdfPageHeight - h - 20;
                                
                                state.ctxMenuActiveImg.style.width = (w * state.ctxMenuActiveScale) + 'px';
                                state.ctxMenuActiveImg.style.height = (h * state.ctxMenuActiveScale) + 'px';
                                state.ctxMenuActiveImg.style.left = (anno.x * state.ctxMenuActiveScale) + 'px';
                                state.ctxMenuActiveImg.style.top = (anno.y * state.ctxMenuActiveScale) + 'px';
                                commitAction();
                            };
                            tmpImg.src = anno.footerDataUrl;
                        };

                        const logoImg = new Image();
                        logoImg.onload = () => {
                            fCtx.drawImage(logoImg, 730, 5, 50, 50);
                            drawLogo();
                        };
                        logoImg.onerror = drawLogo;
                        logoImg.src = '/InkIt_Logo.png';
                        

                    };
                    if(sigCtxMenu) sigCtxMenu.style.display = 'none';
                    return; // Terminamos por el flujo asíncrono
                }

                // Si ya tenemos un diseño especial para Footer, lo aplicamos!
                if (anno.footerDataUrl && anno.dataUrl !== anno.footerDataUrl) {
                    anno.dataUrl = anno.footerDataUrl;
                    state.ctxMenuActiveImg.src = anno.footerDataUrl;
                    
                    // Necesitamos recalcular el ratio
                    const tmpImg = new Image();
                    tmpImg.onload = () => {
                        const newRatio = tmpImg.width / tmpImg.height;
                        anno.originalRatio = newRatio;
                        const w = pdfPageWidth - 40; 
                        const h = w / newRatio;
                        
                        anno.width = w;
                        anno.height = h;
                        anno.x = 20;
                        anno.y = pdfPageHeight - h - 20;
                        
                        state.ctxMenuActiveImg.style.width = (w * state.ctxMenuActiveScale) + 'px';
                        state.ctxMenuActiveImg.style.height = (h * state.ctxMenuActiveScale) + 'px';
                        state.ctxMenuActiveImg.style.left = (anno.x * state.ctxMenuActiveScale) + 'px';
                        state.ctxMenuActiveImg.style.top = (anno.y * state.ctxMenuActiveScale) + 'px';
                        commitAction();
                    };
                    tmpImg.src = anno.footerDataUrl;
                    if(sigCtxMenu) sigCtxMenu.style.display = 'none';
                    return; // Terminamos aquí por el onload asíncrono
                }

                newW = pdfPageWidth - 40; 
                newH = newW / ratio;
                
                anno.x = 20;
                anno.y = pdfPageHeight - newH - 20;
                state.ctxMenuActiveImg.style.left = (anno.x * state.ctxMenuActiveScale) + 'px';
                state.ctxMenuActiveImg.style.top = (anno.y * state.ctxMenuActiveScale) + 'px';
            }
            
            anno.width = newW;
            anno.height = newH;
            
            state.ctxMenuActiveImg.style.width = (newW * state.ctxMenuActiveScale) + 'px';
            state.ctxMenuActiveImg.style.height = (newH * state.ctxMenuActiveScale) + 'px';
            
            if(sigCtxMenu) sigCtxMenu.style.display = 'none';
            commitAction();
        }
    };
    
    document.getElementById('sig-ctx-s')?.addEventListener('click', () => applySize('S'));
    document.getElementById('sig-ctx-m')?.addEventListener('click', () => applySize('M'));
    document.getElementById('sig-ctx-l')?.addEventListener('click', () => applySize('L'));

    const applyOpacity = (val) => {
        if (state.ctxMenuActiveImg && state.ctxMenuActiveAnno) {
            let anno = state.ctxMenuActiveAnno;
            anno.opacity = val;
            state.ctxMenuActiveImg.style.opacity = anno.opacity;
            if(sigCtxMenu) sigCtxMenu.style.display = 'none';
            commitAction();
        }
    };
    document.getElementById('btn-op-100')?.addEventListener('click', () => applyOpacity(1.0));
    document.getElementById('btn-op-85')?.addEventListener('click', () => applyOpacity(0.85));
    document.getElementById('btn-op-60')?.addEventListener('click', () => applyOpacity(0.6));
    document.getElementById('btn-op-30')?.addEventListener('click', () => applyOpacity(0.3));

    document.getElementById('sig-ctx-all-pages')?.addEventListener('click', async () => {
        if (state.ctxMenuActiveAnno) {
            const anno = state.ctxMenuActiveAnno;
            const pdfViewer = await import('../../core/pdfViewer.js');
            const totalPages = pdfViewer.getTotalPages();
            
            for (let i = 1; i <= totalPages; i++) {
                if (i !== anno.pageNum) {
                    const { addImageAnnotationToPage } = await import('../signatures.js');
                    addImageAnnotationToPage(anno.dataUrl, i, anno.x, anno.y, anno.width);
                }
            }
            if(sigCtxMenu) sigCtxMenu.style.display = 'none';
        }
    });
}








