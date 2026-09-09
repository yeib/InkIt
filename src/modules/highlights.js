import { commitAction } from './state.js';

export let highlightAnnotations = [];

let isHighlightMode = false;
let currentColor = 'rgba(255, 255, 0, 0.4)';
let pdfContainer = null;
let isDrawing = false;
let currentPath = null;
let currentPathData = [];

export function initHighlights(containerId) {
    pdfContainer = document.getElementById(containerId);
    
    const btnHighlight = document.getElementById('btn-highlight');
    const toolbar = document.getElementById('highlight-toolbar');
    const colorBtns = toolbar.querySelectorAll('.color-btn');

    window.enableHighlights = () => {
        isHighlightMode = true;
        toolbar.style.display = 'flex';
        pdfContainer.style.cursor = 'crosshair';
    };

    window.disableHighlights = () => {
        isHighlightMode = false;
        toolbar.style.display = 'none';
    };
    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            colorBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentColor = btn.dataset.color;
        });
    });
}

// Lógica de dibujo libre (Overlay Canvas)
export function attachHighlightOverlay(pageWrapper, pageNum, scale) {
    let canvas = pageWrapper.querySelector('.highlight-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'highlight-canvas';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none'; // Eventos los atrapa el wrapper
        canvas.style.zIndex = '5';
        pageWrapper.appendChild(canvas);
    }
    
    // Resize
    canvas.width = pageWrapper.offsetWidth;
    canvas.height = pageWrapper.offsetHeight;
    
    const ctx = canvas.getContext('2d');
    
    // Renderizar highlights existentes
    renderHighlightsForPage(pageNum, canvas, scale);
    
    // Eventos
    pageWrapper.addEventListener('mousedown', (e) => {
        if (!isHighlightMode) return;
        if (e.button !== 0) return;
        
        isDrawing = true;
        const rect = pageWrapper.getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        
        currentPathData = [{x, y}];
    });

    pageWrapper.addEventListener('mousemove', (e) => {
        if (!isHighlightMode || !isDrawing) return;
        
        const rect = pageWrapper.getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        
        currentPathData.push({x, y});
        
        // Dibujar frame actual
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderHighlightsForPage(pageNum, canvas, scale);
        drawPath(ctx, currentPathData, currentColor, scale);
    });

    const finishDrawing = () => {
        if (!isDrawing) return;
        isDrawing = false;
        
        if (currentPathData.length > 1) {
            highlightAnnotations.push({
                id: 'hl_' + Date.now(),
                pageNum: pageNum,
                color: currentColor,
                points: [...currentPathData]
            });
            commitAction();
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderHighlightsForPage(pageNum, canvas, scale);
    };

    pageWrapper.addEventListener('mouseup', finishDrawing);
    pageWrapper.addEventListener('mouseleave', finishDrawing);
}

function drawPath(ctx, points, color, scale) {
    if (points.length < 2) return;
    
    ctx.beginPath();
    ctx.moveTo(points[0].x * scale, points[0].y * scale);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * scale, points[i].y * scale);
    }
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 15 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Use multiply blend mode if possible, but globalAlpha is easier for standard canvases
    ctx.globalCompositeOperation = 'multiply';
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; // reset
}

export function renderHighlightsForPage(pageNum, canvas, scale) {
    const ctx = canvas.getContext('2d');
    const annos = highlightAnnotations.filter(a => a.pageNum === pageNum);
    
    annos.forEach(anno => {
        drawPath(ctx, anno.points, anno.color, scale);
    });
}

export function setHighlightAnnotations(newAnnotations) { 
    highlightAnnotations.length = 0; 
    highlightAnnotations.push(...newAnnotations); 
}
