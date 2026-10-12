import { commitAction } from '../state.js';
import { renderAnnotation } from './interactions.js';

export const COMMON_EMOJIS = [
    '😊', '👍', '👎', '⭐',
    '❤️', '⚠️', '🔥', '📌',
    '💡', '🎉', '❓', '❗',
    '✔️', '❌', '⏳', '📝'
];

/**
 * Genera un dataUrl en PNG para estampar un símbolo o emoji con alta definición.
 */
export function createStampDataUrl(symbol, color) {
    if (!symbol) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 80px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillStyle = color || '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 60, 65);

    return canvas.toDataURL('image/png');
}

/**
 * Inserta texto o símbolo en la anotación de texto activa (si el usuario está escribiendo).
 */
export function insertIntoActiveAnnotation(str, state, annotations) {
    if (!state.activeAnnotation) return false;
    const anno = annotations.find(a => a.id === state.activeAnnotation.dataset.id);
    if (!anno) return false;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && state.activeAnnotation.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(str);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        state.activeAnnotation.innerText += str;
    }
    anno.text = state.activeAnnotation.innerText;
    commitAction();
    return true;
}

/**
 * Configura los botones de símbolos (✓, ✗), el selector de emojis y la fecha en la barra de texto.
 */
export function setupSymbols(toolbar, state, annotations, addImageAnnotationToPage) {
    const stampBtns = toolbar.querySelectorAll('.stamp-btn');
    const btnEmoji = toolbar.querySelector('#btn-stamp-emoji');
    const emojiDropdown = toolbar.querySelector('#emoji-picker-dropdown');

    const resetStampBtns = () => {
        stampBtns.forEach(b => b.classList.remove('active'));
        if (btnEmoji) btnEmoji.innerText = '😊';
    };

    // Construir grid de emojis en el popover
    if (emojiDropdown) {
        emojiDropdown.innerHTML = '';
        emojiDropdown.style.display = 'none';
        COMMON_EMOJIS.forEach(emoji => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'emoji-grid-btn';
            btn.innerText = emoji;
            btn.title = emoji;

            // Evitar perder foco del texto activo al presionar
            btn.addEventListener('mousedown', (e) => {
                if (state.activeAnnotation) e.preventDefault();
            });

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                emojiDropdown.style.display = 'none';

                // Si hay una caja de texto abierta, insertar directamente
                if (insertIntoActiveAnnotation(emoji, state, annotations)) {
                    return;
                }

                // Modo estampa en hoja
                resetStampBtns();
                btnEmoji.innerText = emoji;
                btnEmoji.classList.add('active');
                state.pendingStampType = 'symbol';
                state.pendingStampSymbol = emoji;
                if (state.pdfContainer) state.pdfContainer.style.cursor = 'crosshair';
            });

            emojiDropdown.appendChild(btn);
        });
    }

    // Toggle del dropdown de emojis
    btnEmoji?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btnEmoji.classList.contains('active')) {
            resetStampBtns();
            state.pendingStampType = null;
            state.pendingStampSymbol = null;
            if (state.pdfContainer) state.pdfContainer.style.cursor = 'text';
            if (emojiDropdown) emojiDropdown.style.display = 'none';
            return;
        }

        if (emojiDropdown) {
            const isVisible = emojiDropdown.style.display === 'grid';
            emojiDropdown.style.display = isVisible ? 'none' : 'grid';
        }
    });

    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (emojiDropdown && !emojiDropdown.contains(e.target) && e.target !== btnEmoji) {
            emojiDropdown.style.display = 'none';
        }
    });

    // Botones de símbolos estándar (✓, ✗, Fecha)
    stampBtns.forEach(btn => {
        if (btn.id === 'btn-stamp-emoji') return;

        btn.addEventListener('mousedown', (e) => {
            if (state.activeAnnotation) e.preventDefault();
        });

        btn.addEventListener('click', (e) => {
            if (emojiDropdown) emojiDropdown.style.display = 'none';

            // Desactivar si ya estaba activo
            if (btn.classList.contains('active')) {
                resetStampBtns();
                state.pendingStampType = null;
                state.pendingStampSymbol = null;
                if (state.pdfContainer) state.pdfContainer.style.cursor = 'text';
                return;
            }

            const symbol = btn.dataset.stamp;
            const isDate = btn.id === 'btn-stamp-date' || e.target.id === 'btn-stamp-date';
            const valueToInsert = isDate ? new Date().toLocaleDateString() : symbol;

            // Si hay una anotación activa, insertar el carácter directamente
            if (valueToInsert && insertIntoActiveAnnotation(valueToInsert, state, annotations)) {
                return;
            }

            resetStampBtns();
            btn.classList.add('active');

            if (symbol) {
                state.pendingStampType = 'symbol';
                state.pendingStampSymbol = symbol;
                if (state.pdfContainer) state.pdfContainer.style.cursor = 'crosshair';
            } else if (isDate) {
                state.pendingStampType = 'date';
                state.pendingStampSymbol = new Date().toLocaleDateString();
                if (state.pdfContainer) state.pdfContainer.style.cursor = 'crosshair';
            }
        });
    });

    return {
        resetStampBtns,
        placeSymbolOrDate: (pageWrapper, pageNum, baseX, baseY, currentScale) => {
            if (!state.pendingStampSymbol) {
                state.pendingStampType = null;
                resetStampBtns();
                if (state.pdfContainer) state.pdfContainer.style.cursor = 'text';
                return false;
            }

            if (state.pendingStampType === 'symbol') {
                const stampPng = createStampDataUrl(state.pendingStampSymbol, state.currentColor);
                if (stampPng) {
                    const posX = Math.max(0, baseX - 20);
                    const posY = Math.max(0, baseY - 20);
                    addImageAnnotationToPage(stampPng, pageNum, posX, posY, 40);
                }
            } else if (state.pendingStampType === 'date') {
                const posX = Math.max(0, baseX - 40);
                const posY = Math.max(0, baseY - 10);
                const newAnno = {
                    id: Date.now().toString(),
                    pageNum: pageNum,
                    x: posX,
                    y: posY,
                    text: state.pendingStampSymbol,
                    fontSize: state.currentFontSize,
                    color: state.currentColor,
                    bgColor: "transparent"
                };
                annotations.push(newAnno);
                renderAnnotation(newAnno, pageWrapper, currentScale);
                commitAction();
            }

            state.pendingStampType = null;
            state.pendingStampSymbol = null;
            resetStampBtns();
            if (state.pdfContainer) state.pdfContainer.style.cursor = 'text';
            return true;
        }
    };
}
