import { imageAnnotations, state } from './state.js';
import { commitAction } from '../state.js';
import { showImageContextMenu } from './contextMenu.js';
import { detachFromMaster, syncLinkedAnnotations } from './annotationGroups.js';
import { t } from '../translations.js';

export function renderImageAnnotation(anno, wrapper, scale) {
    const img = document.createElement('img');
    img.src = anno.dataUrl;
    img.className = 'img-annotation';
    img.dataset.id = anno.id;
    img.title = t('ctx.img_title');

    img.style.left = `${anno.x * scale}px`;
    img.style.top = `${anno.y * scale}px`;
    img.style.width = `${anno.width * scale}px`;
    img.style.height = `${anno.height * scale}px`;
    img.style.opacity = anno.opacity ?? 1.0;
    wrapper.appendChild(img);

    img.addEventListener('mousedown', event => {
        if (event.button !== 0) return;

        const startX = event.clientX;
        const startY = event.clientY;
        const initialLeft = parseFloat(img.style.left);
        const initialTop = parseFloat(img.style.top);
        let isDragging = true;
        img.style.cursor = 'grabbing';
        event.stopPropagation();

        const onMouseMove = moveEvent => {
            if (!isDragging) return;
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (dx !== 0 || dy !== 0) detachFromMaster(anno);
            img.style.left = `${initialLeft + dx}px`;
            img.style.top = `${initialTop + dy}px`;
            anno.x = parseFloat(img.style.left) / scale;
            anno.y = parseFloat(img.style.top) / scale;
            syncLinkedAnnotations(anno);
        };

        const onMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                img.style.cursor = 'pointer';
                const wrapperScale = scale || parseFloat(
                    img.closest('.pdf-page-wrapper')?.dataset.scale || 1.0
                );
                anno.x = parseFloat(img.style.left) / wrapperScale;
                anno.y = parseFloat(img.style.top) / wrapperScale;
                syncLinkedAnnotations(anno);
                commitAction();
            }
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    img.addEventListener('contextmenu', event => {
        event.preventDefault();
        event.stopPropagation();
        state.ctxMenuActiveAnno = anno;
        state.ctxMenuActiveImg = img;
        state.ctxMenuActiveScale = scale;
        showImageContextMenu(anno, img, scale, event);
    });
}

export function renderImageAnnotationsForPage(wrapper, pageNum, scale) {
    imageAnnotations
        .filter(annotation => annotation.pageNum === pageNum)
        .forEach(annotation => renderImageAnnotation(annotation, wrapper, scale));
}
