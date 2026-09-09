import { addImageAnnotationToPage } from './signatures.js';
import { commitAction } from "./state.js";

export let annotations = [];

let isTypewriterMode = false;
let currentFontSize = 16;
let currentBgColor = "transparent";
let currentColor = '#000000';
let activeAnnotation = null;
let pendingStampType = null;
let pendingStampSymbol = null;

let pdfContainer = null;

// Generar imagen transparente SVG/Canvas para sellos (✓, ✗, etc.)
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

export function setActiveAnnotation(div) {
    if (activeAnnotation && activeAnnotation !== div) {
        activeAnnotation.classList.remove('selected');
    }
    activeAnnotation = div;
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
    if (activeAnnotation) {
        activeAnnotation.classList.remove('selected');
        activeAnnotation.classList.remove('editing');
        activeAnnotation = null;
    }
}

export function updateAnnotationsMode(mode) {
    // mode: 'pointer' | 'typewriter' | 'sign'
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

export function initTypewriter(containerId) {
    pdfContainer = document.getElementById(containerId);
    
    const btnTypewriter = document.getElementById('btn-typewriter');
    const toolbar = document.getElementById('typewriter-toolbar');
    const sizeInput = document.getElementById('tw-size');
    const colorBtns = toolbar.querySelectorAll('.color-btn');
    const stampBtns = toolbar.querySelectorAll('.stamp-btn');
    const bgBtn = document.getElementById('tw-bg-color');
    const bgValues = ['transparent', 'white', 'gray', 'black'];
    const bgKeys = ['tw.bg.transparent', 'tw.bg.white', 'tw.bg.gray', 'tw.bg.black'];

    bgBtn.addEventListener('click', () => {
        let currentIndex = bgValues.indexOf(currentBgColor);
        currentIndex = (currentIndex + 1) % bgValues.length;
        currentBgColor = bgValues[currentIndex];
        bgBtn.dataset.value = currentBgColor;
        bgBtn.dataset.i18n = bgKeys[currentIndex];
        
        // Tratar de obtener la traducción actual
        import('./translations.js').then(m => {
            const lang = document.documentElement.lang || 'en';
            bgBtn.innerText = m.translations[lang][bgKeys[currentIndex]] || bgKeys[currentIndex];
        });
        
        // Estilo visual del botón para indicar que está activo
        if (currentBgColor !== 'transparent') {
            bgBtn.classList.add('primary');
        } else {
            bgBtn.classList.remove('primary');
        }
    });
    
    // Toggle Typewriter Mode
    btnTypewriter.addEventListener('click', () => {
        if (!isTypewriterMode) {
            isTypewriterMode = true; currentColor = '#000000'; colorBtns.forEach(b => b.classList.remove('active')); if(colorBtns[0]) colorBtns[0].classList.add('active');
            toolbar.style.display = 'flex';
            pdfContainer.style.cursor = 'text';
            updateAnnotationsMode('typewriter');
        } else {
            window.disableTypewriter();
        }
    });

    window.disableTypewriter = () => {
        isTypewriterMode = false;
        toolbar.style.display = 'none';
        pdfContainer.style.cursor = 'default';
        clearActiveAnnotation();
        updateAnnotationsMode('pointer');
        pendingStampType = null;
        pendingStampSymbol = null;
    };

    // Control de tamaño
    sizeInput.addEventListener('input', (e) => {
        currentFontSize = parseInt(e.target.value) || 16;
        if (activeAnnotation) {
            const anno = annotations.find(a => a.id === activeAnnotation.dataset.id);
            if (anno) {
                anno.fontSize = currentFontSize;
                const wrapper = activeAnnotation.closest('.pdf-page-wrapper');
                const scale = wrapper ? parseFloat(wrapper.dataset.scale || 1.0) : 1.0;
                activeAnnotation.style.fontSize = (currentFontSize * scale) + 'px';
            }
        }
    });

    // Control de color
    colorBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            colorBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentColor = e.target.dataset.color;
            
            if (activeAnnotation) {
                const anno = annotations.find(a => a.id === activeAnnotation.dataset.id);
                if (anno) {
                    anno.color = currentColor;
                    activeAnnotation.style.color = currentColor;
                }
            }
        });
    });

    // Sellos Rápidos: Ticks y Cruces se insertan como IMAGEN PNG para evitar problemas de WinAnsi y permitir mover/eliminar
    stampBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const symbol = e.target.dataset.stamp;
            if (symbol === '✓' || symbol === '✗') {
                pendingStampType = 'symbol';
                pendingStampSymbol = symbol;
                pdfContainer.style.cursor = 'crosshair';
            } else if (e.target.id === 'btn-stamp-date') {
                pendingStampType = 'date';
                pendingStampSymbol = new Date().toLocaleDateString();
                pdfContainer.style.cursor = 'crosshair';
            }
        });
    });

    // Manejar clics en el PDF para escribir o deseleccionar
    pdfContainer.addEventListener('click', (e) => {
        const pageWrapper = e.target.closest('.pdf-page-wrapper');
        
        // Si hay un sello pendiente y se hace clic en una página
        if (pendingStampType && pageWrapper) {
            const rect = pageWrapper.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            const pageNum = parseInt(pageWrapper.dataset.pageNum);
            const currentScale = parseFloat(pageWrapper.dataset.scale || 1.0);
            const baseX = clickX / currentScale;
            const baseY = clickY / currentScale;

            if (pendingStampType === 'symbol') {
                const stampPng = createStampDataUrl(pendingStampSymbol, currentColor);
                addImageAnnotationToPage(stampPng, pageNum, baseX, baseY, 40);
            } else if (pendingStampType === 'date') {
                const newAnno = {
                    id: Date.now().toString(),
                    pageNum: pageNum,
                    x: baseX,
                    y: baseY,
                    text: pendingStampSymbol,
                    fontSize: currentFontSize,
                    color: currentColor
                };
                annotations.push(newAnno);
                renderAnnotation(newAnno, pageWrapper, currentScale);
            }
            
            pendingStampType = null;
            pendingStampSymbol = null;
            pdfContainer.style.cursor = 'text'; // Volver al cursor normal de typewriter
            return;
        }

        // Si se hace clic fuera de cualquier texto/imagen, deseleccionar
        if (!e.target.classList.contains('text-annotation') && !e.target.classList.contains('img-annotation')) {
            clearActiveAnnotation();
        }

        if (!isTypewriterMode || !pageWrapper) return;
        
        // Si el usuario hace clic en una anotación existente, dejamos que el focus/edición actúe
        if (e.target.classList.contains('text-annotation')) return;

        const rect = pageWrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        const pageNum = parseInt(pageWrapper.dataset.pageNum);
        const currentScale = parseFloat(pageWrapper.dataset.scale || 1.0);
        
        const baseX = clickX / currentScale;
        const baseY = clickY / currentScale;
        const baseFontSize = currentFontSize / currentScale;
        
        // Crear nueva caja editable temporal
        createNewEditableBox(pageWrapper, pageNum, baseX, baseY, baseFontSize, currentColor, currentScale);
    });
}

function createNewEditableBox(wrapper, pageNum, baseX, baseY, baseFontSize, color, currentScale) {
    const div = document.createElement('div');
    div.className = 'text-annotation editing selected';
    div.contentEditable = true;
    
    div.style.left = (baseX * currentScale) + 'px';
    div.style.top = (baseY * currentScale) + 'px';
    div.style.fontSize = (baseFontSize * currentScale) + 'px';
    div.style.color = color;
        
    const hexBg = currentBgColor === 'white' ? '#ffffff' : (currentBgColor === 'gray' ? '#f0f0f0' : (currentBgColor === 'black' ? '#000000' : 'transparent'));
    div.style.backgroundColor = hexBg;
    div.style.padding = currentBgColor !== 'transparent' ? '2px 4px' : '0px';
    if(currentBgColor === 'black' && color === '#000000') div.style.color = '#ffffff'; // Auto invert black text on black bg
    
    wrapper.appendChild(div);
    div.focus();
    setActiveAnnotation(div);
    
    // Al perder el foco, guardar o descartar
    const onBlur = () => {
        div.classList.remove('editing');
        const text = div.innerText.trim();
        
        if (div.dataset.id) return; // Ya fue guardado, el blur de setupExistingAnnotation se encargará ahora
        
        if (text === '') {
            if (activeAnnotation === div) clearActiveAnnotation();
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
                bgColor: currentBgColor
            });
            commitAction();
            const newAnno = annotations[annotations.length - 1]; setupExistingAnnotation(div, newAnno, currentScale);
        }
    };
    div.addEventListener('blur', onBlur);
}

export function renderAnnotation(anno, wrapper, scale) {
    const div = document.createElement('div');
    div.className = 'text-annotation';
    div.contentEditable = isTypewriterMode;
    div.style.cursor = isTypewriterMode ? 'text' : 'move';
    div.dataset.id = anno.id;
    
    div.style.left = (anno.x * scale) + 'px';
    div.style.top = (anno.y * scale) + 'px';
    div.style.fontSize = (anno.fontSize * scale) + 'px';
    div.style.color = anno.color;
    div.innerText = anno.text;
    
    setupExistingAnnotation(div, anno, scale);
    wrapper.appendChild(div);
}

function setupExistingAnnotation(div, anno, scale) {
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        setActiveAnnotation(div);
    });

    div.addEventListener('focus', () => {
        if (isTypewriterMode) {
            div.classList.add('editing');
        }
        setActiveAnnotation(div);
    });

    div.addEventListener('blur', () => {
        div.classList.remove('editing');
        const text = div.innerText.trim();
        if (text === '') {
            if (activeAnnotation === div) clearActiveAnnotation();
            div.remove();
            annotations = annotations.filter(a => a.id !== anno.id);
            commitAction();
        } else {
            anno.text = text;
            commitAction();
        }
    });

    // Drag & Drop (Funciona siempre, especialmente en modo Seleccionar)
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    div.addEventListener('mousedown', (e) => {
        // En modo Texto mientras se está editando activamente, no arrastrar
        if (isTypewriterMode && div.classList.contains('editing')) return;
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
            div.style.cursor = isTypewriterMode ? 'text' : 'move';
            
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

export function renderAnnotationsForPage(wrapper, pageNum, scale) {
    const pageAnnos = annotations.filter(a => a.pageNum === pageNum);
    pageAnnos.forEach(anno => {
        renderAnnotation(anno, wrapper, scale);
    });
}

export function setAnnotations(newAnnotations) { annotations.length = 0; annotations.push(...newAnnotations); }
