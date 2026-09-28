import { updateAnnotationsMode } from '../modules/typewriter.js';

export function setupToolSelection() {
    const tools = [
        { id: 'btn-pointer', activate: activatePointer },
        { id: 'btn-typewriter', activate: activateTypewriter },
        { id: 'btn-highlight', activate: activateHighlights },
        { id: 'btn-stamp', activate: activateStamps },
        { id: 'btn-esign', activate: activateEsign }
    ];
    const buttons = tools
        .map(tool => ({ ...tool, button: document.getElementById(tool.id) }))
        .filter(tool => tool.button);

    const activate = selectedTool => {
        buttons.forEach(({ button }) => button.classList.toggle('primary', button === selectedTool.button));
        selectedTool.activate();
    };

    buttons.forEach(tool => {
        tool.button.addEventListener('click', () => {
            const pointer = buttons.find(item => item.id === 'btn-pointer');
            if (tool.id !== 'btn-pointer' && tool.button.classList.contains('primary')) {
                if (pointer) activate(pointer);
                return;
            }
            activate(tool);
        });
    });
}

function disableTypewriter() {
    window.disableTypewriter?.();
}

function disableSignatures() {
    window.disableSignatures?.();
}

function disableHighlights() {
    window.disableHighlights?.();
}

function activatePointer() {
    disableTypewriter();
    disableSignatures();
    disableHighlights();
    updateAnnotationsMode('pointer');
}

function activateTypewriter() {
    disableSignatures();
    disableHighlights();
    window.enableTypewriter?.();
    updateAnnotationsMode('typewriter');
}

function activateHighlights() {
    disableTypewriter();
    disableSignatures();
    window.enableHighlights?.();
    updateAnnotationsMode('pointer');
}

function activateStamps() {
    disableTypewriter();
    disableHighlights();
    window.enableStampVault?.();
    updateAnnotationsMode('pointer');
}

function activateEsign() {
    disableTypewriter();
    disableHighlights();
    window.enableEsignVault?.();
    updateAnnotationsMode('pointer');
}
