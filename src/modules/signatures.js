import { commitAction } from "./state.js";
import { t } from "./translations.js";
export let imageAnnotations = [];

let isStampingMode = false;
let selectedSignatureBase64 = null;
let pdfContainer = null;
let ctxMenuActiveAnno = null;
let ctxMenuActiveImg = null;
let ctxMenuActiveScale = 1.0;
// Funciones de Dibujo (Signature Pad)
let isDrawing = false;
let canvas, ctx;

export function addImageAnnotationToPage(dataUrl, pageNum, x, y, customWidth = null) {
    const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
    const currentScale = pageWrapper ? parseFloat(pageWrapper.dataset.scale || 1.0) : 1.0;
    
    const img = new Image();
    img.onload = () => {
        const ratio = img.width / img.height;
        const width = customWidth || (ratio > 3 ? 300 : 150);
        const height = width / ratio;
        
        const newImgAnno = {
            id: 'sig_' + Date.now(),
            pageNum: pageNum,
            x: x,
            y: y,
            width: width,
            height: height,
            initialWidth: width,
            originalRatio: ratio,
            dataUrl: dataUrl
        };
        
        imageAnnotations.push(newImgAnno);
        commitAction();
        if (pageWrapper) {
            renderImageAnnotation(newImgAnno, pageWrapper, currentScale);
        }
    };
    img.src = dataUrl;
}

export function initSignatures(containerId) {
    pdfContainer = document.getElementById(containerId);
    
    const btnStamp = document.getElementById('btn-stamp');
    const btnEsign = document.getElementById('btn-esign');
    const stampVault = document.getElementById('stamp-vault');
    const esignVault = document.getElementById('esign-vault');
    const btnNewSig = document.getElementById('btn-new-signature');
    const modal = document.getElementById('signature-modal');
    
    // Canvas elements
    canvas = document.getElementById('signature-canvas');
    ctx = canvas.getContext('2d');
    
    const btnNewIdentity = document.getElementById('btn-new-identity');

    // Migrate old signatures to stamps
    const oldSigs = localStorage.getItem('inkit_signatures');
    if (oldSigs) {
        localStorage.setItem('inkit_stamps', oldSigs);
        localStorage.removeItem('inkit_signatures');
    }

    btnStamp.addEventListener('click', () => {
        esignVault.style.display = 'none';
        const isVisible = stampVault.style.display === 'flex';
        stampVault.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) renderVaults();
        else window.disableSignatures();
    });

    btnEsign.addEventListener('click', () => {
        stampVault.style.display = 'none';
        const isVisible = esignVault.style.display === 'flex';
        esignVault.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) renderVaults();
        else window.disableSignatures();
    });

    window.disableSignatures = () => {
        isStampingMode = false;
        stampVault.style.display = 'none'; esignVault.style.display = 'none';
        pdfContainer.style.cursor = 'default';
        selectedSignatureBase64 = null;
    };

    // Sello Formal (Digital Visual Stamp)
    const stampModal = document.getElementById('stamp-modal');
    const inputName = document.getElementById('stamp-input-name');
    const inputDetail = document.getElementById('stamp-input-detail');
    const inputExtra = document.getElementById('stamp-input-extra');
    const btnCancelStamp = document.getElementById('btn-cancel-stamp');
    const btnGenerateStamp = document.getElementById('btn-generate-stamp');

    btnNewIdentity.addEventListener('click', () => {
        stampModal.style.display = 'flex';
        inputName.value = '';
        inputDetail.value = '';
        if(inputExtra) inputExtra.value = '';
        inputName.focus();
    });

    btnCancelStamp.addEventListener('click', () => {
        stampModal.style.display = 'none';
    });

    btnGenerateStamp.addEventListener('click', () => {
        const name = inputName.value.trim();
        if (!name) return;
        const detail = inputDetail.value.trim();
        const extra = inputExtra ? inputExtra.value.trim() : '';
        
        stampModal.style.display = 'none';
        
        // Crear un canvas temporal para dibujar el sello
        const stampCanvas = document.createElement('canvas');
        stampCanvas.width = 700;
        stampCanvas.height = 200;
        const sCtx = stampCanvas.getContext('2d');
        sCtx.scale(2, 2);
        
        // Fondo y borde
        sCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        sCtx.fillRect(0, 0, 350, 100);
        sCtx.strokeStyle = '#003399';
        sCtx.lineWidth = 2;
        sCtx.strokeRect(1, 1, 348, 98);
        
        // Cargar el Logo de InkIt para el sello
        const logoImg = new Image();
        logoImg.src = '/InkIt_Logo.png';
        logoImg.onload = () => {
            // Dibujar el logo en la parte izquierda
            sCtx.drawImage(logoImg, 10, 15, 45, 45);
            
            // Texto estilizado simulando firma a mano alzada bajo el logo
            sCtx.fillStyle = '#003399';
            sCtx.font = 'italic 12px "Segoe Script", cursive, Arial';
            sCtx.fillText('InkIt', 18, 75);
            sCtx.fillText(t('stamp.verified'), 10, 88);
            
            // Separador
            sCtx.beginPath();
            sCtx.moveTo(65, 10);
            sCtx.lineTo(65, 90);
            sCtx.stroke();
            
            // Textos
            sCtx.fillStyle = '#000000';
            sCtx.font = 'bold 16px Arial';
            sCtx.fillText(t('stamp.signed_by'), 75, 25);
            sCtx.font = 'bold 16px Arial';
            sCtx.fillStyle = '#003399';
            sCtx.fillText(name, 75, 45);
            
            sCtx.fillStyle = '#333333';
            sCtx.font = '11px Arial';
            const today = new Date();
            const dateStr = today.toLocaleString();
            sCtx.fillText(`${t('stamp.date_label')} ${dateStr}`, 75, 60);
            if (detail) {
                sCtx.fillText(detail, 75, 75);
            }
            if (extra) {
                sCtx.fillText(extra, 75, 90);
            }
            
            const dataUrl = stampCanvas.toDataURL('image/png');
            let saved = JSON.parse(localStorage.getItem('inkit_esigns') || '[]');
            saved.push(dataUrl);
            localStorage.setItem('inkit_esigns', JSON.stringify(saved));
            renderVaults(); esignVault.style.display = "flex";
        };
        
        // Fallback por si la imagen falla en cargar
        logoImg.onerror = () => {
            sCtx.fillStyle = '#003399';
            sCtx.font = '36px Arial';
            sCtx.fillText('🖋️', 15, 60);
            // Separador
            sCtx.beginPath();
            sCtx.moveTo(65, 10);
            sCtx.lineTo(65, 90);
            sCtx.stroke();
            
            // Textos
            sCtx.fillStyle = '#000000';
            sCtx.font = 'bold 16px Arial';
            sCtx.fillText(t('stamp.signed_by'), 75, 25);
            sCtx.font = 'bold 16px Arial';
            sCtx.fillStyle = '#003399';
            sCtx.fillText(name, 75, 45);
            
            sCtx.fillStyle = '#333333';
            sCtx.font = '11px Arial';
            const today = new Date();
            const dateStr = today.toLocaleString();
            sCtx.fillText(`${t('stamp.date_label')} ${dateStr}`, 75, 60);
            if (detail) {
                sCtx.fillText(detail, 75, 75);
            }
            if (extra) {
                sCtx.fillText(extra, 75, 90);
            }
            
            const dataUrl = stampCanvas.toDataURL('image/png');
            let saved = JSON.parse(localStorage.getItem('inkit_esigns') || '[]');
            saved.push(dataUrl);
            localStorage.setItem('inkit_esigns', JSON.stringify(saved));
            renderVaults(); esignVault.style.display = "flex";
        };
    });

    // Nueva Firma
    btnNewSig.addEventListener('click', () => {
        clearCanvas();
        modal.style.display = 'flex';
        stampVault.style.display = 'none'; esignVault.style.display = 'none';
    });

    // Lógica de Dibujo
    setupCanvasDrawing();

    // Botones del Modal
    document.getElementById('btn-sig-import-vault').addEventListener('click', importSignature);
    document.getElementById('btn-sig-clear').addEventListener('click', clearCanvas);
    document.getElementById('btn-sig-cancel').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    document.getElementById('btn-sig-save').addEventListener('click', () => {
        saveSignature();
        modal.style.display = 'none';
        stampVault.style.display = 'flex';
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
        
        const currentSigBase64 = selectedSignatureBase64;
        
        const img = new Image();
        img.onload = () => {
            const ratio = img.width / img.height;
            const isStamp = ratio > 3; 
            const baseWidth = isStamp ? 300 : 150; // Sello más grande, firma normal pequeña
            
            const newImgAnno = {
                id: 'sig_' + Date.now(),
                pageNum: pageNum,
                x: baseX,
                y: baseY,
                width: baseWidth,
                height: baseWidth / ratio,
                initialWidth: baseWidth,
                originalRatio: ratio,
                dataUrl: currentSigBase64
            };
            
            imageAnnotations.push(newImgAnno);
        commitAction();
            renderImageAnnotation(newImgAnno, pageWrapper, currentScale);
        };
        img.src = currentSigBase64;
        
        // Apagar modo estampado después de un uso
        isStampingMode = false;
        selectedSignatureBase64 = null;
        pdfContainer.style.cursor = 'default';
        document.getElementById('btn-stamp')?.classList.remove('primary'); document.getElementById('btn-esign')?.classList.remove('primary'); // Reset color if it was highlighted
    });
    // Setup Context Menu for Signatures
    const sigCtxMenu = document.getElementById('sig-context-menu');
    
    document.addEventListener('click', (e) => {
        if (sigCtxMenu && sigCtxMenu.style.display === 'flex' && !sigCtxMenu.contains(e.target)) {
            sigCtxMenu.style.display = 'none';
            commitAction();
        }
    });

    document.getElementById('sig-ctx-delete')?.addEventListener('click', () => {
        if (ctxMenuActiveImg && ctxMenuActiveAnno) {
            ctxMenuActiveImg.remove();
            imageAnnotations = imageAnnotations.filter(a => a.id !== ctxMenuActiveAnno.id);
            sigCtxMenu.style.display = 'none';
            commitAction();
        }
    });
    
    const applySize = (sizeType) => {
        if (ctxMenuActiveImg && ctxMenuActiveAnno) {
            // Usamos originalRatio para que no se deforme al pasar de L a M
            const ratio = ctxMenuActiveAnno.originalRatio || (ctxMenuActiveAnno.width / ctxMenuActiveAnno.height);
            const isStamp = ratio > 3; 
            const baseW = ctxMenuActiveAnno.initialWidth || (isStamp ? 300 : 150);
            const baseH = baseW / ratio;
            
            let newW, newH;
            if (sizeType === 'S') {
                newW = baseW * 0.6;
                newH = baseH * 0.6;
            } else if (sizeType === 'M') {
                newW = baseW;
                newH = baseH;
            } else if (sizeType === 'L') {
                newW = baseW * 1.6; // Ajustado para que quepa en un A4 sin verse tan deforme
                newH = baseH; // Altura normal de M (se deforma intencionalmente)
            }
            
            ctxMenuActiveAnno.width = newW;
            ctxMenuActiveAnno.height = newH;
            
            ctxMenuActiveImg.style.width = (newW * ctxMenuActiveScale) + 'px';
            ctxMenuActiveImg.style.height = (newH * ctxMenuActiveScale) + 'px';
            
            sigCtxMenu.style.display = 'none';
            commitAction();
        }
    };
    
    document.getElementById('sig-ctx-s')?.addEventListener('click', () => applySize('S'));
    document.getElementById('sig-ctx-m')?.addEventListener('click', () => applySize('M'));
    document.getElementById('sig-ctx-l')?.addEventListener('click', () => applySize('L'));
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
                const modal = document.getElementById('signature-modal');
                const stampVault = document.getElementById('stamp-vault');
                
                const bytes = await invoke('read_pdf', { path: selected });
                const uint8Array = new Uint8Array(bytes);
                const blob = new Blob([uint8Array]);
                const url = URL.createObjectURL(blob);
                
                const img = new Image();
                img.onload = () => {
                    modal.style.display = 'flex';
                    stampVault.style.display = 'none';
                    
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
        await message(t('alert.error_import'), { title: t('alert.title.error'), kind: 'error' });
    }
}

function saveSignature() {
    // Comprobar si está en blanco no es trivial sin analizar píxeles, asumimos que dibujó algo.
    const dataUrl = canvas.toDataURL('image/png');
    
    let saved = JSON.parse(localStorage.getItem('inkit_stamps') || '[]');
            saved.push(dataUrl);
            localStorage.setItem('inkit_stamps', JSON.stringify(saved));
            renderVaults();
}

function renderVaults() {
    // Render Stamps
    const stampList = document.getElementById('stamp-list');
    const savedStamps = JSON.parse(localStorage.getItem('inkit_stamps') || '[]');
    
    stampList.innerHTML = '';
    if (savedStamps.length === 0) {
        stampList.innerHTML = `<p class="empty-msg">${t('vault.empty_stamps')}</p>`;
    } else {
        savedStamps.forEach((dataUrl, index) => {
            const item = createVaultItem(dataUrl, index, 'inkit_stamps');
            stampList.appendChild(item);
        });
    }

    // Render eSigns
    const esignList = document.getElementById('esign-list');
    const savedEsigns = JSON.parse(localStorage.getItem('inkit_esigns') || '[]');
    
    esignList.innerHTML = '';
    if (savedEsigns.length === 0) {
        esignList.innerHTML = `<p class="empty-msg">${t('vault.empty_identities')}</p>`;
    } else {
        savedEsigns.forEach((dataUrl, index) => {
            const item = createVaultItem(dataUrl, index, 'inkit_esigns');
            esignList.appendChild(item);
        });
    }
}

function createVaultItem(dataUrl, index, storageKey) {
    const item = document.createElement('div');
    item.className = 'signature-item';
    
    const img = document.createElement('img');
    img.src = dataUrl;
    
    const delBtn = document.createElement('button');
    delBtn.innerHTML = '❌';
    delBtn.className = 'btn-delete-sig';
    delBtn.title = t('vault.delete_title');
    
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        let current = JSON.parse(localStorage.getItem(storageKey) || '[]');
        current.splice(index, 1);
        localStorage.setItem(storageKey, JSON.stringify(current));
        renderVaults();
    });
    
    item.appendChild(img);
    item.appendChild(delBtn);
    
    item.addEventListener('click', () => {
        selectedSignatureBase64 = dataUrl;
        isStampingMode = true;
        pdfContainer.style.cursor = 'crosshair';
        document.getElementById('stamp-vault').style.display = 'none';
        document.getElementById('esign-vault').style.display = 'none';
    });
    
    return item;
}

// Funciones de renderizado para pdfViewer
export function renderImageAnnotation(anno, wrapper, scale) {
    const img = document.createElement('img');
    img.src = anno.dataUrl;
    img.className = 'img-annotation';
    img.dataset.id = anno.id;
    img.title = t('ctx.img_title');
    
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
            commitAction();
        }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Context Menu (Right Click)
    img.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        ctxMenuActiveAnno = anno;
        ctxMenuActiveImg = img;
        ctxMenuActiveScale = scale;
        
        const sigCtxMenu = document.getElementById('sig-context-menu');
        sigCtxMenu.style.display = 'flex';
        
        // Evitar que el menú se salga de la pantalla
        const rect = sigCtxMenu.getBoundingClientRect();
        let top = e.clientY;
        let left = e.clientX;
        
        if (top + rect.height > window.innerHeight) {
            top -= rect.height; // abrir hacia arriba
        }
        if (left + rect.width > window.innerWidth) {
            left -= rect.width; // abrir hacia la izquierda
        }
        
        sigCtxMenu.style.left = left + 'px';
        sigCtxMenu.style.top = top + 'px';
    });
}

export function renderImageAnnotationsForPage(wrapper, pageNum, scale) {
    const pageAnnos = imageAnnotations.filter(a => a.pageNum === pageNum);
    pageAnnos.forEach(anno => {
        renderImageAnnotation(anno, wrapper, scale);
    });
}

export function setImageAnnotations(newAnnotations) { imageAnnotations.length = 0; imageAnnotations.push(...newAnnotations); }
