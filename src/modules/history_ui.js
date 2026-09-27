import { globalHistory } from './history.js';
import { getGlobalState, restoreGlobalState } from './state.js';

export function initHistoryUI() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    globalHistory.onChange(({ canUndo, canRedo }) => {
        btnUndo.disabled = !canUndo;
        btnRedo.disabled = !canRedo;
    });

    const doUndo = () => {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        if (btnUndo.disabled) return;
        const prevState = globalHistory.undo();
        if (prevState) restoreGlobalState(prevState);
    };

    const doRedo = () => {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        if (btnRedo.disabled) return;
        const nextState = globalHistory.redo();
        if (nextState) restoreGlobalState(nextState);
    };

    btnUndo.addEventListener('click', doUndo);
    btnRedo.addEventListener('click', doRedo);

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            doUndo();
        } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            doRedo();
        }
    });
}
