const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
fs.mkdirSync('public/pdf', { recursive: true });
fs.copyFileSync(path.join(root, 'build/pdf.worker.min.mjs'), 'public/pdf/pdf.worker.min.mjs');
fs.copyFileSync(path.join(root, 'LICENSE'), 'public/pdf/LICENSE.txt');
