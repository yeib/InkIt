// passwordModal.js
import { t } from '../translations.js';

let modalEl = null;


function ensureModal() {
    if (modalEl) return modalEl;

    const overlay = document.createElement('div');
    overlay.className = 'pw-modal-overlay';
    overlay.innerHTML = `
        <div class="pw-modal-box" role="dialog" aria-modal="true">
            <h3 class="pw-modal-title"></h3>
            <p class="pw-modal-hint"></p>
            <label class="pw-modal-label" data-for="pw1"></label>
            <input type="password" class="pw-modal-input" id="pw-modal-input-1" autocomplete="new-password" />
            <div class="pw-modal-confirm-row" style="display:none;">
                <label class="pw-modal-label" data-for="pw2"></label>
                <input type="password" class="pw-modal-input" id="pw-modal-input-2" autocomplete="new-password" />
            </div>
            <p class="pw-modal-error" style="display:none;"></p>
            <div class="pw-modal-actions">
                <button type="button" class="pw-modal-btn pw-modal-cancel"></button>
                <button type="button" class="pw-modal-btn pw-modal-ok"></button>
            </div>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .pw-modal-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.45);
            display: none; align-items: center; justify-content: center;
            z-index: 10000; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .pw-modal-overlay.open { display: flex; }
        .pw-modal-box {
            background: rgba(20, 20, 20, 0.75); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px;
            padding: 24px; width: min(380px, 90vw); box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            color: #e0e0e0;
        }
        .pw-modal-title { margin: 0 0 8px; font-size: 1.2rem; font-weight: 600; color: #fff; }
        .pw-modal-hint { margin: 0 0 16px; font-size: 0.85rem; color: #aaa; line-height: 1.4; }
        .pw-modal-label { display: block; font-size: 0.85rem; margin: 12px 0 6px; color: #ccc; }
        .pw-modal-input {
            width: 100%; box-sizing: border-box; padding: 10px 12px;
            background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 6px; font-size: 1rem; color: #fff; outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .pw-modal-input:focus { border-color: rgba(255, 255, 255, 0.4); box-shadow: 0 0 0 2px rgba(255,255,255,0.1); }
        .pw-modal-error { color: #ff6b6b; font-size: 0.85rem; margin: 10px 0 0; }
        .pw-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
        .pw-modal-btn {
            padding: 8px 18px; border-radius: 6px; border: none;
            cursor: pointer; font-size: 0.95rem; font-weight: 500; transition: all 0.2s;
        }
        .pw-modal-cancel { background: rgba(255, 255, 255, 0.1); color: #ddd; border: 1px solid rgba(255,255,255,0.05); }
        .pw-modal-cancel:hover { background: rgba(255, 255, 255, 0.15); }
        .pw-modal-ok { background: rgba(0, 120, 215, 0.7); color: #fff; border: 1px solid rgba(0, 120, 215, 0.4); }
        .pw-modal-ok:hover { background: rgba(0, 120, 215, 0.9); }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);
    modalEl = overlay;
    return overlay;
}

/**
 * Pide una contraseña existente (sin confirmación). Usar para desbloquear /
 * firmar con un .pfx ya creado.
 * @param {string} title
 * @param {string} [hint]
 * @returns {Promise<string|null>} la contraseña, o null si se cancela.
 */
export function promptPassword(title, hint = '') {
    return openModal({ title, hint, requireConfirm: false, allowEmpty: true });
}

/**
 * Pide una contraseña NUEVA con confirmación (repetir contraseña). Usar al
 * crear un certificado .pfx nuevo, para evitar que un typo deje al usuario
 * con un certificado al que no puede volver a acceder.
 * Si el usuario deja el campo vacío y confirma, se resuelve con "" (sin
 * contraseña) — igual que el flujo original permitía. Si cancela, null.
 * @param {string} title
 * @param {string} [hint]
 * @returns {Promise<string|null>}
 */
export function promptNewPassword(title, hint = '') {
    return openModal({ title, hint, requireConfirm: true, allowEmpty: true });
}

function openModal({ title, hint, requireConfirm, allowEmpty }) {
    const overlay = ensureModal();
    const box = overlay.querySelector('.pw-modal-box');
    const titleEl = box.querySelector('.pw-modal-title');
    const hintEl = box.querySelector('.pw-modal-hint');
    const input1 = box.querySelector('#pw-modal-input-1');
    const confirmRow = box.querySelector('.pw-modal-confirm-row');
    const input2 = box.querySelector('#pw-modal-input-2');
    const errorEl = box.querySelector('.pw-modal-error');
    const btnCancel = box.querySelector('.pw-modal-cancel');
    const btnOk = box.querySelector('.pw-modal-ok');
    const label1 = box.querySelector('[data-for="pw1"]');
    const label2 = box.querySelector('[data-for="pw2"]');

    titleEl.textContent = title;
    hintEl.textContent = hint;
    hintEl.style.display = hint ? 'block' : 'none';
    label1.textContent = t('modal.pw.password');
    label2.textContent = t('modal.pw.repeat');
    confirmRow.style.display = requireConfirm ? 'block' : 'none';
    errorEl.style.display = 'none';
    input1.value = '';
    input2.value = '';
    btnCancel.textContent = t('modal.btn.cancel');
    btnOk.textContent = t('modal.btn.confirm');

    overlay.classList.add('open');
    setTimeout(() => input1.focus(), 0);

    return new Promise((resolve) => {
        function cleanup(result) {
            overlay.classList.remove('open');
            input1.removeEventListener('keydown', onKeydown);
            input2.removeEventListener('keydown', onKeydown);
            btnOk.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
            resolve(result);
        }

        function onConfirm() {
            const pw1 = input1.value;
            if (requireConfirm) {
                const pw2 = input2.value;
                if (pw1 !== pw2) {
                    errorEl.textContent = t('modal.pw.mismatch');
                    errorEl.style.display = 'block';
                    return;
                }
            }
            if (!allowEmpty && pw1.trim() === '') {
                errorEl.textContent = t('modal.pw.empty');
                errorEl.style.display = 'block';
                return;
            }
            cleanup(pw1);
        }

        function onCancel() {
            cleanup(null);
        }

        function onKeydown(e) {
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
        }

        input1.addEventListener('keydown', onKeydown);
        input2.addEventListener('keydown', onKeydown);
        btnOk.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
    });
}
