import { documentDir, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { mkdir } from '@tauri-apps/plugin-fs';
import { showAlert } from '../modules/confirmModal.js';
import { t } from '../modules/translations.js';

export function setupAppMenu(getCurrentPdfPath) {
    const toggle = document.getElementById('btn-main-menu');
    const menu = document.getElementById('main-menu-dropdown');

    if (toggle && menu) {
        toggle.addEventListener('click', event => {
            event.stopPropagation();
            menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
        });

        document.addEventListener('click', event => {
            if (!menu.contains(event.target) && event.target !== toggle) {
                menu.style.display = 'none';
            }
        });

        document.getElementById('menu-save-as')?.addEventListener('click', async () => {
            menu.style.display = 'none';
            const { savePdf } = await import('../core/pdfExport.js');
            await savePdf(getCurrentPdfPath());
        });

        document.getElementById('btn-open-workspace')?.addEventListener('click', async () => {
            try {
                const documentsPath = await documentDir();
                const workspacePath = await join(documentsPath, 'InkIt');
                await mkdir(workspacePath, { recursive: true });
                await invoke('open_file', { path: workspacePath });
            } catch (error) {
                console.error('Error abriendo la carpeta de InkIt:', error);
            }
        });

        document.getElementById('btn-quick-save')?.addEventListener('click', async () => {
            const { savePdf } = await import('../core/pdfExport.js');
            await savePdf(getCurrentPdfPath());
        });

        document.getElementById('menu-print')?.addEventListener('click', async () => {
            menu.style.display = 'none';
            await printDocument(getCurrentPdfPath());
        });

        document.getElementById('menu-export-png')?.addEventListener('click', async () => {
            menu.style.display = 'none';
            const { exportPng } = await import('../core/pdfExport.js');
            await exportPng(getCurrentPdfPath());
        });

        document.getElementById('menu-settings')?.addEventListener('click', () => {
            const settings = document.getElementById('settings-modal');
            if (settings) settings.style.display = 'flex';
            menu.style.display = 'none';
        });
    }

    document.getElementById('btn-settings-close')?.addEventListener('click', () => {
        const settings = document.getElementById('settings-modal');
        if (settings) settings.style.display = 'none';
    });

    document.addEventListener('keydown', async event => {
        if (event.ctrlKey && event.key.toLowerCase() === 'p') {
            event.preventDefault();
            await printDocument(getCurrentPdfPath());
        } else if (event.ctrlKey && event.key.toLowerCase() === 'o') {
            event.preventDefault();
            document.getElementById('btn-open-pdf')?.click();
        } else if (event.ctrlKey && event.key.toLowerCase() === 'w') {
            event.preventDefault();
            document.getElementById('menu-close-pdf')?.click();
        } else if (event.ctrlKey && event.key.toLowerCase() === 's') {
            event.preventDefault();
            document.getElementById('btn-quick-save')?.click();
        } else if (event.ctrlKey && event.key === ',') {
            event.preventDefault();
            document.getElementById('menu-settings')?.click();
        }
    });
}

async function printDocument(currentPdfPath) {
    if (!currentPdfPath) {
        await showAlert(t('alert.title.attention'), t('alert.open_first'), 'warning');
        return;
    }
    window.print();
}
