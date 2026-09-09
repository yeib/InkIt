import { state } from './state.js';

export function setupCanvasDrawing() {
    state.ctx.lineWidth = 3;
    state.ctx.lineCap = 'round';
    state.ctx.lineJoin = 'round';
    state.ctx.strokeStyle = '#000000'; // Firma clásica en negro
    
    const startDrawing = (e) => {
        state.isDrawing = true;
        draw(e);
    };
    
    const stopDrawing = () => {
        state.isDrawing = false;
        state.ctx.beginPath(); // Reset path
    };
    
    const draw = (e) => {
        if (!state.isDrawing) return;
        
        // Obtener coordenadas relativas al canvas
        const rect = state.canvas.getBoundingClientRect();
        const scaleX = state.canvas.width / rect.width;
        const scaleY = state.canvas.height / rect.height;
        
        let clientX = e.clientX;
        let clientY = e.clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        state.ctx.lineTo(x, y);
        state.ctx.stroke();
        state.ctx.beginPath();
        state.ctx.moveTo(x, y);
    };

    state.canvas.addEventListener('mousedown', startDrawing);
    state.canvas.addEventListener('mousemove', draw);
    state.canvas.addEventListener('mouseup', stopDrawing);
    state.canvas.addEventListener('mouseout', stopDrawing);
    
    // Soporte táctil básico
    state.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e); }, {passive: false});
    state.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); }, {passive: false});
    state.canvas.addEventListener('touchend', stopDrawing);
}

export function clearCanvas() {
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
}
