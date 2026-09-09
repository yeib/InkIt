import { defineConfig } from 'vite';

export default defineConfig({
  // Prevenir que Vite borre la terminal para que podamos ver errores de Rust (Tauri)
  clearScreen: false,
  
  server: {
    port: 5173,
    strictPort: true, // Tauri espera que esté en este puerto específico
    watch: {
      // Ignorar la carpeta de Rust (src-tauri) para evitar conflictos de bloqueo (EBUSY) con Cargo en Windows
      ignored: ['**/src-tauri/**']
    }
  }
});
