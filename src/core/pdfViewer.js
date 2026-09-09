import * as pdfjsLib from 'pdfjs-dist';
import { renderAnnotationsForPage } from '../modules/typewriter.js';
import { attachHighlightOverlay } from "../modules/highlights.js";
import { renderImageAnnotationsForPage } from '../modules/signatures.js';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configurar el worker (usando la misma versión que la librería)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

let currentPdf = null;
let currentScale = 1.2;
let container = null;
let currentPdfBytes = null; // Guardar para re-renderizar al hacer zoom

export async function initPdfViewer(containerElementId) {
    container = document.getElementById(containerElementId);
    if (!container) throw new Error("Contenedor del PDF no encontrado");
    
    // Configurar Ctrl+MouseWheel para Zoom (SumatraPDF style)
    container.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                zoomIn();
            } else {
                zoomOut();
            }
        }
    }, { passive: false });
    
    // Configurar atajos de teclado globales
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey) {
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                zoomIn();
            } else if (e.key === '-') {
                e.preventDefault();
                zoomOut();
            }
        }
    });
}

function zoomIn() {
    if (!currentPdf || currentScale >= 3.0) return;
    currentScale += 0.2;
    reRenderDocument();
}

function zoomOut() {
    if (!currentPdf || currentScale <= 0.5) return;
    currentScale -= 0.2;
    reRenderDocument();
}

async function reRenderDocument() {
    if (!currentPdf) return;
    
    // Guardar posición de scroll relativa
    const scrollPercent = container.scrollTop / container.scrollHeight;
    
    container.innerHTML = '';
    for (let pageNum = 1; pageNum <= currentPdf.numPages; pageNum++) {
        await renderPage(pageNum);
    }
    
    // Restaurar scroll
    container.scrollTop = scrollPercent * container.scrollHeight;
}

export async function loadDocument(pdfBytes) {
    try {
        currentPdfBytes = pdfBytes;
        container.innerHTML = '<div class="loading-state"><p>Cargando documento...</p></div>';
        
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        currentPdf = await loadingTask.promise;
        
        console.log(`PDF cargado: ${currentPdf.numPages} páginas`);
        
        container.innerHTML = '';
        
        for (let pageNum = 1; pageNum <= currentPdf.numPages; pageNum++) {
            await renderPage(pageNum);
        }
    } catch (error) {
        console.error("Error al cargar el PDF:", error);
        container.innerHTML = `<div class="error-state"><p>Error al abrir el PDF: ${error.message}</p></div>`;
    }
}

async function renderPage(pageNum) {
    const page = await currentPdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: currentScale });
    
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'pdf-page-wrapper';
    pageWrapper.style.marginBottom = '24px';
    pageWrapper.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    pageWrapper.style.backgroundColor = 'white'; // Asegurar fondo blanco para el PDF
    
    // Almacenar data para Typewriter (escala base)
    pageWrapper.dataset.pageNum = pageNum;
    pageWrapper.dataset.scale = currentScale;
    
    // Establecer el tamaño del wrapper para que coincida exactamente con el PDF
    pageWrapper.style.width = Math.floor(viewport.width) + "px";
    pageWrapper.style.height =  Math.floor(viewport.height) + "px";
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    const savedSettings = JSON.parse(localStorage.getItem('inkit_settings') || '{"highQuality": true}');
    const outputScale = savedSettings.highQuality ? (window.devicePixelRatio || 1) : 1;
    
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    
    pageWrapper.appendChild(canvas);
    container.appendChild(pageWrapper);
    
    const transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : null;

    const renderContext = {
        canvasContext: context,
        transform: transform,
        viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Dibujar las anotaciones guardadas para esta página
    renderAnnotationsForPage(pageWrapper, pageNum, currentScale);
    renderImageAnnotationsForPage(pageWrapper, pageNum, currentScale);
    attachHighlightOverlay(pageWrapper, pageNum, currentScale);
}

export async function exportCurrentPageAsPng() {
    if (!currentPdf) throw new Error("No hay documento abierto");

    // Encontrar la página más visible
    const wrappers = document.querySelectorAll('.pdf-page-wrapper');
    if (wrappers.length === 0) throw new Error("No hay páginas renderizadas");

    let activeWrapper = wrappers[0];
    let maxVisibleHeight = 0;
    const containerRect = container.getBoundingClientRect();

    wrappers.forEach(w => {
        const rect = w.getBoundingClientRect();
        const visibleTop = Math.max(rect.top, containerRect.top);
        const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
        const visibleHeight = visibleBottom - visibleTop;
        
        if (visibleHeight > maxVisibleHeight) {
            maxVisibleHeight = visibleHeight;
            activeWrapper = w;
        }
    });

    const pageNum = parseInt(activeWrapper.dataset.pageNum);
    const scale = parseFloat(activeWrapper.dataset.scale);
    
    // Obtener el canvas original del PDF
    const origCanvas = activeWrapper.querySelector('canvas');
    if (!origCanvas) throw new Error("No se encontró el lienzo del PDF");

    // Crear canvas temporal
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = origCanvas.width;
    tempCanvas.height = origCanvas.height;
    const ctx = tempCanvas.getContext('2d');

    // 1. Dibujar el PDF de fondo
    ctx.drawImage(origCanvas, 0, 0);

    // Obtener factor de escala del device ratio
    const outputScale = window.devicePixelRatio || 1;
    const finalScale = scale * outputScale;

    // 1.5 Dibujar highlights
    const hlCanvas = activeWrapper.querySelector(".highlight-canvas");
    if (hlCanvas) {
        ctx.drawImage(hlCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
    }

    // 2. Dibujar imágenes (Firmas)
    const { imageAnnotations } = await import('../modules/signatures.js');
    const pageImages = imageAnnotations.filter(a => a.pageNum === pageNum);
    
    for (const anno of pageImages) {
        await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, anno.x * finalScale, anno.y * finalScale, anno.width * finalScale, anno.height * finalScale);
                resolve();
            };
            img.onerror = reject;
            img.src = anno.dataUrl;
        });
    }

    // 3. Dibujar textos (Typewriter)
    const { annotations } = await import('../modules/typewriter.js');
    const pageTexts = annotations.filter(a => a.pageNum === pageNum);
    
    pageTexts.forEach(anno => {
        ctx.font = `${anno.fontSize * finalScale}px sans-serif`;
        
        if (anno.bgColor && anno.bgColor !== 'transparent') {
            ctx.fillStyle = anno.bgColor === 'white' ? '#ffffff' : (anno.bgColor === 'gray' ? '#f0f0f0' : '#000000');
            const width = ctx.measureText(anno.text).width;
            ctx.fillRect(anno.x * finalScale - (2*outputScale), anno.y * finalScale - (2*outputScale), width + (4*outputScale), (anno.fontSize * finalScale) + (4*outputScale));
        }
        
        ctx.fillStyle = (anno.bgColor === 'black' && anno.color === '#000000') ? '#ffffff' : anno.color;
        ctx.textBaseline = 'top'; // Para alinear con el left/top del HTML
        // Ajuste empírico vertical para coincidir con cómo el navegador renderiza el div vs el fillText
        ctx.fillText(anno.text, anno.x * finalScale, (anno.y * finalScale) + (2 * outputScale)); 
    });

    // 4. Retornar Base64
    // Le quitamos el prefijo 'data:image/png;base64,' para guardarlo directo con Tauri
    const dataUrl = tempCanvas.toDataURL('image/png');
    return dataUrl.replace(/^data:image\/png;base64,/, "");
}
