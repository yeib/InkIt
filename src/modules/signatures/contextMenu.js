import { commitAction } from '../state.js';
import { t } from '../translations.js';
import { imageAnnotations, state } from './state.js';
import { applySignatureFooter, createSignatureFooter } from './footer.js';
import {
    copyAnnotationAppearance,
    createGroupId,
    detachFromMaster,
    syncLinkedAnnotations
} from './annotationGroups.js';

const opacityButtonIds = ['btn-op-100', 'btn-op-85', 'btn-op-60', 'btn-op-30'];

export function showImageContextMenu(anno, img, scale, event) {
    const menu = document.getElementById('sig-context-menu');
    if (!menu) return;

    menu.style.display = 'flex';
    const opacityContainer = document.getElementById('sig-ctx-opacity-container');
    if (opacityContainer) opacityContainer.style.display = 'block';

    const linkButton = document.getElementById('sig-ctx-link');
    const master = anno.groupId
        && imageAnnotations.find(item => item.groupId === anno.groupId && item.isMaster);
    if (linkButton) {
        linkButton.style.display = !anno.isMaster && master ? 'inline-flex' : 'none';
        if (!anno.isMaster && master) {
            const isLinked = anno.isLinked;
            linkButton.textContent = t(isLinked ? 'ctx.unlink' : 'ctx.link_master');
            linkButton.dataset.action = isLinked ? 'unlink' : 'link';
        }
    }

    const opacity = anno.opacity || 1.0;
    const activeOpacityButton = opacity >= 0.95 ? 'btn-op-100'
        : opacity >= 0.8 ? 'btn-op-85'
            : opacity >= 0.5 ? 'btn-op-60' : 'btn-op-30';
    opacityButtonIds.forEach(id => {
        document.getElementById(id)?.classList.toggle('active', id === activeOpacityButton);
    });

    const rect = menu.getBoundingClientRect();
    let top = event.clientY;
    let left = event.clientX;
    if (top + rect.height > window.innerHeight) top -= rect.height;
    if (left + rect.width > window.innerWidth) left -= rect.width;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function getPageDimensions(img, scale) {
    const wrapper = img.closest('.pdf-page-wrapper');
    let width = 595.28;
    let height = 841.89;
    if (wrapper) {
        const canvas = wrapper.querySelector('canvas');
        if (canvas) {
            width = canvas.width / window.devicePixelRatio / scale;
            height = canvas.height / window.devicePixelRatio / scale;
        }
    }
    return { width, height };
}

async function applyFooter(anno, img, scale, menu) {
    const { width, height } = getPageDimensions(img, scale);
    try {
        if (!anno.footerDataUrl) {
            anno.footerDataUrl = await createSignatureFooter(anno.normalDataUrl || anno.dataUrl);
        }
        await applySignatureFooter(anno, img, scale, width, height);
        syncLinkedAnnotations(anno);
        commitAction();
    } catch (error) {
        console.error('Error aplicando el pie de firma:', error);
    } finally {
        if (menu) menu.style.display = 'none';
    }
}

function applyFooterSize(anno, img, scale, menu) {
    const { width: pageWidth, height: pageHeight } = getPageDimensions(img, scale);
    if (!anno.footerDataUrl) {
        void applyFooter(anno, img, scale, menu);
        return;
    }

    void applySignatureFooter(anno, img, scale, pageWidth, pageHeight)
        .then(() => {
            syncLinkedAnnotations(anno);
            commitAction();
        })
        .catch(error => console.error('Error aplicando el pie de firma:', error))
        .finally(() => {
            if (menu) menu.style.display = 'none';
        });
}

function createSizeHandler(menu) {
    return sizeType => {
        const anno = state.ctxMenuActiveAnno;
        const img = state.ctxMenuActiveImg;
        if (!anno || !img) return;

        detachFromMaster(anno);
        let ratio = anno.originalRatio || (anno.width / anno.height);

        if ((sizeType === 'S' || sizeType === 'M')
            && anno.footerDataUrl
            && anno.dataUrl === anno.footerDataUrl) {
            anno.dataUrl = anno.normalDataUrl;
            img.src = anno.normalDataUrl;
            ratio = anno.normalRatio || ratio;
            anno.originalRatio = ratio;
        }

        const isStamp = ratio > 3;
        const baseWidth = anno.initialWidth || (isStamp ? 300 : 150);
        const baseHeight = baseWidth / ratio;
        let width;
        let height;

        if (sizeType === 'S') {
            width = baseWidth * 0.6;
            height = baseHeight * 0.6;
        } else if (sizeType === 'M') {
            width = baseWidth;
            height = baseHeight;
        } else if (sizeType === 'L' && anno.type !== 'esign') {
            width = baseWidth * 1.5;
            height = baseHeight * 1.5;
        } else if (sizeType === 'L' && anno.type === 'esign') {
            if (!anno.footerDataUrl || anno.dataUrl !== anno.footerDataUrl) {
                applyFooterSize(anno, img, state.ctxMenuActiveScale, menu);
                return;
            }
            const { width: pageWidth } = getPageDimensions(img, state.ctxMenuActiveScale);
            width = pageWidth - 40;
            height = width / ratio;
            anno.x = 20;
            anno.y = getPageDimensions(img, state.ctxMenuActiveScale).height - height - 20;
        }

        anno.width = width;
        anno.height = height;
        const scale = state.ctxMenuActiveScale;
        img.style.width = `${width * scale}px`;
        img.style.height = `${height * scale}px`;
        img.style.left = `${anno.x * scale}px`;
        img.style.top = `${anno.y * scale}px`;

        if (menu) menu.style.display = 'none';
        syncLinkedAnnotations(anno);
        commitAction();
    };
}

function setupDelete(menu) {
    document.getElementById('sig-ctx-delete')?.addEventListener('click', () => {
        const anno = state.ctxMenuActiveAnno;
        const img = state.ctxMenuActiveImg;
        if (!anno || !img) return;

        img.remove();
        const index = imageAnnotations.findIndex(item => item.id === anno.id);
        if (index > -1) {
            const [deletedAnno] = imageAnnotations.splice(index, 1);
            if (deletedAnno.isMaster) {
                imageAnnotations
                    .filter(item => item.groupId === deletedAnno.groupId && item.isLinked)
                    .forEach(item => {
                        item.isLinked = false;
                        item.groupId = null;
                    });
            }
        }
        if (menu) menu.style.display = 'none';
        commitAction();
    });
}

function setupOpacity(menu) {
    const applyOpacity = value => {
        const anno = state.ctxMenuActiveAnno;
        const img = state.ctxMenuActiveImg;
        if (!anno || !img) return;

        detachFromMaster(anno);
        anno.opacity = value;
        img.style.opacity = value;
        const activeButtonId = value === 1.0 ? 'btn-op-100'
            : value === 0.85 ? 'btn-op-85'
                : value === 0.6 ? 'btn-op-60' : 'btn-op-30';
        opacityButtonIds.forEach(id => {
            document.getElementById(id)?.classList.toggle('active', id === activeButtonId);
        });
        if (menu) menu.style.display = 'none';
        syncLinkedAnnotations(anno);
        commitAction();
    };

    document.getElementById('btn-op-100')?.addEventListener('click', () => applyOpacity(1.0));
    document.getElementById('btn-op-85')?.addEventListener('click', () => applyOpacity(0.85));
    document.getElementById('btn-op-60')?.addEventListener('click', () => applyOpacity(0.6));
    document.getElementById('btn-op-30')?.addEventListener('click', () => applyOpacity(0.3));
}

function setupLink() {
    document.getElementById('sig-ctx-link')?.addEventListener('click', () => {
        const anno = state.ctxMenuActiveAnno;
        if (!anno || anno.isMaster || !anno.groupId) return;

        const master = imageAnnotations.find(item => item.groupId === anno.groupId && item.isMaster);
        if (!master) return;

        if (anno.isLinked) {
            anno.isLinked = false;
        } else {
            copyAnnotationAppearance(master, anno);
            anno.isLinked = true;
        }
        const menu = document.getElementById('sig-context-menu');
        if (menu) menu.style.display = 'none';
        commitAction();
    });
}

function setupAllPages(menu, renderImageAnnotation) {
    document.getElementById('sig-ctx-all-pages')?.addEventListener('click', async () => {
        const anno = state.ctxMenuActiveAnno;
        if (!anno) return;

        const pdfViewer = await import('../../core/pdfViewer.js');
        const totalPages = pdfViewer.getTotalPages();
        const groupId = anno.isMaster && anno.groupId ? anno.groupId : createGroupId();
        anno.groupId = groupId;
        anno.isMaster = true;
        anno.isLinked = false;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            if (pageNum === anno.pageNum) continue;

            let clone = imageAnnotations.find(item =>
                item.groupId === groupId && item.pageNum === pageNum && !item.isMaster
            );
            const isNewClone = !clone;
            if (!clone) {
                clone = {
                    ...anno,
                    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                    pageNum,
                    isMaster: false,
                    isLinked: true
                };
                imageAnnotations.push(clone);
            } else {
                copyAnnotationAppearance(anno, clone);
                clone.isLinked = true;
            }

            const wrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
            if (isNewClone && wrapper?.dataset.rendered === 'true') {
                renderImageAnnotation(clone, wrapper, parseFloat(wrapper.dataset.scale || 1.0));
            }
        }
        if (menu) menu.style.display = 'none';
        commitAction();
    });
}

export function setupInteractionsMenu(renderImageAnnotation) {
    const menu = document.getElementById('sig-context-menu');
    document.addEventListener('click', event => {
        if (menu && menu.style.display === 'flex' && !menu.contains(event.target)) {
            menu.style.display = 'none';
        }
    });

    setupDelete(menu);
    const applySize = createSizeHandler(menu);
    document.getElementById('sig-ctx-s')?.addEventListener('click', () => applySize('S'));
    document.getElementById('sig-ctx-m')?.addEventListener('click', () => applySize('M'));
    document.getElementById('sig-ctx-l')?.addEventListener('click', () => applySize('L'));
    setupOpacity(menu);
    setupLink();
    setupAllPages(menu, renderImageAnnotation);
}
