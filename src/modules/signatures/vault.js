import { state } from './state.js';
import { t } from '../translations.js';
import { clearCanvas } from './drawing.js';

export function renderVaults() {
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

export function createVaultItem(dataUrl, index, storageKey) {
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
        state.selectedSignatureBase64 = dataUrl;
        state.isStampingMode = true;
        state.pdfContainer.style.cursor = 'crosshair';
        document.getElementById('stamp-vault').style.display = 'none';
        document.getElementById('esign-vault').style.display = 'none';
    });
    
    return item;
}

export async function importSignature() {
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
                const scale = Math.min(state.canvas.width / img.width, state.canvas.height / img.height);
                const x = (state.canvas.width / 2) - (img.width / 2) * scale;
                const y = (state.canvas.height / 2) - (img.height / 2) * scale;
                state.ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                
                // Eliminación automática de fondo blanco
                const imgData = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
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
                state.ctx.putImageData(imgData, 0, 0);
                URL.revokeObjectURL(url);
            };
            img.src = url;
        }
    } catch (e) {
        console.error('Error al importar firma:', e);
        const alertMsg = t('alert.error_import') || 'Error al importar firma.';
        const alertTitle = t('alert.title.error') || 'Error';
        const { message } = await import('@tauri-apps/plugin-dialog');
        await message(alertMsg, { title: alertTitle, kind: 'error' });
    }
}

export function saveSignature() {
    const dataUrl = state.canvas.toDataURL('image/png');
    let saved = JSON.parse(localStorage.getItem('inkit_stamps') || '[]');
    saved.push(dataUrl);
    localStorage.setItem('inkit_stamps', JSON.stringify(saved));
    renderVaults();
}
