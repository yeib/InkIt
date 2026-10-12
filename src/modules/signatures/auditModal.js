import { invoke } from '@tauri-apps/api/core';

let lastAuditReport = null;

export function initSignatureAudit() {
    const btnStatus = document.getElementById('btn-sig-status');
    const modal = document.getElementById('sig-audit-modal');
    const btnClose = document.getElementById('btn-sig-audit-close');

    if (btnStatus) {
        btnStatus.addEventListener('click', () => {
            if (lastAuditReport && lastAuditReport.hasSignatures) {
                renderAuditModal(lastAuditReport);
                if (modal) modal.style.display = 'flex';
            }
        });
    }

    if (btnClose) {
        btnClose.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}

export async function checkDocumentSignatures(pdfBytes, pdfPath = null) {
    const btnStatus = document.getElementById('btn-sig-status');
    const statusText = document.getElementById('sig-status-text');
    const statusIcon = document.getElementById('sig-status-icon');

    if (!btnStatus) return;

    try {
        let params = {};
        if (pdfPath) {
            params.pdfPath = pdfPath;
        } else if (pdfBytes) {
            params.pdfBytes = Array.from(pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes));
        } else {
            clearSignatureAudit();
            return;
        }

        const report = await invoke('inspect_pdf_signatures', params);
        lastAuditReport = report;

        if (report && report.hasSignatures && report.signatures.length > 0) {
            const hasModified = report.signatures.some(s => s.isModifiedAfterSigning || !s.isValid || s.integrityStatus !== 'valid');
            const count = report.signatures.length;
            const t = window.t || ((k) => k);

            btnStatus.style.display = 'inline-flex';

            if (hasModified) {
                btnStatus.style.color = '#FBBF24';
                btnStatus.style.borderColor = 'rgba(251, 191, 36, 0.5)';
                btnStatus.style.background = 'rgba(251, 191, 36, 0.15)';
                if (statusIcon) statusIcon.textContent = '⚠️';
                if (statusText) statusText.textContent = `${t('btn.signatures') || 'Firmas'} (${count}) ⚠️`;
                btnStatus.setAttribute('data-tooltip', `${t('btn.signatures') || 'Firmas'} (${count}): ${t('audit.tampered') || 'Documento modificado post-firma'}`);
                btnStatus.removeAttribute('title');
            } else {
                btnStatus.style.color = '#34D399';
                btnStatus.style.borderColor = 'rgba(52, 211, 153, 0.5)';
                btnStatus.style.background = 'rgba(16, 185, 129, 0.15)';
                if (statusIcon) statusIcon.textContent = '🛡️';
                if (statusText) statusText.textContent = `${t('btn.signatures') || 'Firmas'} (${count})`;
                btnStatus.setAttribute('data-tooltip', `${t('btn.signatures') || 'Firmas'} (${count}): ${t('audit.valid') || 'Documento intacto y firmas válidas'}`);
                btnStatus.removeAttribute('title');
            }
        } else {
            clearSignatureAudit();
        }
    } catch (err) {
        console.warn('Error al inspeccionar firmas digitales:', err);
        clearSignatureAudit();
    }
}

export function clearSignatureAudit() {
    lastAuditReport = null;
    const btnStatus = document.getElementById('btn-sig-status');
    const modal = document.getElementById('sig-audit-modal');
    if (btnStatus) btnStatus.style.display = 'none';
    if (modal) modal.style.display = 'none';
}

function renderAuditModal(report) {
    const listEl = document.getElementById('sig-audit-list');
    const bannerEl = document.getElementById('sig-audit-banner');
    const bannerIcon = document.getElementById('sig-audit-banner-icon');
    const bannerTitle = document.getElementById('sig-audit-banner-title');
    const bannerDesc = document.getElementById('sig-audit-banner-desc');
    const countEl = document.getElementById('sig-audit-count');

    const t = window.t || ((k) => k);
    const hasModified = report.signatures.some(s => s.isModifiedAfterSigning || !s.isValid || s.integrityStatus !== 'valid');

    if (bannerEl) {
        if (hasModified) {
            bannerEl.style.background = 'rgba(234, 179, 8, 0.1)';
            bannerEl.style.borderColor = 'rgba(234, 179, 8, 0.35)';
            if (bannerIcon) {
                bannerIcon.textContent = '⚠️';
                bannerIcon.style.color = '#FBBF24';
            }
            if (bannerTitle) {
                bannerTitle.textContent = t('audit.tampered') || 'Documento Modificado Post-Firma';
                bannerTitle.style.color = '#FBBF24';
            }
            if (bannerDesc) {
                bannerDesc.textContent = t('audit.tampered_desc') || 'Se detectaron bytes o datos añadidos fuera del rango criptográfico protegido.';
            }
        } else {
            bannerEl.style.background = 'rgba(16, 185, 129, 0.1)';
            bannerEl.style.borderColor = 'rgba(16, 185, 129, 0.35)';
            if (bannerIcon) {
                bannerIcon.textContent = '🛡️';
                bannerIcon.style.color = '#34D399';
            }
            if (bannerTitle) {
                bannerTitle.textContent = t('audit.valid') || 'Documento Intacto y Criptográficamente Válido';
                bannerTitle.style.color = '#34D399';
            }
            if (bannerDesc) {
                bannerDesc.textContent = t('audit.valid_desc') || 'Todas las firmas digitales son válidas y el archivo no ha sido alterado.';
            }
        }
    }

    if (countEl) {
        countEl.textContent = `${t('audit.found') || 'Firmas Encontradas'} (${report.signatures.length}):`;
    }

    if (listEl) {
        listEl.innerHTML = '';
        report.signatures.forEach((sig, idx) => {
            const card = document.createElement('div');
            card.className = 'glass-panel';
            card.style.padding = '12px 14px';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '8px';
            card.style.borderRadius = '8px';
            card.style.background = 'rgba(255, 255, 255, 0.03)';
            card.style.border = '1px solid rgba(255, 255, 255, 0.08)';

            const headerRow = document.createElement('div');
            headerRow.style.display = 'flex';
            headerRow.style.alignItems = 'center';
            headerRow.style.justifyContent = 'space-between';
            headerRow.style.gap = '10px';

            const nameBox = document.createElement('div');
            nameBox.style.display = 'flex';
            nameBox.style.alignItems = 'center';
            nameBox.style.gap = '6px';
            nameBox.innerHTML = `
                <span style="font-size: 14px;">🪪</span>
                <span style="font-size: 0.85rem; font-weight: 700; color: #ffffff;">${escapeHtml(sig.signerName || sig.fieldName || `Firma #${idx + 1}`)}</span>
            `;

            const badge = document.createElement('span');
            badge.style.fontSize = '0.72rem';
            badge.style.padding = '2px 8px';
            badge.style.borderRadius = '4px';
            badge.style.fontWeight = '600';
            const isSigTampered = sig.isModifiedAfterSigning || !sig.isValid || sig.integrityStatus !== 'valid';
            if (isSigTampered) {
                badge.style.background = 'rgba(234, 179, 8, 0.18)';
                badge.style.color = '#FBBF24';
                badge.style.border = '1px solid rgba(234, 179, 8, 0.35)';
                badge.textContent = t('audit.status_tampered') || 'Modificado post-firma';
            } else {
                badge.style.background = 'rgba(16, 185, 129, 0.18)';
                badge.style.color = '#34D399';
                badge.style.border = '1px solid rgba(16, 185, 129, 0.35)';
                badge.textContent = t('audit.status_valid') || 'Válida / No alterada';
            }

            headerRow.appendChild(nameBox);
            headerRow.appendChild(badge);
            card.appendChild(headerRow);

            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            grid.style.gap = '6px';
            grid.style.fontSize = '0.74rem';
            grid.style.color = 'rgba(255, 255, 255, 0.7)';

            if (sig.organization) {
                grid.innerHTML += `<div>🏢 <span>${escapeHtml(sig.organization)}</span></div>`;
            }
            if (sig.email || sig.contactInfo) {
                grid.innerHTML += `<div>✉️ <span>${escapeHtml(sig.email || sig.contactInfo)}</span></div>`;
            }
            if (sig.algorithm || sig.subFilter) {
                grid.innerHTML += `<div>⚙️ <span>${escapeHtml(sig.algorithm || sig.subFilter)}</span></div>`;
            }
            if (sig.location) {
                grid.innerHTML += `<div>📍 <span>${escapeHtml(sig.location)}</span></div>`;
            }
            if (sig.signingTime) {
                grid.innerHTML += `<div>📅 <span>${escapeHtml(sig.signingTime)}</span></div>`;
            }
            if (sig.reason) {
                grid.innerHTML += `<div style="grid-column: span 2;">📝 <span>${escapeHtml(sig.reason)}</span></div>`;
            }

            card.appendChild(grid);
            listEl.appendChild(card);
        });
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
