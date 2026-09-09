import { commitAction } from "./state.js";
import { state, imageAnnotations, setImageAnnotations } from './signatures/state.js';
import { setupCanvasDrawing, clearCanvas } from './signatures/drawing.js';
import { setupIdentity } from './signatures/identity.js';
import { renderImageAnnotation, renderImageAnnotationsForPage, setupInteractionsMenu } from './signatures/interactions.js';
import { renderVaults, importSignature, saveSignature } from './signatures/vault.js';

export { imageAnnotations, renderImageAnnotationsForPage, setImageAnnotations };

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
    state.pdfContainer = document.getElementById(containerId);
    
    const btnStamp = document.getElementById('btn-stamp');
    const btnEsign = document.getElementById('btn-esign');
    const stampVault = document.getElementById('stamp-vault');
    const esignVault = document.getElementById('esign-vault');
    const btnNewSig = document.getElementById('btn-new-signature');
    const modal = document.getElementById('signature-modal');
    
    // Canvas elements
    state.canvas = document.getElementById('signature-canvas');
    if (state.canvas) {
        state.ctx = state.canvas.getContext('2d');
    }

    // Migrate old signatures to stamps
    const oldSigs = localStorage.getItem('inkit_signatures');
    if (oldSigs) {
        localStorage.setItem('inkit_stamps', oldSigs);
        localStorage.removeItem('inkit_signatures');
    }

    btnStamp?.addEventListener('click', () => {
        if(esignVault) esignVault.style.display = 'none';
        const isVisible = stampVault.style.display === 'flex';
        stampVault.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) renderVaults();
        else window.disableSignatures();
    });

    btnEsign?.addEventListener('click', () => {
        if(stampVault) stampVault.style.display = 'none';
        const isVisible = esignVault.style.display === 'flex';
        esignVault.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) renderVaults();
        else window.disableSignatures();
    });

    window.disableSignatures = () => {
        state.isStampingMode = false;
        if(stampVault) stampVault.style.display = 'none'; 
        if(esignVault) esignVault.style.display = 'none';
        if(state.pdfContainer) state.pdfContainer.style.cursor = 'default';
        state.selectedSignatureBase64 = null;
    };

    setupIdentity();

    // Nueva Firma
    btnNewSig?.addEventListener('click', () => {
        clearCanvas();
        if(modal) modal.style.display = 'flex';
        if(stampVault) stampVault.style.display = 'none'; 
        if(esignVault) esignVault.style.display = 'none';
    });

    // Lógica de Dibujo
    if (state.canvas && state.ctx) {
        setupCanvasDrawing();
    }

    // Botones del Modal
    document.getElementById('btn-sig-import-vault')?.addEventListener('click', importSignature);
    document.getElementById('btn-sig-clear')?.addEventListener('click', clearCanvas);
    document.getElementById('btn-sig-cancel')?.addEventListener('click', () => {
        if(modal) modal.style.display = 'none';
    });
    
    document.getElementById('btn-sig-save')?.addEventListener('click', () => {
        saveSignature();
        if(modal) modal.style.display = 'none';
        if(stampVault) stampVault.style.display = 'flex';
    });

    // Manejar estampar en el PDF
    state.pdfContainer?.addEventListener('click', (e) => {
        if (!state.isStampingMode || !state.selectedSignatureBase64) return;
        
        const pageWrapper = e.target.closest('.pdf-page-wrapper');
        if (!pageWrapper) return;
        
        // Evitar solapamiento con clicks de typewriter si ambos estuvieran activos
        if (e.target.classList.contains('text-annotation') || e.target.classList.contains('img-annotation')) return;

        const rect = pageWrapper.getBoundingClientRect();
        const scale = parseFloat(pageWrapper.dataset.scale || 1.0);
        const pageNum = parseInt(pageWrapper.dataset.pageNum);
        
        // Coordenadas relativas al wrapper divididas por escala para tamaño real
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;

        // Centrar imagen en el click
        const img = new Image();
        img.onload = () => {
            const ratio = img.width / img.height;
            const isStamp = ratio > 3; 
            const baseW = isStamp ? 300 : 150;
            const baseH = baseW / ratio;
            
            const centeredX = x - (baseW / 2);
            const centeredY = y - (baseH / 2);
            
            addImageAnnotationToPage(state.selectedSignatureBase64, pageNum, centeredX, centeredY, baseW);
            
            // Volver a modo normal
            window.disableSignatures();
            
            // Deseleccionar botones de herramientas (integración UI)
            const btnStamp = document.getElementById('btn-stamp');
            const btnEsign = document.getElementById('btn-esign');
            const btnPointer = document.getElementById('btn-pointer');
            
            if (btnStamp) btnStamp.classList.remove('primary');
            if (btnEsign) btnEsign.classList.remove('primary');
            if (btnPointer) btnPointer.classList.add('primary');
        };
        img.src = state.selectedSignatureBase64;
    });

    setupInteractionsMenu();
}
