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

  <p>
    <a href="https://apps.microsoft.com/detail/9PH8KK70MK9M">
      <img src="https://get.microsoft.com/images/en-us%20dark.svg" width="160" alt="Get it from Microsoft"/>
    </a>
  </p>
  <p><i>✨ Free on the Microsoft Store & GitHub ✨</i></p>
</div>

---

## ⚡ Why InkIt?

Adobe Acrobat is bloated and slow. SumatraPDF is great for reading, but lacks interactive signing and form filling. Web converters compromise document privacy. **InkIt bridges the gap.**

Built natively for Windows with **Rust (Tauri v2) and modern web technologies**, InkIt opens your heaviest PDFs in milliseconds, lets you sign fluidly, type anywhere, drop stamps, and flatten annotations directly into the document—all strictly offline on your own machine.

## 💎 Key Features

- **🚀 Instant Cold Start:** Launches in under 100ms. Zero loading screens, zero background telemetry.
- **🛡️ 100% Offline & Private:** Zero cloud dependencies. Your legal contracts and sensitive documents never leave your PC.
- **🖋️ Fluid Canvas Signing & Dual Vault:** Ultra-smooth signature drawing with Bézier curve smoothing. Store frequent signatures in your private vault for one-click reuse.
- **🔤 Typewriter & Quick Annotations:** Click anywhere to type text with customizable chip backgrounds. Drop instant checkmarks (✓, ✗) or localized date stamps.
- **🖍️ Freehand Highlighter:** Mark up documents with a fluid, multi-color overlay highlighter that saves directly into the PDF.
- **🎓 Digital Identities & Stamps:** Generate professional corporate signature stamps with Name, Email, and Role.
- **🎨 Dark Glassmorphism UI:** Fluent, eye-friendly dark mode for bright PDFs with custom theme controls.
- **🖨️ Native Print & PNG Export:** Clean high-resolution printing without browser margins or export pages as PNGs.
- **🌍 Bilingual Support:** Fully localized in English and Spanish.

## 🏗️ Architecture & Tech Stack

InkIt follows a lightweight, decoupled architecture designed for speed and native Windows integration:

- **Frontend:** Vanilla JS + ES6 Modules. Utilizes `pdfjs-dist` on dedicated Web Workers with WASM and CMap bundles for fast, pixel-perfect rendering of any PDF format.
- **Backend:** Native Rust 🦀 + Tauri v2. Handles OS dialogs, secure file system operations (`std::fs`), and binary annotation flattening.

## 🚀 Getting Started

To run InkIt locally in development mode:

### Prerequisites
- Node.js (v18+)
- Rust (latest stable)
- Visual Studio C++ Build Tools & Windows SDK
- Strawberry Perl on `PATH` (for the vendored OpenSSL build):
  ```powershell
  winget install --id StrawberryPerl.StrawberryPerl --exact
  ```

### Installation

```bash
# Clone the repository
git clone https://github.com/yeib/InkIt.git
cd InkIt

# Install dependencies (copies WASM and CMap assets automatically)
npm install

# Start development mode
npm run tauri dev
```

## 📦 Building for Production

To build a standalone Windows executable (`.exe`) or MSIX package:

```bash
npm run tauri build
```

---

## ⚡ Need Heavy-Duty Document Tools? Meet InkIt Pro

For power users, legal teams, and businesses needing batch processing and advanced cryptographic tools, explore **InkIt Pro** on the Microsoft Store:

| Feature | 🖋️ InkIt (Open Source) | ⚡ InkIt Pro |
| :--- | :---: | :---: |
| **Price & License** | Free (MIT) | One-time Lifetime |
| **Instant Offline Signing & Vault** | ✅ | ✅ |
| **Annotations, Text, Stamps & Highlighters** | ✅ | ✅ |
| **Multi-level PDF Compression** | ❌ | ✅ *(Save up to 80% file size)* |
| **Batch PDF Merge, Split & Range Extractor** | ❌ | ✅ *(Visual drag & drop)* |
| **AcroForm Auto-Detection & Interactive Fill** | ❌ | ✅ *(Flatten & vector)* |
| **Cryptographic PKCS#12 Digital Signatures** | Basic | ✅ *(.pfx / .p12 certificates)* |
| **Interactive Board & N-Up Sheet Compiler** | ❌ | ✅ *(Combine & rearrange)* |
| **Vector Watermarks & Dynamic Page Numbers** | ❌ | ✅ *(Bates numbering)* |
| **PDF Doctor & Damaged XRefs Repair** | ❌ | ✅ |
| **Export Center (ZIP, Long PNG strip, PDF)** | ❌ | ✅ |

👉 **[Get InkIt Pro on the Microsoft Store](https://apps.microsoft.com/detail/9N829VPRQ92W)** — *Upgrade to the complete offline professional PDF suite.*

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome!

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
