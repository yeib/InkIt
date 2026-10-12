/**
 * Rasteriza un trazo libre en un canvas temporal y devuelve el PNG transparente + su bounding box.
 * Utiliza curvas cuadráticas para suavizado natural sin esquinas poligonales bruscas.
 */
export function rasterizeStroke(rawPoints, strokeW, color) {
    if (!rawPoints || rawPoints.length === 0) return null;
    const points = rawPoints.length === 1
        ? [rawPoints[0], { x: rawPoints[0].x + 0.5, y: rawPoints[0].y + 0.5 }]
        : rawPoints;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }

    const pad = strokeW * 2 + 4;
    const x = Math.max(0, minX - pad);
    const y = Math.max(0, minY - pad);
    const width = Math.max(10, maxX - minX + pad * 2);
    const height = Math.max(10, maxY - minY + pad * 2);

    const scaleFactor = 2.0;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scaleFactor);
    canvas.height = Math.ceil(height * scaleFactor);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(scaleFactor, scaleFactor);
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const rel = points.map((p) => ({ x: p.x - x, y: p.y - y }));
    ctx.beginPath();
    ctx.moveTo(rel[0].x, rel[0].y);
    if (rel.length === 2) {
        ctx.lineTo(rel[1].x, rel[1].y);
    } else {
        for (let i = 1; i < rel.length - 1; i++) {
            const midX = (rel[i].x + rel[i + 1].x) / 2;
            const midY = (rel[i].y + rel[i + 1].y) / 2;
            ctx.quadraticCurveTo(rel[i].x, rel[i].y, midX, midY);
        }
        ctx.lineTo(rel[rel.length - 1].x, rel[rel.length - 1].y);
    }
    ctx.stroke();

    return {
        dataUrl: canvas.toDataURL('image/png'),
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height)
    };
}
