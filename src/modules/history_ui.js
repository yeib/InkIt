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
        if (btnUndo.disabled) return;
        const currentState = getGlobalState();
        const prevState = globalHistory.undo(currentState);
        if (prevState) restoreGlobalState(prevState);
    };

    const doRedo = () => {
        if (btnRedo.disabled) return;
        const currentState = getGlobalState();
        const nextState = globalHistory.redo(currentState);
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
