import type { Paper } from './types';
import type { PDFDocumentProxy } from 'pdfjs-dist';
export async function readPaperPdf(file: File, progress?: (page: number, total: number) => void): Promise<Paper> {
  if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 12 * 1024 * 1024) throw Error('Choose a PDF no larger than 12 MB.');
  const buffer = await file.arrayBuffer();
  const magic = new TextDecoder().decode(buffer.slice(0, 5));
  if (magic !== '%PDF-') throw Error('This file is not a readable PDF.');
  const fileHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map(b => b.toString(16).padStart(2, '0')).join('');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  try { const document = await task.promise; return await extractPdfDocument(document, file.name, fileHash, progress); }
  catch (e) { if ((e as { name?: string }).name === 'PasswordException') throw Error('This PDF is password-protected. Upload an unlocked copy.'); throw e; }
  finally { await task.destroy(); }
}
export async function extractPdfDocument(document: PDFDocumentProxy, fileName: string, fileHash: string, progress?: (page: number, total: number) => void): Promise<Paper> {
    const textPages = [];
    let remaining = 90000, truncated = document.numPages > 120;
    for (let number = 1; number <= Math.min(document.numPages, 120); number++) {
      progress?.(number, document.numPages);
      const page = await document.getPage(number), content = await page.getTextContent();
      const raw = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      const text = raw.slice(0, Math.min(15000, remaining));
      if (text.length < raw.length) truncated = true;
      if (text) textPages.push({ number, text });
      remaining -= text.length;
      page.cleanup();
      if (remaining <= 0) { truncated = number < document.numPages || truncated; break; }
    }
    if (textPages.reduce((n, p) => n + p.text.length, 0) < 80) throw Error('No usable text was found. This may be a scanned PDF; run OCR on it and upload the searchable PDF.');
    let title = fileName.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
    try { const metadata = await document.getMetadata(); const candidate = (metadata.info as { Title?: string })?.Title;
      if (typeof candidate === 'string' && candidate.trim().length > 8) title = candidate.trim().slice(0, 700); } catch { /* Filename is an honest fallback. */ }
    const candidateDoi = textPages.slice(0, 2).map(p => p.text).join(' ').match(/10\.\d{4,9}\/[^\s<>"\]]+/i)?.[0].replace(/[.,;]+$/, '') || '';
    const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(textPages))))).map(b => b.toString(16).padStart(2, '0')).join('');
    return { id: crypto.randomUUID(), title, authors: [], year: null, doi: candidateDoi, url: '', journal: '', volume: '', issue: '', pages: '',
      metadataSource: 'manual', textScope: truncated ? 'partial_text' : 'full_text', textPages, contentHash, fileHash, fileName, notes: '', tags: [] };
}
