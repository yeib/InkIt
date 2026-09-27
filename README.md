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

Adobe Acrobat is heavy. SumatraPDF is great for reading, but lacks interactive signing and form filling. **InkIt** bridges the gap. 

Built for Windows with **Tauri (Rust + JS)**, InkIt opens your heaviest PDFs in milliseconds, lets you type anywhere, drop checkmarks, draw your signature smoothly, and flattens it directly into the binary—all completely offline.

## 💎 Key Features

- **🚀 Instant Cold Start:** Opens faster than a standard web browser tab. No splash screens.
- **🛡️ Provable Privacy (100% Offline):** Zero cloud APIs. Your sensitive legal contracts never leave your hard drive.
- **🖋️ Fluid Canvas Signing & Bault:** Smooth, hardware-accelerated signature drawing. Save your frequent signatures to use them with one click.
- **🔤 Typewriter & Quick Stamps:** Click anywhere to type text (with customizable background colors). Instantly drop checkmarks (✓, ✗) or the current Date.
- **🖍️ Freehand Highlighter:** Mark up your documents with a fluid, multi-color overlay highlighter that saves directly into the PDF.
- **🎓 Stamps & Digital Identities:** We split signatures into two vaults. Save your drawn/imported stamps, and generate professional-looking "Digital Identities" (including Name, Email, and Role) directly in the app.
- **🎨 Dark Mode & Customization:** Force dark mode on bright PDFs to protect your eyes, and toggle high-quality rendering.
- **🖨️ Export & Print:** Print directly from the app (without annoying browser headers) or export pages as PNGs.
- **🌍 Dual Language:** Fully translated into English and Spanish.

## 🏗️ Architecture & Tech Stack

Currently, InkIt is built as a hybrid application to maximize UI fluidity and rapid prototyping:

- **Frontend (UI & Rendering):** Vanilla JS + ES6 Modules. Uses `pdf.js` for fast document rendering and `pdf-lib` for binary manipulation.
- **Backend (Native Shell):** Rust 🦀 + Tauri v2. Handles the native Windows bindings, secure file system operations (`std::fs`), and OS dialogs.

> **🎉 v1.0.0 (The Official Release) is Here!** 
> 
> InkIt has reached its ultimate v1.0 milestone! All PDF stream parsing, injection, and visual flattening are now processed natively in our **Rust backend** for maximum performance and zero memory leaks. 
> 
> With v1.0, we've successfully introduced **Cryptographic Digital Signatures (PKCS#7/CMS)** with .pfx/.p12 certificates, a brand new **Multi-Document Side-Bubble Interface**, and a bulletproof Undo/Redo history manager. The application is now fully packaged for the Microsoft Store (MSIX) and ready for professional, legally binding workflows.

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

To build a standalone Windows executable (`.exe` or `.msix`):

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
  <i>Part of the <b>Yeib Ecosystem</b> — Fast, Lightweight Native Windows Apps.</i><br>
  <a href="https://yeib.cl">yeib.cl</a>
</div>

