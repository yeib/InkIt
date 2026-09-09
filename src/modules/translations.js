export const translations = {
  en: {
    "app.by": "by Yeib",
    "menu.save": "💾 Save As (PDF)",
    "menu.print": "🖨️ Print",
    "menu.export": "🖼️ Export as PNG",
    "menu.settings": "⚙️ Settings",
    "menu.about": "ℹ️ About",
    "btn.open": "Open PDF",
    "btn.pointer": "🖱️ Select",
    "btn.typewriter": "🔤 Text",
    "btn.sign": "🖋️ Sign",
    "tw.size": "Size:",
    "tw.color": "Color:",
    "tw.stamps": "Stamps:",
    "stamp.date": "Date",
    "vault.title": "My Signatures",
    "vault.new_stamp": "+ Stamp",
    "vault.new_sig": "+ Draw",
    "vault.empty": "No saved signatures.",
    "pdf.empty": "Drag & Drop a PDF document or click \"Open PDF\"",
    "modal.stamp.title": "Create Digital Stamp",
    "modal.stamp.desc": "Enter your details to generate a professional visual stamp.",
    "modal.stamp.name": "Full name (e.g. Yeib)",
    "modal.stamp.detail": "E-mail, Role or ID (Optional)",
    "modal.btn.cancel": "Cancel",
    "modal.btn.generate": "Generate Stamp",
    "modal.sig.title": "Draw your signature",
    "modal.btn.import": "Import",
    "modal.btn.clear": "Clear",
    "modal.btn.save": "Save",
    "settings.title": "⚙️ InkIt Settings",
    "settings.high_quality": "High quality rendering (slower)",
    "settings.dark_mode": "Force Dark Mode PDF (Invert colors)",
    "settings.auto_flatten": "Merge signatures permanently on save",
    "settings.lang": "Language (Idioma)",
    "modal.btn.close": "Close",
    "ctx.size.s": "Small Size (S)",
    "ctx.size.m": "Medium Size (M)",
    "ctx.size.l": "Large Size (L)",
    "ctx.delete": "❌ Delete Signature",
    "about.title": "ℹ️ About InkIt",
    "about.version": "Version:",
    "about.contact": "Contact:",
    "about.portfolio": "Portfolio:",
    "about.github": "GitHub:",
    "alert.open_first": "Open a PDF first before saving.",
    "alert.saved": "PDF Saved successfully!",
    "alert.error_save": "Error saving: ",
    "alert.open_first_export": "Open a PDF first to export.",
    "alert.exported": "Page exported successfully as PNG.",
    "alert.error_export": "Error exporting: ",
    "alert.error_open": "There was an error opening the document.",
    "alert.error_import": "There was an error importing the image.",
    "alert.title.attention": "Attention",
    "alert.title.error": "Error",
    "stamp.signed_by": "Digitally signed by:",
    "stamp.date_label": "Date:",
    "stamp.verified": "Verified",
    "vault.delete_title": "Delete",
    "ctx.img_title": "Right click to resize or delete."
  },
  es: {
    "app.by": "por Yeib",
    "menu.save": "💾 Guardar Como (PDF)",
    "menu.print": "🖨️ Imprimir",
    "menu.export": "🖼️ Exportar como PNG",
    "menu.settings": "⚙️ Configuración",
    "menu.about": "ℹ️ Acerca de",
    "btn.open": "Abrir PDF",
    "btn.pointer": "🖱️ Seleccionar",
    "btn.typewriter": "🔤 Texto",
    "btn.sign": "🖋️ Firmar",
    "tw.size": "Tamaño:",
    "tw.color": "Color:",
    "tw.stamps": "Sellos:",
    "stamp.date": "Fecha",
    "vault.title": "Mis Firmas",
    "vault.new_stamp": "+ Sello",
    "vault.new_sig": "+ Dibujar",
    "vault.empty": "No hay firmas guardadas.",
    "pdf.empty": "Arrastra un documento PDF o haz clic en \"Abrir PDF\"",
    "modal.stamp.title": "Crear Sello Digital",
    "modal.stamp.desc": "Ingresa tus datos para generar un sello visual profesional.",
    "modal.stamp.name": "Nombre completo (Ej: Yeib)",
    "modal.stamp.detail": "E-mail, Cargo o ID (Opcional)",
    "modal.btn.cancel": "Cancelar",
    "modal.btn.generate": "Generar Sello",
    "modal.sig.title": "Dibuja tu firma",
    "modal.btn.import": "Importar",
    "modal.btn.clear": "Limpiar",
    "modal.btn.save": "Guardar",
    "settings.title": "⚙️ Configuración de InkIt",
    "settings.high_quality": "Renderizado de alta calidad (más lento)",
    "settings.dark_mode": "Forzar PDF a tema oscuro (Invertir colores)",
    "settings.auto_flatten": "Combinar firmas permanentemente al guardar",
    "settings.lang": "Language (Idioma)",
    "modal.btn.close": "Cerrar",
    "ctx.size.s": "Tamaño Pequeño (S)",
    "ctx.size.m": "Tamaño Mediano (M)",
    "ctx.size.l": "Tamaño Grande (L)",
    "ctx.delete": "❌ Eliminar Firma",
    "about.title": "ℹ️ Acerca de InkIt",
    "about.version": "Versión:",
    "about.contact": "Contacto:",
    "about.portfolio": "Portafolio:",
    "about.github": "GitHub:",
    "alert.open_first": "Abre un PDF primero antes de guardar.",
    "alert.saved": "PDF Guardado exitosamente!",
    "alert.error_save": "Error al guardar: ",
    "alert.open_first_export": "Abre un PDF primero para poder exportar.",
    "alert.exported": "Página exportada con éxito como PNG.",
    "alert.error_export": "Error al exportar: ",
    "alert.error_open": "Hubo un error al abrir el documento.",
    "alert.error_import": "Hubo un error importando la imagen.",
    "alert.title.attention": "Atención",
    "alert.title.error": "Error",
    "stamp.signed_by": "Firmado digitalmente por:",
    "stamp.date_label": "Fecha:",
    "stamp.verified": "Verificado",
    "vault.delete_title": "Eliminar",
    "ctx.img_title": "Clic derecho para cambiar tamaño o eliminar."
  }
};

let currentLang = localStorage.getItem('inkit_lang') || 'en';

export function setLang(lang) {
  if (translations[lang]) {
    currentLang = lang;
    localStorage.setItem('inkit_lang', lang);
    applyTranslations();
  }
}

export function getLang() {
  return currentLang;
}

export function t(key) {
  return translations[currentLang][key] || key;
}

export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
      if (el.placeholder) el.placeholder = t(key);
    } else {
      // Find the text node to replace, preserving icons or other child elements if any
      let textReplaced = false;
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '') {
          child.textContent = t(key);
          textReplaced = true;
          break;
        }
      }
      if (!textReplaced) {
        el.textContent = t(key);
      }
    }
  });
}
