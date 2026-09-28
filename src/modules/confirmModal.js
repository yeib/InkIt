// confirmModal.js
// Reusable dark glassmorphism modal system.
// Replaces all native alert(), confirm(), and window.confirm() calls.
//
// Exports:
//   showAlert(title, message, kind?)  → Promise<void>        (OK-only)
//   showConfirm(title, message, okText?, cancelText?)  → Promise<boolean>

import { t } from './translations.js';

let alertModalEl = null;
let confirmModalEl = null;

// ─────────────────────────────────────────
// Shared CSS (injected once)
// ─────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('inkit-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'inkit-modal-styles';
    style.textContent = `
        .inkit-modal-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.5);
            display: none; align-items: center; justify-content: center;
            z-index: 99999; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .inkit-modal-overlay.open { display: flex; }
        .inkit-modal-box {
            background: rgba(18, 18, 24, 0.82);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px;
            padding: 28px 28px 22px; width: min(400px, 90vw);
            box-shadow: 0 12px 40px rgba(0,0,0,0.6);
            color: #e0e0e0; animation: inkit-modal-in 0.15s ease;
        }
        @keyframes inkit-modal-in {
            from { opacity: 0; transform: scale(0.96) translateY(-6px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .inkit-modal-icon { font-size: 1.6rem; margin-bottom: 8px; }
        .inkit-modal-title {
            margin: 0 0 10px; font-size: 1.1rem; font-weight: 700; color: #fff;
        }
        .inkit-modal-message {
            margin: 0 0 22px; font-size: 0.92rem; color: #b0b0b0; line-height: 1.55;
            white-space: pre-wrap;
        }
        .inkit-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
        .inkit-modal-btn {
            padding: 8px 20px; border-radius: 8px; border: none;
            cursor: pointer; font-size: 0.92rem; font-weight: 600;
            transition: background 0.15s, transform 0.1s;
        }
        .inkit-modal-btn:active { transform: scale(0.97); }
        .inkit-modal-btn-cancel {
            background: rgba(255,255,255,0.09); color: #ccc;
            border: 1px solid rgba(255,255,255,0.07);
        }
        .inkit-modal-btn-cancel:hover { background: rgba(255,255,255,0.15); }
        .inkit-modal-btn-ok-info  { background: rgba(0, 120, 215, 0.75); color: #fff; }
        .inkit-modal-btn-ok-info:hover  { background: rgba(0, 120, 215, 0.95); }
        .inkit-modal-btn-ok-warning { background: rgba(200, 130, 0, 0.75); color: #fff; }
        .inkit-modal-btn-ok-warning:hover { background: rgba(200, 130, 0, 0.95); }
        .inkit-modal-btn-ok-error { background: rgba(200, 50, 50, 0.75); color: #fff; }
        .inkit-modal-btn-ok-error:hover { background: rgba(200, 50, 50, 0.95); }
        .inkit-modal-btn-ok-confirm { background: rgba(200, 50, 50, 0.75); color: #fff; }
        .inkit-modal-btn-ok-confirm:hover { background: rgba(200, 50, 50, 0.95); }
    `;
    document.head.appendChild(style);
}

// ─────────────────────────────────────────
// Alert modal (OK only)
// ─────────────────────────────────────────
function getKindIcon(kind) {
    if (kind === 'error')   return '❌';
    if (kind === 'warning') return '⚠️';
    return 'ℹ️';
}

function getOkClass(kind) {
    if (kind === 'error')   return 'inkit-modal-btn-ok-error';
    if (kind === 'warning') return 'inkit-modal-btn-ok-warning';
    return 'inkit-modal-btn-ok-info';
}

function ensureAlertModal() {
    if (alertModalEl) return alertModalEl;
    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'inkit-modal-overlay';
    overlay.innerHTML = `
        <div class="inkit-modal-box" role="alertdialog" aria-modal="true">
            <div class="inkit-modal-icon"></div>
            <h3 class="inkit-modal-title"></h3>
            <p class="inkit-modal-message"></p>
            <div class="inkit-modal-actions">
                <button type="button" class="inkit-modal-btn inkit-modal-btn-ok-info">OK</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    alertModalEl = {
        overlay,
        icon: overlay.querySelector('.inkit-modal-icon'),
        title: overlay.querySelector('.inkit-modal-title'),
        message: overlay.querySelector('.inkit-modal-message'),
        btnOk: overlay.querySelector('.inkit-modal-btn'),
    };
    return alertModalEl;
}

export function showAlert(title, msg, kind = 'info', okText = null) {
    return new Promise((resolve) => {
        const m = ensureAlertModal();
        m.icon.textContent = getKindIcon(kind);
        m.title.textContent = title;
        m.message.textContent = msg;
        m.btnOk.className = `inkit-modal-btn ${getOkClass(kind)}`;
        m.btnOk.textContent = okText || t('modal.btn.ok') || 'OK';

        const done = () => {
            m.overlay.classList.remove('open');
            m.btnOk.onclick = null;
            resolve();
        };
        m.btnOk.onclick = done;
        m.overlay.classList.add('open');
        m.btnOk.focus();
    });
}

// ─────────────────────────────────────────
// Confirm modal (OK + Cancel)
// ─────────────────────────────────────────
function ensureConfirmModal() {
    if (confirmModalEl) return confirmModalEl;
    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'inkit-modal-overlay';
    overlay.innerHTML = `
        <div class="inkit-modal-box" role="dialog" aria-modal="true">
            <div class="inkit-modal-icon">⚠️</div>
            <h3 class="inkit-modal-title"></h3>
            <p class="inkit-modal-message"></p>
            <div class="inkit-modal-actions">
                <button type="button" class="inkit-modal-btn inkit-modal-btn-cancel"></button>
                <button type="button" class="inkit-modal-btn inkit-modal-btn-ok-confirm"></button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    confirmModalEl = {
        overlay,
        icon: overlay.querySelector('.inkit-modal-icon'),
        title: overlay.querySelector('.inkit-modal-title'),
        message: overlay.querySelector('.inkit-modal-message'),
        btnCancel: overlay.querySelector('.inkit-modal-btn-cancel'),
        btnOk: overlay.querySelector('.inkit-modal-btn-ok-confirm'),
    };
    return confirmModalEl;
}

export function showConfirm(title, msg, okText = null, cancelText = null) {
    return new Promise((resolve) => {
        const m = ensureConfirmModal();
        m.title.textContent = title;
        m.message.textContent = msg;
        m.btnOk.textContent = okText || t('modal.btn.ok') || 'OK';
        m.btnCancel.textContent = cancelText || t('modal.btn.cancel') || 'Cancel';

        const cleanup = (result) => {
            m.overlay.classList.remove('open');
            m.btnOk.onclick = null;
            m.btnCancel.onclick = null;
            resolve(result);
        };
        m.btnOk.onclick = () => cleanup(true);
        m.btnCancel.onclick = () => cleanup(false);
        m.overlay.classList.add('open');
        m.btnOk.focus();
    });
}

// Legacy alias kept for existing callers in main.js
export { showConfirm as promptConfirm };
