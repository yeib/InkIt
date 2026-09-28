import { imageAnnotations } from './state.js';

function updateAnnotationElement(anno) {
    const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${anno.pageNum}"]`);
    const img = [...(pageWrapper?.querySelectorAll('.img-annotation') || [])]
        .find(element => element.dataset.id === anno.id);
    if (!img) return;

    const scale = parseFloat(pageWrapper.dataset.scale || 1.0);
    img.style.left = `${anno.x * scale}px`;
    img.style.top = `${anno.y * scale}px`;
    img.style.width = `${anno.width * scale}px`;
    img.style.height = `${anno.height * scale}px`;
    img.style.opacity = anno.opacity ?? 1.0;
    if (img.src !== anno.dataUrl) img.src = anno.dataUrl;
}

export function copyAnnotationAppearance(source, target) {
    target.x = source.x;
    target.y = source.y;
    target.width = source.width;
    target.height = source.height;
    target.opacity = source.opacity ?? 1.0;
    target.dataUrl = source.dataUrl;
    target.footerDataUrl = source.footerDataUrl;
    target.normalDataUrl = source.normalDataUrl;
    target.originalRatio = source.originalRatio;
    target.normalRatio = source.normalRatio;
    target.initialWidth = source.initialWidth;
    target.type = source.type;
    updateAnnotationElement(target);
}

export function syncLinkedAnnotations(master) {
    if (!master.isMaster || !master.groupId) return;

    imageAnnotations
        .filter(anno => anno.groupId === master.groupId && anno.isLinked && !anno.isMaster)
        .forEach(anno => copyAnnotationAppearance(master, anno));
}

export function detachFromMaster(anno) {
    if (!anno.isMaster && anno.isLinked) anno.isLinked = false;
}

export function createGroupId() {
    return `sig_group_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
