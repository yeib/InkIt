export let annotations = [];

let isTypewriterMode = false;
let currentFontSize = 16;
let currentColor = '#000000';
let currentStamp = null;
let activeAnnotation = null;

let pdfContainer = null;

export function initTypewriter(containerId) {
    pdfContainer = document.getElementById(containerId);
    
    const btnTypewriter = document.getElementById('btn-typewriter');
    const toolbar = document.getElementById('typewriter-toolbar');
    const sizeInput = document.getElementById('tw-size');
    const colorBtns = document.querySelectorAll('.color-btn');
    const stampBtns = document.querySelectorAll('.stamp-btn');
    const btnStampDate = document.getElementById('btn-stamp-date');
    
    // Toggle Typewriter Mode
    btnTypewriter.addEventListener('click', () => {
        if (!isTypewriterMode) {
            isTypewriterMode = true;
            currentStamp = null; // Limpiar modo sello
            toolbar.style.display = 'flex';
            pdfContainer.style.cursor = 'text';
        } else {
            window.disableTypewriter();
        }
    });

    window.disableTypewriter = () => {
        isTypewriterMode = false;
        toolbar.style.display = 'none';
        pdfContainer.style.cursor = 'default';
        currentStamp = null;
    };

    // Control de tamaño
    sizeInput.addEventListener('change', (e) => {
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

    // Sellos Rápidos
    stampBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.dataset.stamp) {
                currentStamp = e.target.dataset.stamp;
            } else if (e.target.id === 'btn-stamp-date') {
                const today = new Date();
                currentStamp = today.toLocaleDateString();
            }
            
            // Forzar modo Typewriter activo pero con cursor crosshair
            if (!isTypewriterMode) btnTypewriter.click();
            pdfContainer.style.cursor = 'crosshair';
        });
    });

    // Manejar clics en el PDF para escribir/estampar
    pdfContainer.addEventListener('click', (e) => {
        if (!isTypewriterMode) return;
        
        // Encontrar el envoltorio de la página
        const pageWrapper = e.target.closest('.pdf-page-wrapper');
        if (!pageWrapper) return;
        
        // Si el usuario hace clic en una anotación existente, dejamos que el navegador maneje el focus (contenteditable)
        if (e.target.classList.contains('text-annotation')) return;

        const rect = pageWrapper.getBoundingClientRect();
        // Coordenadas relativas a la página (en los píxeles actuales del viewport)
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // Determinar qué página es (necesitaremos acceder al atributo data-page)
        const pageNum = parseInt(pageWrapper.dataset.pageNum);
        
        // Obtener el scale actual desde un atributo del wrapper
        const currentScale = parseFloat(pageWrapper.dataset.scale || 1.0);
        
        // Calcular valores base (scale 1.0) para guardarlos neutralmente
        const baseX = clickX / currentScale;
        const baseY = clickY / currentScale;
        const baseFontSize = currentFontSize / currentScale;
        
        if (currentStamp) {
            // Modo Sello: Crear inmediatamente
            const newAnno = {
                id: Date.now().toString(),
                pageNum: pageNum,
                x: baseX,
                y: baseY,
                text: currentStamp,
                fontSize: baseFontSize * 1.5, // Los sellos suelen ser un poco más grandes
                color: currentColor
            };
            annotations.push(newAnno);
            currentStamp = null; // Un uso por clic
            pdfContainer.style.cursor = 'text';
            renderAnnotation(newAnno, pageWrapper, currentScale);
        } else {
            // Modo Texto: Crear caja editable temporal
            createNewEditableBox(pageWrapper, pageNum, baseX, baseY, baseFontSize, currentColor, currentScale);
        }
    });
}

function createNewEditableBox(wrapper, pageNum, baseX, baseY, baseFontSize, color, currentScale) {
    const div = document.createElement('div');
    div.className = 'text-annotation editing';
    div.contentEditable = true;
    
    div.style.left = (baseX * currentScale) + 'px';
    div.style.top = (baseY * currentScale) + 'px';
    div.style.fontSize = (baseFontSize * currentScale) + 'px';
    div.style.color = color;
    
    wrapper.appendChild(div);
    div.focus();
    
    // Al perder el foco, guardar o descartar
    div.addEventListener('blur', () => {
        div.classList.remove('editing');
        const text = div.innerText.trim();
        
        if (text === '') {
            wrapper.removeChild(div);
        } else {
            const newAnno = {
                id: Date.now().toString(),
                pageNum: pageNum,
                x: baseX,
                y: baseY,
                text: text,
                fontSize: baseFontSize,
                color: color
            };
            annotations.push(newAnno);
            
            // Asignar ID al elemento para futuras referencias
            div.dataset.id = newAnno.id;
            
            // Añadir listener para cuando editen una anotación ya guardada
            setupExistingAnnotation(div, newAnno, currentScale);
        }
    });
}

export function renderAnnotation(anno, wrapper, scale) {
    const div = document.createElement('div');
    div.className = 'text-annotation';
    div.contentEditable = true;
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
    div.addEventListener('focus', () => {
        div.classList.add('editing');
        activeAnnotation = div;
    });
    div.addEventListener('blur', () => {
        div.classList.remove('editing');
        const text = div.innerText.trim();
        if (text === '') {
            div.remove();
            annotations = annotations.filter(a => a.id !== anno.id);
        } else {
            anno.text = text;
        }
    });

    // Drag & Drop
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    div.addEventListener('mousedown', (e) => {
        // No arrastrar si estamos editando el texto
        if (div.classList.contains('editing') || e.button !== 0) return;
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = parseFloat(div.style.left);
        initialTop = parseFloat(div.style.top);
        div.style.cursor = 'move';
        
        // Evitar que el mousedown seleccione texto o dispare creación de nueva caja
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
            div.style.cursor = 'text';
            
            // Si hay un scale provisto, usamos ese, si no intentamos sacarlo del dataset (útil para nuevas anots)
            let currentScale = scale;
            if (!currentScale) {
                const wrapper = div.closest('.pdf-page-wrapper');
                currentScale = wrapper ? parseFloat(wrapper.dataset.scale || 1.0) : 1.0;
            }

            anno.x = parseFloat(div.style.left) / currentScale;
            anno.y = parseFloat(div.style.top) / currentScale;
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
