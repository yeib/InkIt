export const imageAnnotations = [];

export const state = {
    isStampingMode: false,
    selectedSignatureBase64: null,
    pdfContainer: null,
    ctxMenuActiveAnno: null,
    ctxMenuActiveImg: null,
    ctxMenuActiveScale: 1.0,
    canvas: null,
    ctx: null,
    isDrawing: false
};

export function setImageAnnotations(newAnnotations) {
    imageAnnotations.length = 0;
    imageAnnotations.push(...newAnnotations);
}
