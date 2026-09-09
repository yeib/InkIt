import { globalHistory } from './history.js';
import { annotations, setAnnotations, renderAnnotationsForPage } from './typewriter.js';
import { imageAnnotations, setImageAnnotations, renderImageAnnotationsForPage } from './signatures.js';
import { highlightAnnotations, setHighlightAnnotations } from "./highlights.js";
import { renderHighlightsForPage } from "./highlights.js";

export function getGlobalState() {
    return {
        annotations: JSON.parse(JSON.stringify(annotations)),
        imageAnnotations: JSON.parse(JSON.stringify(imageAnnotations)),
        highlightAnnotations: JSON.parse(JSON.stringify(highlightAnnotations))
    };
}

export function restoreGlobalState(state) {
    if (!state) return;
    setAnnotations(state.annotations || []);
    setImageAnnotations(state.imageAnnotations || []);
    setHighlightAnnotations(state.highlightAnnotations || []);
    
    // Refresh all pages DOM
    document.querySelectorAll('.pdf-page-wrapper').forEach(wrapper => {
        const pageNum = parseInt(wrapper.dataset.pageNum);
        const scale = parseFloat(wrapper.dataset.scale);
        
        // Limpiar anotaciones actuales del DOM
        wrapper.querySelectorAll('.text-annotation').forEach(el => el.remove());
        wrapper.querySelectorAll('.img-annotation').forEach(el => el.remove());
        
        renderAnnotationsForPage(pageNum, wrapper, scale);
        renderImageAnnotationsForPage(wrapper, pageNum, scale);
        const hlCanvas = wrapper.querySelector(".highlight-canvas");
        if (hlCanvas) {
            hlCanvas.getContext("2d").clearRect(0, 0, hlCanvas.width, hlCanvas.height);
            renderHighlightsForPage(pageNum, hlCanvas, scale);
        }
    });
}

export function commitAction() {
    globalHistory.pushState(getGlobalState());
}
