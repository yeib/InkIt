const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');
c = c.replace(/<<<<<<< HEAD[\s\S]*?=======\n/m, '');
c = c.replace(/>>>>>>> 5045695[\s\S]*?\n/m, '');
fs.writeFileSync('index.html', c);
