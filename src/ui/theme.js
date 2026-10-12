import { t } from '../modules/translations.js';

const SUN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 17px; height: 17px;"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
const MOON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 17px; height: 17px;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

export function setupSettings() {
    const settingDarkMode = document.getElementById('setting-dark-mode');
    const settingHighQuality = document.getElementById('setting-high-quality');
    const settingAutoFlatten = document.getElementById('setting-auto-flatten');
    const darkModeButton = document.getElementById('btn-dark-mode');
    
    // Load from localStorage
    const savedSettings = JSON.parse(localStorage.getItem('inkit_settings') || '{"darkMode": false, "highQuality": true, "autoFlatten": true}');
    if (settingDarkMode) settingDarkMode.checked = savedSettings.darkMode;
    if (settingHighQuality) settingHighQuality.checked = savedSettings.highQuality;
    if (settingAutoFlatten) settingAutoFlatten.checked = savedSettings.autoFlatten;

    const applySettings = () => {
        const isDark = Boolean(settingDarkMode?.checked);

        // Guardar
        localStorage.setItem('inkit_settings', JSON.stringify({
            darkMode: isDark,
            highQuality: settingHighQuality?.checked || false,
            autoFlatten: settingAutoFlatten?.checked || false
        }));

        // Aplicar Modo Oscuro a los canvas de PDF
        const viewer = document.getElementById('pdf-viewer');
        if (viewer && isDark) {
            viewer.classList.add('dark-pdf-mode');
        } else if (viewer) {
            viewer.classList.remove('dark-pdf-mode');
        }

        if (darkModeButton) {
            darkModeButton.innerHTML = isDark ? MOON_SVG : SUN_SVG;
            darkModeButton.classList.toggle('active', isDark);
            darkModeButton.setAttribute('aria-pressed', String(isDark));
            const tooltipText = isDark
                ? t('settings.dark_mode_active')
                : t('settings.dark_mode_toggle');
            darkModeButton.setAttribute('data-tooltip', tooltipText);
        }
    };

    // Apply on startup and change
    applySettings();
    darkModeButton?.addEventListener('click', () => {
        if (!settingDarkMode) return;
        settingDarkMode.checked = !settingDarkMode.checked;
        applySettings();
    });
    document.querySelectorAll('.glass-checkbox').forEach(cb => {
        cb.addEventListener('change', applySettings);
    });
}
