export function showExportPngModal(currentPage, totalPages) {
    return new Promise((resolve) => {
        const t = window.t || ((k) => k);
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        overlay.style.backdropFilter = 'blur(5px)';
        overlay.style.zIndex = '999999';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s ease-out';

        const modal = document.createElement('div');
        modal.className = 'glass-panel';
        modal.style.width = '420px';
        modal.style.maxWidth = '90%';
        modal.style.padding = '24px';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.gap = '20px';
        modal.style.transform = 'translateY(20px) scale(0.95)';
        modal.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

        modal.innerHTML = `
            <h3 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 1.2rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px; color: var(--accent-cyan);">
                    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                </svg>
                ${t('export.png.title') || 'Export as PNG'}
            </h3>
            <p style="margin: 0; font-size: 0.9rem; color: rgba(255,255,255,0.7);">
                ${t('export.png.desc') || 'Select which pages you want to export as images.'}
            </p>

            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 8px; transition: all 0.2s;">
                    <input type="radio" name="export-png-mode" value="current" checked style="accent-color: var(--accent-cyan); width: 16px; height: 16px;">
                    <span style="font-size: 0.95rem;">${t('export.png.current') || 'Current Page'} (Hoja ${currentPage})</span>
                </label>
                
                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 8px; transition: all 0.2s;">
                    <input type="radio" name="export-png-mode" value="all" style="accent-color: var(--accent-cyan); width: 16px; height: 16px;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.95rem;">${t('export.png.all') || 'All Pages'} (1 - ${totalPages})</span>
                        <span style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">${t('export.png.all.desc') || 'Will be saved in a new folder'}</span>
                    </div>
                </label>

                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 8px; transition: all 0.2s;">
                    <input type="radio" name="export-png-mode" value="range" style="accent-color: var(--accent-cyan); width: 16px; height: 16px;">
                    <div style="display: flex; flex-direction: column; flex: 1;">
                        <span style="font-size: 0.95rem;">${t('export.png.range') || 'Custom Range'}</span>
                        <input type="text" id="export-png-range-input" class="glass-input" placeholder="Ej: 1-3, 5" disabled style="margin-top: 6px; width: 100%; font-size: 0.85rem; padding: 6px 10px;">
                    </div>
                </label>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 12px;">
                <button id="btn-export-cancel" class="btn-glass" style="min-width: 100px;">${t('btn.cancel') || 'Cancel'}</button>
                <button id="btn-export-confirm" class="btn-glass primary" style="min-width: 120px; font-weight: bold;">${t('btn.export') || 'Export'}</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const radios = modal.querySelectorAll('input[name="export-png-mode"]');
        const rangeInput = modal.querySelector('#export-png-range-input');

        radios.forEach(r => {
            r.addEventListener('change', (e) => {
                if (e.target.value === 'range') {
                    rangeInput.disabled = false;
                    rangeInput.focus();
                } else {
                    rangeInput.disabled = true;
                }
            });
        });

        const close = (result) => {
            overlay.style.opacity = '0';
            modal.style.transform = 'translateY(20px) scale(0.95)';
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 200);
        };

        modal.querySelector('#btn-export-cancel').addEventListener('click', () => close(null));
        
        modal.querySelector('#btn-export-confirm').addEventListener('click', () => {
            const mode = document.querySelector('input[name="export-png-mode"]:checked').value;
            let range = '';
            if (mode === 'range') {
                range = rangeInput.value.trim();
                if (!range) {
                    rangeInput.style.border = '1px solid #ff6b6b';
                    return;
                }
            }
            close({ mode, range });
        });

        // Intro animation
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            modal.style.transform = 'translateY(0) scale(1)';
        });
    });
}
