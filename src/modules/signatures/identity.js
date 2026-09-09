import { t } from '../translations.js';
import { renderVaults } from './vault.js';

export function setupIdentity() {
    const btnNewIdentity = document.getElementById('btn-new-identity');
    const stampModal = document.getElementById('stamp-modal');
    const inputName = document.getElementById('stamp-input-name');
    const inputDetail = document.getElementById('stamp-input-detail');
    const inputExtra = document.getElementById('stamp-input-extra');
    const btnCancelStamp = document.getElementById('btn-cancel-stamp');
    const btnGenerateStamp = document.getElementById('btn-generate-stamp');
    const esignVault = document.getElementById('esign-vault');

    if (!btnNewIdentity) return;

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
        
        const fallbackDraw = () => {
            sCtx.fillStyle = '#003399';
            sCtx.font = '36px Arial';
            sCtx.fillText('🖋️', 15, 60);
            
            sCtx.beginPath();
            sCtx.moveTo(65, 10);
            sCtx.lineTo(65, 90);
            sCtx.stroke();
            
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
            renderVaults(); 
            if(esignVault) esignVault.style.display = "flex";
        };

        const logoImg = new Image();
        logoImg.src = '/InkIt_Logo.png';
        logoImg.onload = () => {
            sCtx.drawImage(logoImg, 10, 15, 45, 45);
            
            sCtx.fillStyle = '#003399';
            sCtx.font = 'italic 12px "Segoe Script", cursive, Arial';
            sCtx.fillText('InkIt', 18, 75);
            sCtx.fillText(t('stamp.verified'), 10, 88);
            
            sCtx.beginPath();
            sCtx.moveTo(65, 10);
            sCtx.lineTo(65, 90);
            sCtx.stroke();
            
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
            renderVaults(); 
            if(esignVault) esignVault.style.display = "flex";
        };
        
        logoImg.onerror = fallbackDraw;
    });
}
