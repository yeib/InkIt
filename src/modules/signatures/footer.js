import { getLang } from '../translations.js';

function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('No se pudo cargar la imagen de la firma'));
        image.src = source;
    });
}

export async function createSignatureFooter(originalDataUrl) {
    const originalImage = await loadImage(originalDataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 120;
    const context = canvas.getContext('2d');
    context.scale(2, 2);

    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.fillRect(0, 0, 800, 60);
    context.strokeStyle = '#003399';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(800, 0);
    context.stroke();

    const ratio = originalImage.width / originalImage.height;
    let imageWidth = 150;
    let imageHeight = imageWidth / ratio;
    if (imageHeight > 40) {
        imageHeight = 40;
        imageWidth = imageHeight * ratio;
    }
    context.drawImage(originalImage, 20, 10, imageWidth, imageHeight);

    context.fillStyle = '#333333';
    context.font = '12px Arial';
    const isSpanish = getLang().startsWith('es');
    context.fillText(
        isSpanish
            ? 'Verificado digitalmente por validación criptográfica PAdES'
            : 'Digitally verified by PAdES cryptographic validation',
        20 + imageWidth + 20,
        25
    );
    context.fillText(
        isSpanish
            ? `Fecha de firma: ${new Date().toLocaleString()}`
            : `Signature Date: ${new Date().toLocaleString()}`,
        20 + imageWidth + 20,
        45
    );

    const drawBrand = () => {
        context.fillStyle = '#003399';
        context.font = 'italic 20px "Segoe Script", cursive, Arial';
        context.fillText('InkIt', 650, 30);
        context.font = '12px Arial';
        context.fillText('VERIFIED', 655, 45);
        return canvas.toDataURL('image/png');
    };

    const logo = new Image();
    const footerDataUrl = await new Promise(resolve => {
        logo.onload = () => {
            context.drawImage(logo, 730, 5, 50, 50);
            resolve(drawBrand());
        };
        logo.onerror = () => resolve(drawBrand());
        logo.src = '/InkIt_Logo.png';
    });

    return footerDataUrl;
}

export async function applySignatureFooter(annotation, imageElement, scale, pageWidth, pageHeight) {
    const footerImage = await loadImage(annotation.footerDataUrl);
    const ratio = footerImage.width / footerImage.height;
    const width = pageWidth - 40;
    const height = width / ratio;

    annotation.originalRatio = ratio;
    annotation.dataUrl = annotation.footerDataUrl;
    annotation.width = width;
    annotation.height = height;
    annotation.x = 20;
    annotation.y = pageHeight - height - 20;

    imageElement.src = annotation.footerDataUrl;
    imageElement.style.width = `${width * scale}px`;
    imageElement.style.height = `${height * scale}px`;
    imageElement.style.left = `${annotation.x * scale}px`;
    imageElement.style.top = `${annotation.y * scale}px`;
}
