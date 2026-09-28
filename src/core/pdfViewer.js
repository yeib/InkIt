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
let currentPdfBytes = null;
let currentLoadingTask = null;
let pageObserver = null;
let loadRequestId = 0;

export function getTotalPages() {
    return currentPdf ? currentPdf.numPages : 1;
}

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
        // Home/End: scroll explícito al container para evitar que el navegador use alturas de esqueleto
        if (e.key === 'Home' && currentPdf) {
            e.preventDefault();
            container.scrollTop = 0;
        }
        if (e.key === 'End' && currentPdf) {
            e.preventDefault();
            container.scrollTop = container.scrollHeight;
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

function setupPageObserver() {
    if (pageObserver) {
        pageObserver.disconnect();
    }

    pageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const wrapper = entry.target;
            const pageNum = parseInt(wrapper.dataset.pageNum);

            if (entry.isIntersecting) {
                if (wrapper.dataset.rendered !== "true" && !wrapper._isRendering) {
                    renderPageContent(wrapper, pageNum);
                }
            } else {
                // En documentos largos (> 15 páginas), liberar memoria de páginas distantes para que nunca se sature la GPU/RAM
                if (currentPdf && currentPdf.numPages > 15 && wrapper.dataset.rendered === "true") {
                    unrenderPageContent(wrapper);
                }
            }
        });
    }, {
        root: container,
        rootMargin: '800px 0px 800px 0px' // Precargar 800px antes de que entre al viewport
    });

    container.querySelectorAll('.pdf-page-wrapper').forEach(w => {
        pageObserver.observe(w);
    });
}

async function releaseCurrentPdf() {
    if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
    }

    container?.querySelectorAll('.pdf-page-wrapper').forEach(wrapper => {
        wrapper._renderTask?.cancel();
        wrapper._renderTask = null;
    });

    const pdf = currentPdf;
    const loadingTask = currentLoadingTask;
    currentPdf = null;
    currentLoadingTask = null;
    currentPdfBytes = null;
    container?.replaceChildren();

    if (loadingTask) {
        if (typeof loadingTask.destroy === 'function') {
            try { await loadingTask.destroy(); } catch(e) { console.warn(e); }
        }
    } else if (pdf) {
        if (typeof pdf.destroy === 'function') {
            try { await pdf.destroy(); } catch(e) { console.warn(e); }
        } else if (typeof pdf.cleanup === 'function') {
            try { await pdf.cleanup(); } catch(e) { console.warn(e); }
        }
    }
}

async function renderPageContent(wrapper, pageNum) {
    const pdf = currentPdf;
    if (!pdf || wrapper.dataset.rendered === "true" || wrapper._isRendering) return;
    wrapper._isRendering = true;

    try {
        const page = await pdf.getPage(pageNum);
        if (pdf !== currentPdf || !wrapper.isConnected) return;
        const viewport = page.getViewport({ scale: currentScale });

        wrapper.style.width = Math.floor(viewport.width) + "px";
        wrapper.style.height = Math.floor(viewport.height) + "px";

        let canvas = wrapper.querySelector('canvas:not(.highlight-canvas)');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            canvas.style.display = "block";
            wrapper.prepend(canvas);
        }

        const savedSettings = JSON.parse(localStorage.getItem('inkit_settings') || '{"highQuality": true}');
        const outputScale = savedSettings.highQuality ? (window.devicePixelRatio || 1) : 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);

        const context = canvas.getContext('2d');
        const transform = outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : null;

        const renderContext = {
            canvasContext: context,
            transform: transform,
            viewport: viewport
        };

        if (wrapper._renderTask) {
            try { wrapper._renderTask.cancel(); } catch (e) {}
        }
        wrapper._renderTask = page.render(renderContext);
        await wrapper._renderTask.promise;
        wrapper._renderTask = null;

        // Dibujar las anotaciones guardadas para esta página
        renderAnnotationsForPage(wrapper, pageNum, currentScale);
        renderImageAnnotationsForPage(wrapper, pageNum, currentScale);
        attachHighlightOverlay(wrapper, pageNum, currentScale);

        wrapper.dataset.rendered = "true";
    } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
            console.error(`Error rendering page ${pageNum}:`, err);
        }
    } finally {
        wrapper._isRendering = false;
    }
}

function unrenderPageContent(wrapper) {
    if (wrapper._renderTask) {
        try { wrapper._renderTask.cancel(); } catch (e) {}
        wrapper._renderTask = null;
    }
    const canvas = wrapper.querySelector('canvas:not(.highlight-canvas)');
    if (canvas) canvas.remove();

    const hlCanvas = wrapper.querySelector('.highlight-canvas');
    if (hlCanvas) hlCanvas.remove();

    wrapper.querySelectorAll('.text-annotation').forEach(el => el.remove());
    wrapper.querySelectorAll('.img-annotation').forEach(el => el.remove());

    wrapper.dataset.rendered = "false";
}

async function reRenderDocument() {
    if (!currentPdf) return;
    
    // Guardar posición de scroll relativa
    const scrollPercent = container.scrollTop / (container.scrollHeight || 1);
    
    if (pageObserver) {
        pageObserver.disconnect();
    }

    container.innerHTML = '';
    const numPages = currentPdf.numPages;

    const firstPage = await currentPdf.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: currentScale });
    const defaultW = Math.floor(firstViewport.width);
    const defaultH = Math.floor(firstViewport.height);

    const fragment = document.createDocumentFragment();
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-wrapper';
        pageWrapper.style.margin = '0 auto 24px auto';
        pageWrapper.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        pageWrapper.style.backgroundColor = 'white';
        pageWrapper.style.position = 'relative';
        pageWrapper.style.width = defaultW + "px";
        pageWrapper.style.height = defaultH + "px";
        pageWrapper.dataset.pageNum = pageNum;
        pageWrapper.dataset.scale = currentScale;
        pageWrapper.dataset.rendered = "false";
        fragment.appendChild(pageWrapper);
    }
    container.appendChild(fragment);

    setupPageObserver();

    // Background pass to fetch exact dimensions of all pages for perfect scrollbar stability
    const pdf = currentPdf;
    const reqId = loadRequestId;
    setTimeout(async () => {
        if (pdf !== currentPdf || reqId !== loadRequestId) return;
        const wrappers = Array.from(container.querySelectorAll('.pdf-page-wrapper'));
        for (let i = 1; i <= numPages; i++) {
            if (pdf !== currentPdf || reqId !== loadRequestId) break;
            pdf.getPage(i).then(page => {
                if (pdf !== currentPdf || reqId !== loadRequestId) return;
                const vp = page.getViewport({ scale: currentScale });
                const w = wrappers[i - 1];
                if (w && w.dataset.rendered === "false") {
                    w.style.width = Math.floor(vp.width) + "px";
                    w.style.height = Math.floor(vp.height) + "px";
                }
            }).catch(() => {});
        }
    }, 0);

    // Renderizar el primer lote visible en paralelo (igual que en loadDocument)
    const firstBatch = Array.from(container.querySelectorAll('.pdf-page-wrapper')).slice(0, 5);
    await Promise.all(firstBatch.map(w => renderPageContent(w, parseInt(w.dataset.pageNum))));

    // Restaurar scroll (después del primer render real para que scrollHeight sea correcto)
    container.scrollTop = scrollPercent * container.scrollHeight;
}

export async function loadDocument(pdfBytes) {
    const requestId = ++loadRequestId;
    try {
        await releaseCurrentPdf();
        if (requestId !== loadRequestId) return;

        // Limpiar estado global antes de cargar un nuevo documento para no arrastrar anotaciones anteriores
        const { setAnnotations } = await import('../modules/typewriter.js');
        const { setImageAnnotations } = await import('../modules/signatures.js');
        const { setHighlightAnnotations } = await import('../modules/highlights.js');
        setAnnotations([]);
        setImageAnnotations([]);
        setHighlightAnnotations([]);

        const { globalHistory } = await import('../modules/history.js');
        const { getGlobalState } = await import('../modules/state.js');
        globalHistory.clear(getGlobalState());

        currentPdfBytes = pdfBytes;
        container.innerHTML = '<div class="loading-state"><p>' + (window.t ? window.t('loading') : 'Loading...') + '</p></div>';
        
        currentLoadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        currentPdf = await currentLoadingTask.promise;
        if (requestId !== loadRequestId) return;
        
        console.log(`PDF cargado: ${currentPdf.numPages} páginas`);
        container.innerHTML = '';

        const numPages = currentPdf.numPages;

        // Obtener dimensiones de la primera página para el esqueleto inicial ultra-rápido
        const firstPage = await currentPdf.getPage(1);
        if (requestId !== loadRequestId) return;
        const firstViewport = firstPage.getViewport({ scale: currentScale });
        const defaultW = Math.floor(firstViewport.width);
        const defaultH = Math.floor(firstViewport.height);

        // Crear esqueletos de página en fragmento (tarda < 5ms incluso para 600 páginas)
        const fragment = document.createDocumentFragment();
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'pdf-page-wrapper';
            pageWrapper.style.margin = '0 auto 24px auto';
            pageWrapper.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            pageWrapper.style.backgroundColor = 'white';
            pageWrapper.style.position = 'relative';
            pageWrapper.style.width = defaultW + "px";
            pageWrapper.style.height = defaultH + "px";
            pageWrapper.dataset.pageNum = pageNum;
            pageWrapper.dataset.scale = currentScale;
            pageWrapper.dataset.rendered = "false";
            fragment.appendChild(pageWrapper);
        }
        container.appendChild(fragment);

        // Inicializar observador de renderizado perezoso (SumatraPDF / Virtualized style)
        setupPageObserver();

    // Background pass to fetch exact dimensions of all pages for perfect scrollbar stability
    const pdf = currentPdf;
    const reqId = loadRequestId;
    setTimeout(async () => {
        if (pdf !== currentPdf || reqId !== loadRequestId) return;
        const wrappers = Array.from(container.querySelectorAll('.pdf-page-wrapper'));
        for (let i = 1; i <= numPages; i++) {
            if (pdf !== currentPdf || reqId !== loadRequestId) break;
            pdf.getPage(i).then(page => {
                if (pdf !== currentPdf || reqId !== loadRequestId) return;
                const vp = page.getViewport({ scale: currentScale });
                const w = wrappers[i - 1];
                if (w && w.dataset.rendered === "false") {
                    w.style.width = Math.floor(vp.width) + "px";
                    w.style.height = Math.floor(vp.height) + "px";
                }
            }).catch(() => {});
        }
    }, 0);

    // Renderizar el primer lote visible en paralelo para apariencia instantánea
        // (el IntersectionObserver los capturaría igual, pero de forma secuencial — esto es más rápido)
        const firstBatch = Array.from(container.querySelectorAll('.pdf-page-wrapper')).slice(0, 5);
        await Promise.all(firstBatch.map(w => renderPageContent(w, parseInt(w.dataset.pageNum))));
        if (requestId !== loadRequestId) return;

    } catch (error) {
        if (requestId !== loadRequestId) return;
        console.error("Error al cargar el PDF:", error);
        try {
            await releaseCurrentPdf();
        } catch (cleanupError) {
            console.error("Error liberando el PDF después de un fallo de carga:", cleanupError);
        }
        container.innerHTML = `<div class="error-state"><p>Error al abrir el PDF: ${error.message}</p></div>`;
    }
}

export function getCurrentVisiblePageNum() {
    const wrappers = document.querySelectorAll('.pdf-page-wrapper');
    if (wrappers.length === 0) return 1;
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
    return parseInt(activeWrapper.dataset.pageNum) || 1;
}

export async function exportPageAsPng(pageNum) {
    if (!currentPdf) throw new Error("No hay documento abierto");

    const wrappers = Array.from(document.querySelectorAll('.pdf-page-wrapper'));
    const activeWrapper = wrappers.find(w => parseInt(w.dataset.pageNum) === pageNum);
    if (!activeWrapper) throw new Error("Página no encontrada");

    const scale = parseFloat(activeWrapper.dataset.scale);
    const wasRendered = activeWrapper.dataset.rendered === "true";
    
    // Asegurar que esté renderizada
    if (activeWrapper.dataset.rendered !== "true") {
        await renderPageContent(activeWrapper, pageNum);
    }

    // Obtener el canvas original del PDF
    const origCanvas = activeWrapper.querySelector('canvas');
    if (!origCanvas) throw new Error("No se encontró el lienzo del PDF");

    // Crear canvas temporal
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = origCanvas.width;
    tempCanvas.height = origCanvas.height;
    const ctx = tempCanvas.getContext('2d');

    // 1. Llenar el fondo primero y dibujar el PDF
    const savedSettings = JSON.parse(localStorage.getItem('inkit_settings') || '{}');
    if (savedSettings.darkMode) {
        ctx.fillStyle = '#1a1a1a'; // Color base oscuro
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        ctx.filter = 'invert(0.9) hue-rotate(180deg) brightness(0.9) contrast(1.1)';
        ctx.drawImage(origCanvas, 0, 0);
        ctx.filter = 'none'; // Reset filter for annotations
    } else {
        ctx.fillStyle = '#ffffff'; // Color base blanco
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        ctx.drawImage(origCanvas, 0, 0);
    }

    // Obtener factor de escala del device ratio
    const outputScale = window.devicePixelRatio || 1;
    const finalScale = scale * outputScale;

    // 1.5 Dibujar highlights
    const hlCanvas = activeWrapper.querySelector(".highlight-canvas");
    if (hlCanvas) {
        if (savedSettings.darkMode) {
            ctx.filter = 'invert(0.9) hue-rotate(180deg) brightness(0.9) contrast(1.1)';
        }
        ctx.drawImage(hlCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.filter = 'none'; // Reset
    }

    // 2. Dibujar imágenes (Firmas)
    const { imageAnnotations } = await import('../modules/signatures.js');
    const pageImages = imageAnnotations.filter(a => a.pageNum === pageNum);
    
    for (const anno of pageImages) {
        await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                ctx.globalAlpha = anno.opacity || 1.0;
                ctx.drawImage(img, anno.x * finalScale, anno.y * finalScale, anno.width * finalScale, anno.height * finalScale);
                ctx.globalAlpha = 1.0; // Reset
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
        ctx.font = `${anno.fontSize * finalScale}px Arial, sans-serif`;
        
        // Dibujar fondo si tiene
        if (anno.bgColor && anno.bgColor !== 'transparent') {
            const hexBg = anno.bgColor === 'white' ? '#ffffff' : (anno.bgColor === 'gray' ? '#f0f0f0' : (anno.bgColor === 'black' ? '#000000' : 'transparent'));
            ctx.fillStyle = hexBg;
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

export async function closeDocument() {
    loadRequestId++;
    await releaseCurrentPdf();
    
    // Reset internal state
    currentScale = 1.2;
    
    // Clear DOM
    container.innerHTML = `
      <div class="empty-state">
        <p data-i18n="pdf.empty">Drag & Drop a PDF document or click "Open PDF"</p>
      </div>
    `;
    
    import('../modules/translations.js').then(m => m.applyTranslations());
    
    // Clear annotations in state
    const { setAnnotations } = await import('../modules/typewriter.js');
    const { setImageAnnotations } = await import('../modules/signatures.js');
    const { setHighlightAnnotations } = await import('../modules/highlights.js');
    const { globalHistory } = await import('../modules/history.js');
    
    setAnnotations([]);
    setImageAnnotations([]);
    setHighlightAnnotations([]);
    const { getGlobalState } = await import("../modules/state.js");
    globalHistory.clear(getGlobalState());
}
