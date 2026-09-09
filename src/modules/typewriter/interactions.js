import { state, annotations } from './state.js';
import { commitAction } from '../state.js';

export function setActiveAnnotation(div) {
    if (state.activeAnnotation && state.activeAnnotation !== div) {
        state.activeAnnotation.classList.remove('selected');
    }
    state.activeAnnotation = div;
    if (div) {
        div.classList.add('selected');
        const sizeInput = document.getElementById('tw-size');
        const anno = annotations.find(a => a.id === div.dataset.id);
        if (anno && sizeInput) {
            sizeInput.value = anno.fontSize;
        }
    }
}

export function clearActiveAnnotation() {
    if (state.activeAnnotation) {
        state.activeAnnotation.classList.remove('selected');
        state.activeAnnotation.classList.remove('editing');
        state.activeAnnotation = null;
    }
}

export function updateAnnotationsMode(mode) {
    const textEls = document.querySelectorAll('.text-annotation');
    textEls.forEach(el => {
        if (mode === 'typewriter') {
            el.contentEditable = 'true';
            el.style.cursor = 'text';
        } else {
            el.contentEditable = 'false';
            el.style.cursor = 'move';
        }
    });
}

export function setupExistingAnnotation(div, anno, scale) {
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        setActiveAnnotation(div);
    });

    div.addEventListener('focus', () => {
        if (state.isTypewriterMode) {
            div.classList.add('editing');
        }
        setActiveAnnotation(div);
    });

    div.addEventListener('blur', () => {
        div.classList.remove('editing');
        const text = div.innerText.trim();
        if (text === '') {
            if (state.activeAnnotation === div) clearActiveAnnotation();
            div.remove();
            const idx = annotations.findIndex(a => a.id === anno.id);
            if (idx > -1) {
                annotations.splice(idx, 1);
            }
            commitAction();
        } else {
            anno.text = text;
            commitAction();
        }
    });

    // Drag & Drop
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    div.addEventListener('mousedown', (e) => {
        if (state.isTypewriterMode && div.classList.contains('editing')) return;
        if (e.button !== 0) return;
        
        setActiveAnnotation(div);

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = parseFloat(div.style.left);
        initialTop = parseFloat(div.style.top);
        div.style.cursor = 'grabbing';
        
        e.stopPropagation();
    });

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        div.style.left = (initialLeft + dx) + 'px';
        div.style.top = (initialTop + dy) + 'px';
    };

    const onMouseUp = () => {
        if (isDragging) {
            isDragging = false;
            div.style.cursor = state.isTypewriterMode ? 'text' : 'move';
            
            let currentScale = scale;
            if (!currentScale) {
                const wrapper = div.closest('.pdf-page-wrapper');
                currentScale = wrapper ? parseFloat(wrapper.dataset.scale || 1.0) : 1.0;
            }

            anno.x = parseFloat(div.style.left) / currentScale;
            anno.y = parseFloat(div.style.top) / currentScale;
            commitAction();
        }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

export function renderAnnotation(anno, wrapper, scale) {
    const div = document.createElement('div');
    div.className = 'text-annotation';
    div.contentEditable = state.isTypewriterMode;
    div.style.cursor = state.isTypewriterMode ? 'text' : 'move';
    div.dataset.id = anno.id;
    
    div.style.left = (anno.x * scale) + 'px';
    div.style.top = (anno.y * scale) + 'px';
    div.style.fontSize = (anno.fontSize * scale) + 'px';
    div.style.color = anno.color;
    
    // Support background colors if added in future or present
    if (anno.bgColor && anno.bgColor !== 'transparent') {
        const hexBg = anno.bgColor === 'white' ? '#ffffff' : (anno.bgColor === 'gray' ? '#f0f0f0' : (anno.bgColor === 'black' ? '#000000' : 'transparent'));
        div.style.backgroundColor = hexBg;
        div.style.padding = '2px 4px';
    }

    div.innerText = anno.text;
    
    setupExistingAnnotation(div, anno, scale);
    wrapper.appendChild(div);
}

export function renderAnnotationsForPage(wrapper, pageNum, scale) {
    const pageAnnos = annotations.filter(a => a.pageNum === pageNum);
    pageAnnos.forEach(anno => {
        renderAnnotation(anno, wrapper, scale);
    });
}
