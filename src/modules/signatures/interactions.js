import { state, imageAnnotations } from './state.js';
import { t, getLang } from '../translations.js';
import { commitAction } from '../state.js';

function updateAnnotationElement(anno) {
    const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${anno.pageNum}"]`);
    const img = [...(pageWrapper?.querySelectorAll('.img-annotation') || [])]
        .find(element => element.dataset.id === anno.id);
    if (!img) return;

    const scale = parseFloat(pageWrapper.dataset.scale || 1.0);
    img.style.left = `${anno.x * scale}px`;
    img.style.top = `${anno.y * scale}px`;
    img.style.width = `${anno.width * scale}px`;
    img.style.height = `${anno.height * scale}px`;
    img.style.opacity = anno.opacity ?? 1.0;
    if (img.src !== anno.dataUrl) img.src = anno.dataUrl;
}

function copyAnnotationAppearance(source, target) {
    target.x = source.x;
    target.y = source.y;
    target.width = source.width;
    target.height = source.height;
    target.opacity = source.opacity ?? 1.0;
    target.dataUrl = source.dataUrl;
    target.footerDataUrl = source.footerDataUrl;
    target.normalDataUrl = source.normalDataUrl;
    target.originalRatio = source.originalRatio;
    target.normalRatio = source.normalRatio;
    target.initialWidth = source.initialWidth;
    target.type = source.type;
    updateAnnotationElement(target);
}

function syncLinkedAnnotations(master) {
    if (!master.isMaster || !master.groupId) return;

    imageAnnotations
        .filter(anno => anno.groupId === master.groupId && anno.isLinked && !anno.isMaster)
        .forEach(anno => copyAnnotationAppearance(master, anno));
}

function detachFromMaster(anno) {
    if (!anno.isMaster && anno.isLinked) anno.isLinked = false;
}

function createGroupId() {
    return `sig_group_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

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
    
    img.style.opacity = anno.opacity ?? 1.0;
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

        const onMouseMove = (ev) => {
            if (!isDragging) return;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (dx !== 0 || dy !== 0) detachFromMaster(anno);
            img.style.left = (initialLeft + dx) + 'px';
            img.style.top = (initialTop + dy) + 'px';
            anno.x = parseFloat(img.style.left) / scale;
            anno.y = parseFloat(img.style.top) / scale;
            syncLinkedAnnotations(anno);
        };

        const onMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                img.style.cursor = 'pointer';
                let currentScale = scale;
                if (!currentScale) {
                    const wrapper = img.closest('.pdf-page-wrapper');
                    currentScale = wrapper ? parseFloat(wrapper.dataset.scale || 1.0) : 1.0;
                }
                anno.x = parseFloat(img.style.left) / currentScale;
                anno.y = parseFloat(img.style.top) / currentScale;
                syncLinkedAnnotations(anno);
                commitAction();
            }
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // Listeners are now bound inside mousedown

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
            if (opBtn) opBtn.style.display = 'block';
            const linkBtn = document.getElementById('sig-ctx-link');
            const master = anno.groupId && imageAnnotations.find(item => item.groupId === anno.groupId && item.isMaster);
            if (linkBtn) {
                linkBtn.style.display = !anno.isMaster && master ? 'inline-flex' : 'none';
                if (!anno.isMaster && master) {
                    const key = anno.isLinked ? 'ctx.unlink' : 'ctx.link_master';
                    linkBtn.textContent = t(key);
                    linkBtn.dataset.action = anno.isLinked ? 'unlink' : 'link';
                }
            }
            const opacity = anno.opacity || 1.0;
            const activeOpacityButton = opacity >= 0.95 ? 'btn-op-100'
                : opacity >= 0.8 ? 'btn-op-85'
                : opacity >= 0.5 ? 'btn-op-60'
                : 'btn-op-30';
            ['btn-op-100', 'btn-op-85', 'btn-op-60', 'btn-op-30'].forEach(id => {
                document.getElementById(id)?.classList.toggle('active', id === activeOpacityButton);
            });
            
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
        }
    });

    document.getElementById('sig-ctx-delete')?.addEventListener('click', () => {
        if (state.ctxMenuActiveImg && state.ctxMenuActiveAnno) {
            state.ctxMenuActiveImg.remove();
            // find index and remove
            const idx = imageAnnotations.findIndex(a => a.id === state.ctxMenuActiveAnno.id);
            if (idx > -1) {
                const deletedAnno = imageAnnotations[idx];
                imageAnnotations.splice(idx, 1);
                if (deletedAnno.isMaster) {
                    imageAnnotations
                        .filter(anno => anno.groupId === deletedAnno.groupId && anno.isLinked)
                        .forEach(anno => {
                            anno.isLinked = false;
                            anno.groupId = null;
                        });
                }
            }
            if (sigCtxMenu) sigCtxMenu.style.display = 'none';
            commitAction();
        }
    });
    
    const applySize = (sizeType) => {
        if (state.ctxMenuActiveImg && state.ctxMenuActiveAnno) {
            let anno = state.ctxMenuActiveAnno;
            detachFromMaster(anno);
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
                        const isEs = getLang().startsWith('es');
                        fCtx.fillText(isEs ? 'Verificado digitalmente por validación criptográfica PAdES' : 'Digitally verified by PAdES cryptographic validation', 20 + drawW + 20, 25);
                        fCtx.fillText(isEs ? `Fecha de firma: ${new Date().toLocaleString()}` : `Signature Date: ${new Date().toLocaleString()}`, 20 + drawW + 20, 45);
                        
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
                                syncLinkedAnnotations(anno);
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
                        syncLinkedAnnotations(anno);
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
            syncLinkedAnnotations(anno);
            commitAction();
        }
    };
    
    document.getElementById('sig-ctx-s')?.addEventListener('click', () => applySize('S'));
    document.getElementById('sig-ctx-m')?.addEventListener('click', () => applySize('M'));
    document.getElementById('sig-ctx-l')?.addEventListener('click', () => applySize('L'));

    const applyOpacity = (val) => {
        if (state.ctxMenuActiveImg && state.ctxMenuActiveAnno) {
            let anno = state.ctxMenuActiveAnno;
            detachFromMaster(anno);
            anno.opacity = val;
            state.ctxMenuActiveImg.style.opacity = anno.opacity;
            const activeOpacityButton = val === 1.0 ? 'btn-op-100'
                : val === 0.85 ? 'btn-op-85'
                : val === 0.6 ? 'btn-op-60'
                : 'btn-op-30';
            ['btn-op-100', 'btn-op-85', 'btn-op-60', 'btn-op-30'].forEach(id => {
                document.getElementById(id)?.classList.toggle('active', id === activeOpacityButton);
            });
            if(sigCtxMenu) sigCtxMenu.style.display = 'none';
            syncLinkedAnnotations(anno);
            commitAction();
        }
    };
    document.getElementById('btn-op-100')?.addEventListener('click', () => applyOpacity(1.0));
    document.getElementById('btn-op-85')?.addEventListener('click', () => applyOpacity(0.85));
    document.getElementById('btn-op-60')?.addEventListener('click', () => applyOpacity(0.6));
    document.getElementById('btn-op-30')?.addEventListener('click', () => applyOpacity(0.3));

    document.getElementById('sig-ctx-link')?.addEventListener('click', () => {
        const anno = state.ctxMenuActiveAnno;
        if (!anno || anno.isMaster || !anno.groupId) return;

        const master = imageAnnotations.find(item => item.groupId === anno.groupId && item.isMaster);
        if (!master) return;

        if (anno.isLinked) {
            anno.isLinked = false;
        } else {
            copyAnnotationAppearance(master, anno);
            anno.isLinked = true;
        }
        if (sigCtxMenu) sigCtxMenu.style.display = 'none';
        commitAction();
    });

    document.getElementById('sig-ctx-all-pages')?.addEventListener('click', async () => {
        if (state.ctxMenuActiveAnno) {
            const anno = state.ctxMenuActiveAnno;
            const pdfViewer = await import('../../core/pdfViewer.js');
            const totalPages = pdfViewer.getTotalPages();
            const groupId = anno.isMaster && anno.groupId ? anno.groupId : createGroupId();
            anno.groupId = groupId;
            anno.isMaster = true;
            anno.isLinked = false;

            for (let i = 1; i <= totalPages; i++) {
                if (i !== anno.pageNum) {
                    let clone = imageAnnotations.find(item => item.groupId === groupId && item.pageNum === i && !item.isMaster);
                    const isNewClone = !clone;
                    if (!clone) {
                        clone = {
                            ...anno,
                            id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                            pageNum: i,
                            isMaster: false,
                            isLinked: true
                        };
                        imageAnnotations.push(clone);
                    } else {
                        copyAnnotationAppearance(anno, clone);
                        clone.isLinked = true;
                    }

                    const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${i}"]`);
                    if (isNewClone && pageWrapper?.dataset.rendered === 'true') {
                        renderImageAnnotation(clone, pageWrapper, parseFloat(pageWrapper.dataset.scale || 1.0));
                    }
                }
            }
            if(sigCtxMenu) sigCtxMenu.style.display = 'none';
            commitAction();
        }
    });
}







