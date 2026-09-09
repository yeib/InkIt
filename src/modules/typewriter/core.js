import { state, annotations } from './state.js';
import { addImageAnnotationToPage } from '../signatures.js';
import { commitAction } from '../state.js';
import { setActiveAnnotation, clearActiveAnnotation, updateAnnotationsMode, setupExistingAnnotation, renderAnnotation } from './interactions.js';

function createStampDataUrl(symbol, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 80px sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 60, 65);
    
    return canvas.toDataURL('image/png');
}

export function createNewEditableBox(wrapper, pageNum, baseX, baseY, baseFontSize, color, currentScale) {
    const div = document.createElement('div');
    div.className = 'text-annotation editing selected';
    div.contentEditable = true;
    
    div.style.left = (baseX * currentScale) + 'px';
    div.style.top = (baseY * currentScale) + 'px';
    div.style.fontSize = (baseFontSize * currentScale) + 'px';
    div.style.color = color;
        
    const hexBg = state.currentBgColor === 'white' ? '#ffffff' : (state.currentBgColor === 'gray' ? '#f0f0f0' : (state.currentBgColor === 'black' ? '#000000' : 'transparent'));
    div.style.backgroundColor = hexBg;
    div.style.padding = state.currentBgColor !== 'transparent' ? '2px 4px' : '0px';
    if(state.currentBgColor === 'black' && color === '#000000') div.style.color = '#ffffff'; // Auto invert black text on black bg
    
    wrapper.appendChild(div);
    div.focus();
    setActiveAnnotation(div);
    
    const onBlur = () => {
        div.classList.remove('editing');
        const text = div.innerText.trim();
        
        if (div.dataset.id) return; 
        
        if (text === '') {
            if (state.activeAnnotation === div) clearActiveAnnotation();
            div.remove();
        } else {
            const id = Date.now().toString();
            div.dataset.id = id;
            annotations.push({
                id,
                pageNum,
                text,
                x: baseX,
                y: baseY,
                fontSize: baseFontSize,
                color,
                bgColor: state.currentBgColor
            });
            commitAction();
            const newAnno = annotations[annotations.length - 1]; 
            setupExistingAnnotation(div, newAnno, currentScale);
        }
    };
    div.addEventListener('blur', onBlur);
}

export function initTypewriter(containerId) {
    state.pdfContainer = document.getElementById(containerId);
    
    const btnTypewriter = document.getElementById('btn-typewriter');
    const toolbar = document.getElementById('typewriter-toolbar');
    const sizeInput = document.getElementById('tw-size');
    const colorBtns = toolbar.querySelectorAll('.color-btn');
    const stampBtns = toolbar.querySelectorAll('.stamp-btn');
    const bgBtn = document.getElementById('tw-bg-color');
    const bgValues = ['transparent', 'white', 'gray', 'black'];
    const bgKeys = ['tw.bg.transparent', 'tw.bg.white', 'tw.bg.gray', 'tw.bg.black'];

    bgBtn?.addEventListener('click', () => {
        let currentIndex = bgValues.indexOf(state.currentBgColor);
        currentIndex = (currentIndex + 1) % bgValues.length;
        state.currentBgColor = bgValues[currentIndex];
        bgBtn.dataset.value = state.currentBgColor;
        bgBtn.dataset.i18n = bgKeys[currentIndex];
        
        import('../translations.js').then(m => {
            const lang = document.documentElement.lang || 'en';
            bgBtn.innerText = m.translations[lang][bgKeys[currentIndex]] || bgKeys[currentIndex];
        });
        
        if (state.currentBgColor !== 'transparent') {
            bgBtn.classList.add('primary');
        } else {
            bgBtn.classList.remove('primary');
        }
    });
    
    btnTypewriter?.addEventListener('click', () => {
        if (!state.isTypewriterMode) {
            state.isTypewriterMode = true; 
            state.currentColor = '#000000'; 
            colorBtns.forEach(b => b.classList.remove('active')); 
            if(colorBtns[0]) colorBtns[0].classList.add('active');
            
            if(toolbar) toolbar.style.display = 'flex';
            if(state.pdfContainer) state.pdfContainer.style.cursor = 'text';
            updateAnnotationsMode('typewriter');
        } else {
            if(window.disableTypewriter) window.disableTypewriter();
        }
    });

    window.disableTypewriter = () => {
        state.isTypewriterMode = false;
        if(toolbar) toolbar.style.display = 'none';
        if(state.pdfContainer) state.pdfContainer.style.cursor = 'default';
        clearActiveAnnotation();
        updateAnnotationsMode('pointer');
        state.pendingStampType = null;
        state.pendingStampSymbol = null;
    };

    sizeInput?.addEventListener('input', (e) => {
        state.currentFontSize = parseInt(e.target.value) || 16;
        if (state.activeAnnotation) {
            const anno = annotations.find(a => a.id === state.activeAnnotation.dataset.id);
            if (anno) {
                anno.fontSize = state.currentFontSize;
                const wrapper = state.activeAnnotation.closest('.pdf-page-wrapper');
                const scale = wrapper ? parseFloat(wrapper.dataset.scale || 1.0) : 1.0;
                state.activeAnnotation.style.fontSize = (state.currentFontSize * scale) + 'px';
            }
        }
    });

    colorBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            colorBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.currentColor = e.target.dataset.color;
            
            if (state.activeAnnotation) {
                const anno = annotations.find(a => a.id === state.activeAnnotation.dataset.id);
                if (anno) {
                    anno.color = state.currentColor;
                    state.activeAnnotation.style.color = state.currentColor;
                }
            }
        });
    });

    stampBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const symbol = e.target.dataset.stamp;
            if (symbol === '✓' || symbol === '✗') {
                state.pendingStampType = 'symbol';
                state.pendingStampSymbol = symbol;
                if(state.pdfContainer) state.pdfContainer.style.cursor = 'crosshair';
            } else if (e.target.id === 'btn-stamp-date') {
                state.pendingStampType = 'date';
                state.pendingStampSymbol = new Date().toLocaleDateString();
                if(state.pdfContainer) state.pdfContainer.style.cursor = 'crosshair';
            }
        });
    });

    state.pdfContainer?.addEventListener('click', (e) => {
        const pageWrapper = e.target.closest('.pdf-page-wrapper');
        
        if (state.pendingStampType && pageWrapper) {
            const rect = pageWrapper.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            const pageNum = parseInt(pageWrapper.dataset.pageNum);
            const currentScale = parseFloat(pageWrapper.dataset.scale || 1.0);
            const baseX = clickX / currentScale;
            const baseY = clickY / currentScale;

            if (state.pendingStampType === 'symbol') {
                const stampPng = createStampDataUrl(state.pendingStampSymbol, state.currentColor);
                addImageAnnotationToPage(stampPng, pageNum, baseX, baseY, 40);
            } else if (state.pendingStampType === 'date') {
                const newAnno = {
                    id: Date.now().toString(),
                    pageNum: pageNum,
                    x: baseX,
                    y: baseY,
                    text: state.pendingStampSymbol,
                    fontSize: state.currentFontSize,
                    color: state.currentColor
                };
                annotations.push(newAnno);
                renderAnnotation(newAnno, pageWrapper, currentScale);
            }
            
            state.pendingStampType = null;
            state.pendingStampSymbol = null;
            state.pdfContainer.style.cursor = 'text'; 
            return;
        }

        if (!e.target.classList.contains('text-annotation') && !e.target.classList.contains('img-annotation')) {
            clearActiveAnnotation();
        }

        if (!state.isTypewriterMode || !pageWrapper) return;
        
        if (e.target.classList.contains('text-annotation')) return;

        const rect = pageWrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        const pageNum = parseInt(pageWrapper.dataset.pageNum);
        const currentScale = parseFloat(pageWrapper.dataset.scale || 1.0);
        
        const baseX = clickX / currentScale;
        const baseY = clickY / currentScale;
        const baseFontSize = state.currentFontSize / currentScale;
        
        createNewEditableBox(pageWrapper, pageNum, baseX, baseY, baseFontSize, state.currentColor, currentScale);
    });
}
