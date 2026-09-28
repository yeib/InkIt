import * as pdfjsLib from 'pdfjs-dist';
import {
    createPageWrappers,
    disconnectPageObserver,
    renderPageContent,
    schedulePageDimensionUpdate,
    setupPageObserver
} from './pdfPageRenderer.js';
import { renderPageAsPng } from './pdfPageExport.js';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configurar el worker (usando la misma versión que la librería)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

let currentPdf = null;
let currentScale = 1.2;
let container = null;
let currentLoadingTask = null;
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

async function releaseCurrentPdf() {
    disconnectPageObserver();

    container?.querySelectorAll('.pdf-page-wrapper').forEach(wrapper => {
        wrapper._renderTask?.cancel();
        wrapper._renderTask = null;
    });

    const pdf = currentPdf;
    const loadingTask = currentLoadingTask;
    currentPdf = null;
    currentLoadingTask = null;
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

async function reRenderDocument() {
    if (!currentPdf) return;
    
    // Guardar posición de scroll relativa
    const scrollPercent = container.scrollTop / (container.scrollHeight || 1);
    
    disconnectPageObserver();
    container.innerHTML = '';
    const numPages = currentPdf.numPages;

    const firstPage = await currentPdf.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: currentScale });
    const defaultW = Math.floor(firstViewport.width);
    const defaultH = Math.floor(firstViewport.height);

    createPageWrappers(container, numPages, currentScale, defaultW, defaultH);

    setupPageObserver(container, () => currentPdf, () => currentScale);

    schedulePageDimensionUpdate(
        container, currentPdf, numPages,
        () => currentPdf, () => loadRequestId, () => currentScale
    );

    // Renderizar el primer lote visible en paralelo (igual que en loadDocument)
    const firstBatch = Array.from(container.querySelectorAll('.pdf-page-wrapper')).slice(0, 5);
    await Promise.all(firstBatch.map(w =>
        renderPageContent(w, parseInt(w.dataset.pageNum), () => currentPdf, () => currentScale)
    ));

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
        createPageWrappers(container, numPages, currentScale, defaultW, defaultH);

        // Inicializar observador de renderizado perezoso (SumatraPDF / Virtualized style)
        setupPageObserver(container, () => currentPdf, () => currentScale);

        schedulePageDimensionUpdate(
            container, currentPdf, numPages,
            () => currentPdf, () => loadRequestId, () => currentScale
        );

    // Renderizar el primer lote visible en paralelo para apariencia instantánea
        // (el IntersectionObserver los capturaría igual, pero de forma secuencial — esto es más rápido)
        const firstBatch = Array.from(container.querySelectorAll('.pdf-page-wrapper')).slice(0, 5);
        await Promise.all(firstBatch.map(w =>
            renderPageContent(w, parseInt(w.dataset.pageNum), () => currentPdf, () => currentScale)
        ));
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

    // Asegurar que esté renderizada
    if (activeWrapper.dataset.rendered !== "true") {
        await renderPageContent(activeWrapper, pageNum, () => currentPdf, () => currentScale);
    }

    return renderPageAsPng(activeWrapper, pageNum, scale);
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
