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
            const ratio = state.ctxMenuActiveAnno.originalRatio || (state.ctxMenuActiveAnno.width / state.ctxMenuActiveAnno.height);
            const isStamp = ratio > 3; 
            const baseW = state.ctxMenuActiveAnno.initialWidth || (isStamp ? 300 : 150);
            const baseH = baseW / ratio;
            
            let newW, newH;
            if (sizeType === 'S') {
                newW = baseW * 0.6;
                newH = baseH * 0.6;
            } else if (sizeType === 'M') {
                newW = baseW;
                newH = baseH;
            } else if (sizeType === 'L') {
                if (isStamp) {
                    newW = baseW * 1.6; 
                    newH = baseH; 
                } else {
                    newW = baseW * 1.6;
                    newH = baseH * 1.6; 
                }
            }
            
            state.ctxMenuActiveAnno.width = newW;
            state.ctxMenuActiveAnno.height = newH;
            
            state.ctxMenuActiveImg.style.width = (newW * state.ctxMenuActiveScale) + 'px';
            state.ctxMenuActiveImg.style.height = (newH * state.ctxMenuActiveScale) + 'px';
            
            if(sigCtxMenu) sigCtxMenu.style.display = 'none';
            commitAction();
        }
    };
    
    document.getElementById('sig-ctx-s')?.addEventListener('click', () => applySize('S'));
    document.getElementById('sig-ctx-m')?.addEventListener('click', () => applySize('M'));
    document.getElementById('sig-ctx-l')?.addEventListener('click', () => applySize('L'));
}
