export const annotations = [];

export const state = {
    isTypewriterMode: false,
    currentFontSize: 16,
    currentBgColor: "transparent",
    currentColor: '#000000',
    activeAnnotation: null,
    pendingStampType: null,
    pendingStampSymbol: null,
    pdfContainer: null,
};

export function setAnnotations(newAnnotations) {
    annotations.length = 0;
    annotations.push(...newAnnotations);
}
