import { globalHistory } from './history.js';
import { annotations, setAnnotations, renderAnnotationsForPage } from './typewriter.js';
import { imageAnnotations, setImageAnnotations, renderImageAnnotationsForPage } from './signatures.js';
import { highlightAnnotations, setHighlightAnnotations, renderHighlightsForPage } from "./highlights.js";

export function getGlobalState() {
    return {
        annotations: JSON.parse(JSON.stringify(annotations)),
        imageAnnotations: JSON.parse(JSON.stringify(imageAnnotations)),
        highlightAnnotations: JSON.parse(JSON.stringify(highlightAnnotations))
    };
}

export function restoreGlobalState(state) {
    if (!state) return;

    // Collect all pages that had annotations before OR have annotations in the new state
    const affectedPages = new Set([
        ...annotations.map(a => a.pageNum),
        ...imageAnnotations.map(a => a.pageNum),
        ...highlightAnnotations.map(a => a.pageNum),
        ...(state.annotations || []).map(a => a.pageNum),
        ...(state.imageAnnotations || []).map(a => a.pageNum),
        ...(state.highlightAnnotations || []).map(a => a.pageNum)
    ]);

    setAnnotations(state.annotations || []);
    setImageAnnotations(state.imageAnnotations || []);
    setHighlightAnnotations(state.highlightAnnotations || []);

    // Only update pages that were actually affected
    affectedPages.forEach(pageNum => {
        const wrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
        if (!wrapper) return;

        const scale = parseFloat(wrapper.dataset.scale || 1.0);
        wrapper.querySelectorAll('.text-annotation').forEach(el => el.remove());
        wrapper.querySelectorAll('.img-annotation').forEach(el => el.remove());

        renderAnnotationsForPage(wrapper, pageNum, scale);
        renderImageAnnotationsForPage(wrapper, pageNum, scale);

        const hlCanvas = wrapper.querySelector('.highlight-canvas');
        if (hlCanvas) {
            hlCanvas.getContext('2d').clearRect(0, 0, hlCanvas.width, hlCanvas.height);
            renderHighlightsForPage(pageNum, hlCanvas, scale);
        }
    });
}

export let isDirty = false;
export function getIsDirty() {
    return isDirty;
}
export function setDirty(val) { 
    isDirty = val; 
    const btnSave = document.getElementById('btn-quick-save');
    if (btnSave) {
        btnSave.style.display = isDirty ? 'inline-block' : 'none';
    }
}

export function commitAction() {
    setDirty(true);
    globalHistory.pushState(getGlobalState());
}
