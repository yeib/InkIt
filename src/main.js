import { getCurrentWindow } from '@tauri-apps/api/window';
import { initHighlights } from './modules/highlights.js';
import { initHistoryUI } from './modules/history_ui.js';
import { initSignatures } from './modules/signatures.js';
import { initTypewriter } from './modules/typewriter.js';
import { initPdfViewer } from './core/pdfViewer.js';
import { setupAppChrome } from './ui/appChrome.js';
import { setupAppMenu } from './ui/appMenu.js';
import { setupDocumentLifecycle } from './core/documentLifecycle.js';
import { setupToolSelection } from './ui/toolSelection.js';
import { setupWindowControls } from './ui/windowControls.js';

console.log('InkIt Inicializado: Yeib Ecosystem');

async function initApp() {
    setupAppChrome();

    const appWindow = getCurrentWindow();
    setupWindowControls(appWindow);
    setupToolSelection();

    const { setupSettings } = await import('./ui/theme.js');
    setupSettings();

    await initPdfViewer('pdf-viewer');
    initTypewriter('pdf-viewer');
    initHighlights('pdf-viewer');
    initSignatures('pdf-viewer');
    initHistoryUI();

    const { getCurrentPdfPath } = setupDocumentLifecycle(appWindow);
    setupAppMenu(getCurrentPdfPath);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    void initApp();
}
