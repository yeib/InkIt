const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'node_modules', 'pdfjs-dist');
const destDir = path.join(root, 'public', 'pdfjs');

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(source)) return;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source);
  for (const file of files) {
    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);
    if (fs.lstatSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      fs.copyFileSync(curSource, curTarget);
    }
  }
}

console.log('[pdfjs-assets] Copiando assets de pdfjs-dist a public/pdfjs...');
copyFolderRecursiveSync(path.join(srcDir, 'wasm'), path.join(destDir, 'wasm'));
copyFolderRecursiveSync(path.join(srcDir, 'cmaps'), path.join(destDir, 'cmaps'));
copyFolderRecursiveSync(path.join(srcDir, 'standard_fonts'), path.join(destDir, 'standard_fonts'));
console.log('[pdfjs-assets] Copia completada con éxito.');
