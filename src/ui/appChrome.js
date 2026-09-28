import { getVersion } from '@tauri-apps/api/app';
import { applyTranslations, getLang, setLang } from '../modules/translations.js';

export function setupAppChrome() {
    const languageSelect = document.getElementById('setting-language');
    if (languageSelect) {
        languageSelect.value = getLang();
        languageSelect.addEventListener('change', event => setLang(event.target.value));
    }
    applyTranslations();

    const aboutModal = document.getElementById('about-modal');
    document.getElementById('menu-about')?.addEventListener('click', () => {
        const menu = document.getElementById('main-menu-dropdown');
        if (menu) menu.style.display = 'none';
        if (aboutModal) aboutModal.style.display = 'flex';
    });
    document.getElementById('btn-about-close')?.addEventListener('click', () => {
        if (aboutModal) aboutModal.style.display = 'none';
    });

    void setupVersion();
}

async function setupVersion() {
    try {
        const version = await getVersion();
        const versionDisplay = document.getElementById('app-version-display');
        const aboutVersion = document.getElementById('about-app-version');
        if (versionDisplay) versionDisplay.innerText = `InkIt v${version}`;
        if (aboutVersion) aboutVersion.innerText = `v${version}`;
    } catch (error) {
        console.error('No se pudo obtener la versión de Tauri:', error);
    }
}
