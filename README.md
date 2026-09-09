<div align="center">
  <img src="public/InkIt_Logo.png" width="150" alt="InkIt Logo"/>
  <h1>🖋️ InkIt</h1>
  
  <p>
    <img src="https://img.shields.io/badge/Platform-Windows-blue" alt="Windows Platform" />
    <img src="https://img.shields.io/badge/Framework-Tauri_v2-FFC131?logo=tauri&logoColor=white" alt="Tauri" />
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License MIT" />
    <img src="https://img.shields.io/badge/Privacy-100%25_Offline-success" alt="100% Offline" />
  </p>

  <p><strong>A lightning-fast, ultra-lightweight, and 100% offline PDF signer and filler.</strong></p>
</div>

---

## ⚡ Why InkIt?

Adobe Acrobat is heavy. SumatraPDF is great for reading, but lacks interactive signing. **InkIt** bridges the gap. 

Built for Windows with **Tauri (Rust + JS)**, InkIt opens your heaviest PDFs in milliseconds, lets you draw your signature smoothly, and flattens it directly into the binary—all completely offline.

## 💎 Key Features

- **🚀 Instant Cold Start:** Opens faster than a standard web browser tab. No splash screens.
- **🛡️ Provable Privacy (100% Offline):** Zero cloud APIs. The app makes absolutely no network calls and the Tauri configuration strictly drops external network permissions. Your sensitive legal contracts never leave your hard drive.
- **🖋️ Fluid Canvas Signing:** Smooth, hardware-accelerated signature drawing using native Canvas.
- **💾 Direct Binary Flattening:** Injects your signature directly into the PDF stream so it cannot be modified by the receiver.

## 🏗️ Architecture & Tech Stack

Currently, InkIt is built as a hybrid application to maximize UI fluidity and rapid prototyping:

- **Frontend (UI & Rendering):** Vanilla JS + ES6 Modules. Uses `pdf.js` for fast document rendering and `pdf-lib` for current binary manipulation.
- **Backend (Native Shell):** Rust 🦀 + Tauri v2. Handles the native Windows bindings, secure file system operations (`std::fs`), and OS dialogs.

> **🚧 Pre-Alpha Notice & v1.0 Rust Roadmap:** 
> This repository is currently in a **Pre-Alpha (MVP)** stage. To quickly iterate on the fluid UI and solve the complex coordinate mapping between the drawing Canvas and the PDF, the initial binary flattening is handled via JavaScript (`pdf-lib`). 
> 
> **The official goal for v1.0** is to migrate all PDF stream parsing and binary flattening directly to the native **Rust backend** (using crates like `lopdf` or `pdf-writer`). This will dramatically improve performance on massive documents, reduce frontend RAM usage, and fully leverage Rust's memory safety. We shipped UX first, but native Rust performance is the ultimate destination.

## 🚀 Getting Started

To run InkIt locally in development mode:

### Prerequisites
- Node.js (v18+)
- Rust (latest stable)
- Tauri CLI dependencies for Windows

### Installation

```bash
# Clone the repository
git clone https://github.com/yeib/InkIt.git
cd InkIt

# Install dependencies
npm install

# Start the development server and Rust backend
npm run tauri dev
```

## 📦 Building for Production

To build a standalone Windows executable (`.exe` o `.msix`):

```bash
npm run tauri build
```

## 🤝 Contributing

This project is currently in active development. Pull requests are absolutely welcome! 

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
<div align="center">
  <i>Part of the <b>Yeib Ecosystem</b> — High-Performance Native Windows Apps.</i>
</div>
