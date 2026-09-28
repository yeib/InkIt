import { globalHistory } from './history.js';
import { getGlobalState, restoreGlobalState } from './state.js';
import { t } from './translations.js';

function describeChange(previous, current, index) {
    const categories = [
        ['stamp', previous.imageAnnotations || [], current.imageAnnotations || []],
        ['text', previous.annotations || [], current.annotations || []],
        ['highlight', previous.highlightAnnotations || [], current.highlightAnnotations || []]
    ];

    for (const [key, before, after] of categories) {
        const beforeById = new Map(before.map((item, itemIndex) => [item.id ?? itemIndex, item]));
        const afterById = new Map(after.map((item, itemIndex) => [item.id ?? itemIndex, item]));
        const added = [...afterById.keys()].filter(id => !beforeById.has(id)).length;
        const removed = [...beforeById.keys()].filter(id => !afterById.has(id)).length;
        const changed = [...afterById].some(([id, item]) =>
            beforeById.has(id) && JSON.stringify(beforeById.get(id)) !== JSON.stringify(item)
        );

        if (added) return `${t(`history.${key}_added`)} · ${index}`;
        if (removed) return `${t(`history.${key}_removed`)} · ${index}`;
        if (changed) return `${t(`history.${key}_changed`)} · ${index}`;
    }

    return `${t('history.change')} · ${index}`;
}

export function initHistoryUI() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const undoToggle = document.getElementById('btn-undo-history');
    const redoToggle = document.getElementById('btn-redo-history');
    const undoMenu = document.getElementById('undo-history-menu');
    const redoMenu = document.getElementById('redo-history-menu');
    const historyMenus = [undoMenu, redoMenu].filter(Boolean);

    const closeMenus = () => {
        historyMenus.forEach(menu => {
            menu.style.display = 'none';
            menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
        });
    };

    const restoreTo = (index) => {
        globalHistory.isRestoring = true;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        const snapshot = globalHistory.jumpTo(index);
        if (snapshot) restoreGlobalState(snapshot);
        closeMenus();
        requestAnimationFrame(() => {
            globalHistory.isRestoring = false;
        });
    };

    const renderMenu = (menu, indices) => {
        menu.replaceChildren();
        for (const index of indices) {
            const title = index === 0
                ? t('history.initial')
                : describeChange(globalHistory.history[index - 1], globalHistory.history[index], index);
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'history-dropdown-item';
            item.setAttribute('role', 'menuitem');
            item.textContent = title;
            item.addEventListener('click', () => restoreTo(index));
            menu.appendChild(item);
        }
    };

    const updateButtons = () => {
        const canUndo = globalHistory.currentIndex > 0;
        const canRedo = globalHistory.currentIndex < globalHistory.history.length - 1;
        btnUndo.disabled = !canUndo;
        btnRedo.disabled = !canRedo;
        undoToggle.disabled = !canUndo;
        redoToggle.disabled = !canRedo;

        if (undoMenu.style.display === 'flex') {
            renderMenu(undoMenu, Array.from({ length: globalHistory.currentIndex }, (_, i) => globalHistory.currentIndex - 1 - i));
        }
        if (redoMenu.style.display === 'flex') {
            renderMenu(redoMenu, Array.from(
                { length: globalHistory.history.length - globalHistory.currentIndex - 1 },
                (_, i) => globalHistory.currentIndex + i + 1
            ));
        }
    };

    const moveHistory = (direction) => {
        globalHistory.isRestoring = true;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        const snapshot = direction === 'undo' ? globalHistory.undo() : globalHistory.redo();
        if (snapshot) restoreGlobalState(snapshot);
        requestAnimationFrame(() => {
            globalHistory.isRestoring = false;
        });
    };

    globalHistory.onChange(updateButtons);
    updateButtons();

    btnUndo.addEventListener('click', () => moveHistory('undo'));
    btnRedo.addEventListener('click', () => moveHistory('redo'));

    const toggleMenu = (toggle, menu, getIndices) => {
        const shouldOpen = menu.style.display !== 'flex';
        closeMenus();
        if (!shouldOpen) return;
        renderMenu(menu, getIndices());
        menu.style.display = 'flex';
        toggle.setAttribute('aria-expanded', 'true');
    };

    undoToggle.addEventListener('click', () => toggleMenu(
        undoToggle,
        undoMenu,
        () => Array.from({ length: globalHistory.currentIndex }, (_, i) => globalHistory.currentIndex - 1 - i)
    ));
    redoToggle.addEventListener('click', () => toggleMenu(
        redoToggle,
        redoMenu,
        () => Array.from(
            { length: globalHistory.history.length - globalHistory.currentIndex - 1 },
            (_, i) => globalHistory.currentIndex + i + 1
        )
    ));

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.history-control')) closeMenus();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenus();
        if (event.ctrlKey && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            moveHistory('undo');
        } else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            moveHistory('redo');
        }
    });
}
