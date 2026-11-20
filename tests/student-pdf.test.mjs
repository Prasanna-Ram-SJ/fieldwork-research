import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const require = createRequire(import.meta.url);
const { loadTs } = require('./helpers/load-ts.cjs');
const { extractPdfDocument, readPaperPdf } = loadTs('src/lib/student/pdf.ts');
export function makePdf(first, second) {
  const stream = text => { const commands = 'BT /F1 12 Tf 50 750 Td (' + text.replace(/[\\()]/g, c => '\\' + c) + ') Tj ET'; return '<< /Length ' + Buffer.byteLength(commands) + ' >>\nstream\n' + commands + '\nendstream'; };
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>', stream(first),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>', stream(second),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Title (Synthetic reading fixture) >>'];
  let pdf = '%PDF-1.4\n', offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += (i + 1) + ' 0 obj\n' + body + '\nendobj\n'; });
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 9\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 9 /Root 1 0 R /Info 8 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return new Uint8Array(Buffer.from(pdf));
}
test('real PDF.js extraction preserves actual page numbers and document metadata', async () => {
  const first = 'Synthetic methods fixture: forty students volunteered for an observational classroom comparison.';
  const second = 'Synthetic results fixture: self-selection and small sample size prevent causal conclusions.';
  const loading = getDocument({ data: makePdf(first, second), useSystemFonts: true });
  try {
    const document = await loading.promise;
    const result = await extractPdfDocument(document, 'fixture.pdf', 'synthetic-file-hash');
    assert.equal(result.title, 'Synthetic reading fixture');
    assert.deepEqual(result.textPages.map(p => p.number), [1, 2]);
    assert.match(result.textPages[0].text, /forty students/);
    assert.match(result.textPages[1].text, /prevent causal/);
    assert.equal(result.textScope, 'full_text');
    assert.equal(result.metadataSource, 'manual');
    assert.equal(result.contentHash.length, 64);
  } finally { await loading.destroy(); }
});
test('blank scans, invalid magic and oversized PDFs fail without an AI request', async () => {
  await assert.rejects(readPaperPdf(new File(['not a pdf'], 'fixture.pdf')), /not a readable PDF/);
  await assert.rejects(readPaperPdf(new File(['test'], 'fixture.txt')), /Choose a PDF/);
  await assert.rejects(readPaperPdf({ name: 'large.pdf', size: 13 * 1024 * 1024 }), /12 MB/);
  const loading = getDocument({ data: makePdf('', ''), useSystemFonts: true });
  try { await assert.rejects(extractPdfDocument(await loading.promise, 'scan.pdf', 'hash'), /No usable text/); }
  finally { await loading.destroy(); }
});
