import { attachHighlightOverlay } from '../modules/highlights.js';
import { renderImageAnnotationsForPage } from '../modules/signatures.js';
import { renderAnnotationsForPage } from '../modules/typewriter.js';

let pageObserver = null;

export function createPageWrappers(container, numPages, scale, defaultWidth, defaultHeight) {
    const fragment = document.createDocumentFragment();
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'pdf-page-wrapper';
        wrapper.style.margin = '0 auto 24px auto';
        wrapper.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        wrapper.style.backgroundColor = 'white';
        wrapper.style.position = 'relative';
        wrapper.style.width = `${defaultWidth}px`;
        wrapper.style.height = `${defaultHeight}px`;
        wrapper.dataset.pageNum = pageNum;
        wrapper.dataset.scale = scale;
        wrapper.dataset.rendered = 'false';
        fragment.appendChild(wrapper);
    }
    container.appendChild(fragment);
}

export function schedulePageDimensionUpdate(container, pdf, numPages, getPdf, getRequestId, getScale) {
    const requestId = getRequestId();
    setTimeout(() => {
        if (pdf !== getPdf() || requestId !== getRequestId()) return;
        const wrappers = Array.from(container.querySelectorAll('.pdf-page-wrapper'));
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            if (pdf !== getPdf() || requestId !== getRequestId()) break;
            pdf.getPage(pageNum).then(page => {
                if (pdf !== getPdf() || requestId !== getRequestId()) return;
                const viewport = page.getViewport({ scale: getScale() });
                const wrapper = wrappers[pageNum - 1];
                if (wrapper && wrapper.dataset.rendered === 'false') {
                    wrapper.style.width = `${Math.floor(viewport.width)}px`;
                    wrapper.style.height = `${Math.floor(viewport.height)}px`;
                }
            }).catch(() => {});
        }
    }, 0);
}

export function setupPageObserver(container, getPdf, getScale) {
    disconnectPageObserver();

    pageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const wrapper = entry.target;
            const pageNum = parseInt(wrapper.dataset.pageNum);

            if (entry.isIntersecting) {
                if (wrapper.dataset.rendered !== "true" && !wrapper._isRendering) {
                    renderPageContent(wrapper, pageNum, getPdf, getScale);
                }
            } else {
                const pdf = getPdf();
                if (pdf && pdf.numPages > 15 && wrapper.dataset.rendered === "true") {
                    unrenderPageContent(wrapper);
                }
            }
        });
    }, {
        root: container,
        rootMargin: '800px 0px 800px 0px'
    });

    container.querySelectorAll('.pdf-page-wrapper').forEach(wrapper => {
        pageObserver.observe(wrapper);
    });
}

export function disconnectPageObserver() {
    pageObserver?.disconnect();
    pageObserver = null;
}

export async function renderPageContent(wrapper, pageNum, getPdf, getScale) {
    const pdf = getPdf();
    if (!pdf || wrapper.dataset.rendered === "true" || wrapper._isRendering) return;
    wrapper._isRendering = true;

    try {
        const page = await pdf.getPage(pageNum);
        if (pdf !== getPdf() || !wrapper.isConnected) return;
        const scale = getScale();
        const viewport = page.getViewport({ scale });

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

        if (wrapper._renderTask) {
            try { wrapper._renderTask.cancel(); } catch (e) {}
        }
        wrapper._renderTask = page.render({
            canvasContext: context,
            transform,
            viewport
        });
        await wrapper._renderTask.promise;
        wrapper._renderTask = null;

        renderAnnotationsForPage(wrapper, pageNum, scale);
        renderImageAnnotationsForPage(wrapper, pageNum, scale);
        attachHighlightOverlay(wrapper, pageNum, scale);

        wrapper.dataset.rendered = "true";
    } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
            console.error(`Error rendering page ${pageNum}:`, err);
        }
    } finally {
        wrapper._isRendering = false;
    }
}

export function unrenderPageContent(wrapper) {
    if (wrapper._renderTask) {
        try { wrapper._renderTask.cancel(); } catch (e) {}
        wrapper._renderTask = null;
    }
    wrapper.querySelector('canvas:not(.highlight-canvas)')?.remove();
    wrapper.querySelector('.highlight-canvas')?.remove();
    wrapper.querySelectorAll('.text-annotation, .img-annotation').forEach(element => element.remove());
    wrapper.dataset.rendered = "false";
}
