export let imageAnnotations = [];

let isStampingMode = false;
let selectedSignatureBase64 = null;
let pdfContainer = null;

// Funciones de Dibujo (Signature Pad)
let isDrawing = false;
let canvas, ctx;

export function initSignatures(containerId) {
    pdfContainer = document.getElementById(containerId);
    
    const btnSign = document.getElementById('btn-sign');
    const vault = document.getElementById('signature-vault');
    const btnNewSig = document.getElementById('btn-new-signature');
    const modal = document.getElementById('signature-modal');
    
    // Canvas elements
    canvas = document.getElementById('signature-canvas');
    ctx = canvas.getContext('2d');
    
    const btnNewStamp = document.getElementById('btn-new-stamp');

    // Toggle Bóveda
    btnSign.addEventListener('click', () => {
        const isVisible = vault.style.display === 'flex';
        vault.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            renderVault();
        } else {
            window.disableSignatures();
        }
    });

    window.disableSignatures = () => {
        isStampingMode = false;
        vault.style.display = 'none';
        pdfContainer.style.cursor = 'default';
        selectedSignatureBase64 = null;
    };

    // Sello Formal (Digital Visual Stamp)
    btnNewStamp.addEventListener('click', () => {
        const name = prompt("Escribe tu Nombre para el Sello Digital:");
        if (!name) return;
        const detail = prompt("Escribe tu e-mail, cargo o ID (Opcional):") || "";
        
        // Crear un canvas temporal para dibujar el sello
        const stampCanvas = document.createElement('canvas');
        stampCanvas.width = 350;
        stampCanvas.height = 100;
        const sCtx = stampCanvas.getContext('2d');
        
        // Fondo y borde
        sCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        sCtx.fillRect(0, 0, 350, 100);
        sCtx.strokeStyle = '#003399';
        sCtx.lineWidth = 2;
        sCtx.strokeRect(1, 1, 348, 98);
        
        // Icono a la izquierda (Pluma o logo)
        sCtx.fillStyle = '#003399';
        sCtx.font = '36px Arial';
        sCtx.fillText('🖋️', 15, 60);
        
        // Separador
        sCtx.beginPath();
        sCtx.moveTo(60, 10);
        sCtx.lineTo(60, 90);
        sCtx.stroke();
        
        // Textos
        sCtx.fillStyle = '#000000';
        sCtx.font = 'bold 16px Arial';
        sCtx.fillText(`Firmado digitalmente por:`, 70, 25);
        sCtx.font = 'bold 18px Arial';
        sCtx.fillStyle = '#003399';
        sCtx.fillText(name, 70, 50);
        
        sCtx.fillStyle = '#333333';
        sCtx.font = '12px Arial';
        const today = new Date();
        const dateStr = today.toLocaleString();
        sCtx.fillText(`Fecha: ${dateStr}`, 70, 70);
        if (detail) {
            sCtx.fillText(detail, 70, 88);
        }
        
        const dataUrl = stampCanvas.toDataURL('image/png');
        let saved = JSON.parse(localStorage.getItem('inkit_signatures') || '[]');
        saved.push(dataUrl);
        localStorage.setItem('inkit_signatures', JSON.stringify(saved));
        
        renderVault();
    });

    // Nueva Firma
    btnNewSig.addEventListener('click', () => {
        clearCanvas();
        modal.style.display = 'flex';
        vault.style.display = 'none';
    });

    // Lógica de Dibujo
    setupCanvasDrawing();

    // Botones del Modal
    document.getElementById('btn-sig-import').addEventListener('click', importSignature);
    document.getElementById('btn-sig-clear').addEventListener('click', clearCanvas);
    document.getElementById('btn-sig-cancel').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    document.getElementById('btn-sig-save').addEventListener('click', () => {
        saveSignature();
        modal.style.display = 'none';
        vault.style.display = 'flex';
    });

    // Manejar estampar en el PDF
    pdfContainer.addEventListener('click', (e) => {
        if (!isStampingMode || !selectedSignatureBase64) return;
        
        const pageWrapper = e.target.closest('.pdf-page-wrapper');
        if (!pageWrapper) return;
        
        // Evitar solapamiento con clicks de typewriter si ambos estuvieran activos
        if (e.target.classList.contains('text-annotation') || e.target.classList.contains('img-annotation')) return;

        const rect = pageWrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        const pageNum = parseInt(pageWrapper.dataset.pageNum);
        const currentScale = parseFloat(pageWrapper.dataset.scale || 1.0);
        
        // Calcular posición base para que persista con el zoom
        const baseX = clickX / currentScale;
        const baseY = clickY / currentScale;
        
        const newImgAnno = {
            id: 'sig_' + Date.now(),
            pageNum: pageNum,
            x: baseX,
            y: baseY,
            width: 150, // Ancho base de la firma
            height: 75,
            dataUrl: selectedSignatureBase64
        };
        
        imageAnnotations.push(newImgAnno);
        renderImageAnnotation(newImgAnno, pageWrapper, currentScale);
        
        // Apagar modo estampado después de un uso (o mantenerlo, según UX. Aquí lo apagamos para evitar múltiples accidentales)
        isStampingMode = false;
        selectedSignatureBase64 = null;
        pdfContainer.style.cursor = 'default';
        btnSign.classList.remove('primary'); // Reset color if it was highlighted
    });
}

function setupCanvasDrawing() {
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000'; // Firma clásica en negro
    
    const startDrawing = (e) => {
        isDrawing = true;
        draw(e);
    };
    
    const stopDrawing = () => {
        isDrawing = false;
        ctx.beginPath(); // Reset path
    };
    
    const draw = (e) => {
        if (!isDrawing) return;
        
        // Obtener coordenadas relativas al canvas
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        let clientX = e.clientX;
        let clientY = e.clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Soporte táctil básico
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e); }, {passive: false});
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); }, {passive: false});
    canvas.addEventListener('touchend', stopDrawing);
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function importSignature() {
    const { open, message } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    
    try {
        const selected = await open({
            multiple: false,
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
        });
        
        if (selected) {
            const bytes = await invoke('read_pdf', { path: selected });
            const uint8Array = new Uint8Array(bytes);
            const blob = new Blob([uint8Array]);
            const url = URL.createObjectURL(blob);
            
            const img = new Image();
            img.onload = () => {
                clearCanvas();
                // Dibujar imagen escalada
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const x = (canvas.width / 2) - (img.width / 2) * scale;
                const y = (canvas.height / 2) - (img.height / 2) * scale;
                ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                
                // Eliminación automática de fondo blanco
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imgData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i+1];
                    const b = data[i+2];
                    // Si es lo suficientemente blanco, lo hacemos transparente
                    if (r > 200 && g > 200 && b > 200) {
                        data[i+3] = 0; // Alpha 0
                    }
                }
                ctx.putImageData(imgData, 0, 0);
                URL.revokeObjectURL(url);
            };
            img.src = url;
        }
    } catch (e) {
        console.error('Error al importar firma:', e);
        await message('Hubo un error importando la imagen.', { title: 'Error', kind: 'error' });
    }
}

function saveSignature() {
    // Comprobar si está en blanco no es trivial sin analizar píxeles, asumimos que dibujó algo.
    const dataUrl = canvas.toDataURL('image/png');
    
    let saved = JSON.parse(localStorage.getItem('inkit_signatures') || '[]');
    saved.push(dataUrl);
    localStorage.setItem('inkit_signatures', JSON.stringify(saved));
    
    renderVault();
}

function renderVault() {
    const list = document.getElementById('vault-list');
    const saved = JSON.parse(localStorage.getItem('inkit_signatures') || '[]');
    
    list.innerHTML = '';
    
    if (saved.length === 0) {
        list.innerHTML = '<p class="empty-msg">No hay firmas guardadas.</p>';
        return;
    }
    
    saved.forEach((dataUrl, index) => {
        const item = document.createElement('div');
        item.className = 'signature-item';
        
        const img = document.createElement('img');
        img.src = dataUrl;
        
        item.appendChild(img);
        
        item.addEventListener('click', () => {
            selectedSignatureBase64 = dataUrl;
            isStampingMode = true;
            pdfContainer.style.cursor = 'crosshair';
            document.getElementById('signature-vault').style.display = 'none';
        });
        
        list.appendChild(item);
    });
}

// Funciones de renderizado para pdfViewer
export function renderImageAnnotation(anno, wrapper, scale) {
    const img = document.createElement('img');
    img.src = anno.dataUrl;
    img.className = 'img-annotation';
    img.dataset.id = anno.id;
    
    img.style.left = (anno.x * scale) + 'px';
    img.style.top = (anno.y * scale) + 'px';
    img.style.width = (anno.width * scale) + 'px';
    img.style.height = (anno.height * scale) + 'px';
    
    wrapper.appendChild(img);
    
    // Drag & Drop logic
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    img.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = parseFloat(img.style.left);
        initialTop = parseFloat(img.style.top);
        img.style.cursor = 'grabbing';
        e.stopPropagation();
    });

    // Se agregan al document para no perder el drag si el mouse se mueve rápido
    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        img.style.left = (initialLeft + dx) + 'px';
        img.style.top = (initialTop + dy) + 'px';
    };

    const onMouseUp = () => {
        if (isDragging) {
            isDragging = false;
            img.style.cursor = 'move';
            // Guardar nueva posición
            anno.x = parseFloat(img.style.left) / scale;
            anno.y = parseFloat(img.style.top) / scale;
        }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Permitir borrarla con doble clic
    img.addEventListener('dblclick', () => {
        img.remove();
        imageAnnotations = imageAnnotations.filter(a => a.id !== anno.id);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    });
}

export function renderImageAnnotationsForPage(wrapper, pageNum, scale) {
    const pageAnnos = imageAnnotations.filter(a => a.pageNum === pageNum);
    pageAnnos.forEach(anno => {
        renderImageAnnotation(anno, wrapper, scale);
    });
}
