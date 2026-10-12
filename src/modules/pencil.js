import { addImageAnnotationToPage } from './signatures.js';
import { rasterizeStroke } from './pencil/rasterizeStroke.js';

let isPencilMode = false;
let pencilWidth = 3;
let pencilColor = '#000000';
let pdfContainer = null;
let isDrawing = false;
let currentPathData = [];

export function initPencil(containerId) {
    pdfContainer = document.getElementById(containerId);

    const toolbar = document.getElementById('pencil-toolbar');
    if (!toolbar) return;

    const sizeInput = document.getElementById('pencil-size');
    if (sizeInput) {
        sizeInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val) && val >= 1 && val <= 30) {
                pencilWidth = val;
            }
        });
    }

    const colorBtns = toolbar.querySelectorAll('.color-btn');
    colorBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            colorBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            pencilColor = btn.dataset.color || '#000000';
        });
    });

    window.enablePencil = () => {
        isPencilMode = true;
        if (toolbar) toolbar.style.display = 'flex';
        if (pdfContainer) pdfContainer.style.cursor = 'crosshair';
    };

    window.disablePencil = () => {
        isPencilMode = false;
        if (toolbar) toolbar.style.display = 'none';
        if (pdfContainer) pdfContainer.style.cursor = 'default';
    };
}

export function attachPencilOverlay(pageWrapper, pageNum, scale) {
    let canvas = pageWrapper.querySelector('.pencil-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'pencil-canvas';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '6';
        pageWrapper.appendChild(canvas);
    }

    canvas.width = pageWrapper.offsetWidth;
    canvas.height = pageWrapper.offsetHeight;

    if (!pageWrapper._pencilEventsAttached) {
        pageWrapper._pencilEventsAttached = true;

        pageWrapper.addEventListener('mousedown', (e) => {
            if (!isPencilMode) return;
            if (e.button !== 0) return;

            isDrawing = true;
            const pScale = parseFloat(pageWrapper.dataset.scale || 1.0);
            const rect = pageWrapper.getBoundingClientRect();
            const x = (e.clientX - rect.left) / pScale;
            const y = (e.clientY - rect.top) / pScale;

            currentPathData = [{ x, y }];
        });

        pageWrapper.addEventListener('mousemove', (e) => {
            if (!isPencilMode || !isDrawing) return;

            const pScale = parseFloat(pageWrapper.dataset.scale || 1.0);
            const rect = pageWrapper.getBoundingClientRect();
            const x = (e.clientX - rect.left) / pScale;
            const y = (e.clientY - rect.top) / pScale;

            currentPathData.push({ x, y });

            const cvs = pageWrapper.querySelector('.pencil-canvas');
            if (cvs) {
                const ctx = cvs.getContext('2d');
                ctx.clearRect(0, 0, cvs.width, cvs.height);
                drawLiveStroke(ctx, currentPathData, pencilColor, pencilWidth, pScale);
            }
        });

        const finishDrawing = () => {
            if (!isDrawing) return;
            isDrawing = false;

            const pNum = parseInt(pageWrapper.dataset.pageNum);
            const cvs = pageWrapper.querySelector('.pencil-canvas');
            if (cvs) {
                const ctx = cvs.getContext('2d');
                ctx.clearRect(0, 0, cvs.width, cvs.height);
            }

            if (currentPathData.length > 1) {
                const stroke = rasterizeStroke(currentPathData, pencilWidth, pencilColor);
                if (stroke) {
                    addImageAnnotationToPage(
                        stroke.dataUrl,
                        pNum,
                        stroke.x,
                        stroke.y,
                        stroke.width,
                        null,
                        'draw'
                    );
                }
            }
            currentPathData = [];
        };

        pageWrapper.addEventListener('mouseup', finishDrawing);
        pageWrapper.addEventListener('mouseleave', finishDrawing);
    }
}

function drawLiveStroke(ctx, points, color, width, scale) {
    if (!points || points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x * scale, points[0].y * scale);
    for (let i = 1; i < points.length - 1; i++) {
        const midX = ((points[i].x + points[i + 1].x) / 2) * scale;
        const midY = ((points[i].y + points[i + 1].y) / 2) * scale;
        ctx.quadraticCurveTo(points[i].x * scale, points[i].y * scale, midX, midY);
    }
    ctx.lineTo(points[points.length - 1].x * scale, points[points.length - 1].y * scale);
    ctx.stroke();
    ctx.restore();
}
