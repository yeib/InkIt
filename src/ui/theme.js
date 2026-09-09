export function setupSettings() {
    const settingDarkMode = document.getElementById('setting-dark-mode');
    const settingHighQuality = document.getElementById('setting-high-quality');
    const settingAutoFlatten = document.getElementById('setting-auto-flatten');
    
    // Load from localStorage
    const savedSettings = JSON.parse(localStorage.getItem('inkit_settings') || '{"darkMode": false, "highQuality": true, "autoFlatten": true}');
    if (settingDarkMode) settingDarkMode.checked = savedSettings.darkMode;
    if (settingHighQuality) settingHighQuality.checked = savedSettings.highQuality;
    if (settingAutoFlatten) settingAutoFlatten.checked = savedSettings.autoFlatten;

    const applySettings = () => {
        // Guardar
        localStorage.setItem('inkit_settings', JSON.stringify({
            darkMode: settingDarkMode?.checked || false,
            highQuality: settingHighQuality?.checked || false,
            autoFlatten: settingAutoFlatten?.checked || false
        }));

        // Aplicar Modo Oscuro a los canvas de PDF
        const viewer = document.getElementById('pdf-viewer');
        if (viewer && settingDarkMode?.checked) {
            viewer.classList.add('dark-pdf-mode');
        } else if (viewer) {
            viewer.classList.remove('dark-pdf-mode');
        }
    };

    // Apply on startup and change
    applySettings();
    document.querySelectorAll('.glass-checkbox').forEach(cb => {
        cb.addEventListener('change', applySettings);
    });
}
