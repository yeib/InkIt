const fs = require('fs');
let code = fs.readFileSync('src/modules/state.js', 'utf-8');
code = code.replace(/renderImageAnnotationsForPage\(wrapper, pageNum, scale\);/g, `renderImageAnnotationsForPage(wrapper, pageNum, scale);\n        const hlCanvas = wrapper.querySelector('.highlight-canvas');\n        if (hlCanvas) {\n            hlCanvas.getContext('2d').clearRect(0, 0, hlCanvas.width, hlCanvas.height);\n            renderHighlightsForPage(pageNum, hlCanvas, scale);\n        }`);
fs.writeFileSync('src/modules/state.js', code);
