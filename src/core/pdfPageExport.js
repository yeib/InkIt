export async function renderPageAsPng(activeWrapper, pageNum, scale) {
    const originalCanvas = activeWrapper.querySelector('canvas');
    if (!originalCanvas) throw new Error("No se encontró el lienzo del PDF");

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = originalCanvas.width;
    outputCanvas.height = originalCanvas.height;
    const context = outputCanvas.getContext('2d');
    const savedSettings = JSON.parse(localStorage.getItem('inkit_settings') || '{}');

    if (savedSettings.darkMode) {
        context.fillStyle = '#1a1a1a';
        context.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
        context.filter = 'invert(0.9) hue-rotate(180deg) brightness(0.9) contrast(1.1)';
        context.drawImage(originalCanvas, 0, 0);
        context.filter = 'none';
    } else {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
        context.drawImage(originalCanvas, 0, 0);
    }

    const outputScale = window.devicePixelRatio || 1;
    const finalScale = scale * outputScale;
    const highlightCanvas = activeWrapper.querySelector('.highlight-canvas');
    if (highlightCanvas) {
        if (savedSettings.darkMode) {
            context.filter = 'invert(0.9) hue-rotate(180deg) brightness(0.9) contrast(1.1)';
        }
        context.drawImage(highlightCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
        context.filter = 'none';
    }

    const { imageAnnotations } = await import('../modules/signatures.js');
    for (const annotation of imageAnnotations.filter(item => item.pageNum === pageNum)) {
        await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                context.globalAlpha = annotation.opacity || 1.0;
                context.drawImage(
                    image,
                    annotation.x * finalScale,
                    annotation.y * finalScale,
                    annotation.width * finalScale,
                    annotation.height * finalScale
                );
                context.globalAlpha = 1.0;
                resolve();
            };
            image.onerror = reject;
            image.src = annotation.dataUrl;
        });
    }

    const { annotations } = await import('../modules/typewriter.js');
    for (const annotation of annotations.filter(item => item.pageNum === pageNum)) {
        context.font = `${annotation.fontSize * finalScale}px Arial, sans-serif`;

        if (annotation.bgColor && annotation.bgColor !== 'transparent') {
            const backgroundColor = annotation.bgColor === 'white' ? '#ffffff'
                : annotation.bgColor === 'gray' ? '#f0f0f0'
                    : annotation.bgColor === 'black' ? '#000000' : 'transparent';
            context.fillStyle = backgroundColor;
            const textWidth = context.measureText(annotation.text).width;
            context.fillRect(
                annotation.x * finalScale - (2 * outputScale),
                annotation.y * finalScale - (2 * outputScale),
                textWidth + (4 * outputScale),
                (annotation.fontSize * finalScale) + (4 * outputScale)
            );
        }

        context.fillStyle = annotation.bgColor === 'black' && annotation.color === '#000000'
            ? '#ffffff' : annotation.color;
        context.textBaseline = 'top';
        context.fillText(
            annotation.text,
            annotation.x * finalScale,
            (annotation.y * finalScale) + (2 * outputScale)
        );
    }

    return outputCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}
