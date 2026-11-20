import * as https from 'node:https';
import { lookup, resolve4, resolve6 } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import * as ipaddr from 'ipaddr.js';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import type { NormalizedEvidence } from '@/types/research';
import type { SourceReading, ReadingPassage } from '@/types/database';
const clean = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
const cache = new Map<string, { until: number; reading: SourceReading; text: { text: string; page?: number }[] }>();
export function publicAddress(address: string) {
  try { const value = ipaddr.process(address); return value.range() === 'unicast'; } catch { return false; }
}
export function safeSourceUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || /(^|\.)(localhost|local|internal|home|lan|onion|test|invalid|example)$/.test(url.hostname.toLowerCase())) throw Error('Only public HTTPS sources can be read.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(hostname) && !publicAddress(hostname)) throw Error('Private network sources are not allowed.');
  url.hash = ''; return url;
}
export async function publicSourceBytes(raw: string, signal: AbortSignal, redirects = 0): Promise<{ bytes: Buffer; type: string; url: string }> {
  if (process.env.FIELDWORK_CLOUDFLARE === 'true') return workerSourceBytes(raw, signal, redirects);
  if (redirects > 2 || signal.aborted) throw Error('Source reading limit reached.');
  const url = safeSourceUrl(raw), host = url.hostname.replace(/^\[|\]$/g, '');
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(Error('Source read timed out.')); if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); });
  const addresses = await Promise.race([lookup(host, { all: true }), cancelled]).finally(() => signal.removeEventListener('abort', onAbort));
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw Error('Source resolved to a private network.');
  const pinned = addresses.find(a => a.family === 4) || addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(url, { signal, maxHeaderSize: 16384,
      // Pin the checked address. TLS certificate validation still uses the URL host.
      lookup: ((_host: string, options: any, callback: any) => options?.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family)) as any,
      headers: { 'User-Agent': 'FieldworkResearch/1.0 (bounded public-source reader)', Accept: 'text/html,application/pdf,text/plain', 'Accept-Encoding': 'identity' },
    }, res => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) { res.destroy(); publicSourceBytes(new URL(res.headers.location, url).href, signal, redirects + 1).then(resolve, reject); return; }
      const type = String(res.headers['content-type'] || '').toLowerCase();
      const cap = type.includes('pdf') ? 4_000_000 : 1_500_000;
      if (status !== 200 || !/(html|pdf|text\/plain)/.test(type) || Number(res.headers['content-length']) > cap || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) { res.destroy(); reject(Error('This source could not be read within the public reading limits.')); return; }
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > cap) { res.destroy(Error('Source exceeded its reading size limit.')); return; } chunks.push(chunk); });
      res.on('error', reject); res.on('end', () => resolve({ bytes: Buffer.concat(chunks), type, url: url.href }));
    });
    req.setTimeout(8000, () => req.destroy(Error('Source read timed out.'))); req.on('error', reject);
  });
}

// Workers does not implement https.request's custom DNS lookup/socket options.
// Validate DNS and every redirect, then use its public-Internet fetch transport.
// Wrangler also enables global_fetch_strictly_public to avoid private origins.
export async function workerSourceBytes(raw: string, signal: AbortSignal, redirects = 0): Promise<{ bytes: Buffer; type: string; url: string }> {
  if (redirects > 2 || signal.aborted) throw Error('Source reading limit reached.');
  const url = safeSourceUrl(raw), host = url.hostname.replace(/^\[|\]$/g, '');
  if (!ipaddr.isValid(host)) {
    let abort = () => {};
    const cancelled = new Promise<never>((_, reject) => { abort = () => reject(Error('Source read timed out.')); signal.addEventListener('abort', abort, { once: true }); });
    const answers = await Promise.race([Promise.allSettled([resolve4(host), resolve6(host)]), cancelled]).finally(() => signal.removeEventListener('abort', abort));
    const addresses = answers.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    if (!addresses.length || addresses.some(address => !publicAddress(address))) throw Error('Source resolved to a private network.');
  }
  const response = await fetch(url, { signal, redirect: 'manual', headers: { 'User-Agent': 'FieldworkResearch/1.0 (bounded public-source reader)', Accept: 'text/html,application/pdf,text/plain', 'Accept-Encoding': 'identity' } });
  const location = response.headers.get('location');
  if ([301, 302, 303, 307, 308].includes(response.status) && location) {
    await response.body?.cancel();
    return workerSourceBytes(new URL(location, url).href, signal, redirects + 1);
  }
  const type = (response.headers.get('content-type') || '').toLowerCase(), cap = type.includes('pdf') ? 4_000_000 : 1_500_000;
  let headerSize = 0; response.headers.forEach((value, name) => { headerSize += name.length + value.length; });
  const encoding = response.headers.get('content-encoding');
  if (response.status !== 200 || !/(html|pdf|text\/plain)/.test(type) || Number(response.headers.get('content-length')) > cap || headerSize > 16384 || (encoding && encoding !== 'identity') || !response.body) {
    await response.body?.cancel(); throw Error('This source could not be read within the public reading limits.');
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; if (size > cap) { await reader.cancel(); throw Error('Source exceeded its reading size limit.'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return { bytes: Buffer.concat(chunks), type, url: url.href };
}
export function readingPassages(pages: { text: string; page?: number }[], question: string): ReadingPassage[] {
  const words = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [])].filter(w => !['what','does','with','from','that','this','research','about','which','their','would','should'].includes(w));
  const chunks: { text: string; page?: number; score: number; position: number }[] = [];
  for (const page of pages) {
    const text = clean(page.text);
    for(let position = 0; position < text.length && chunks.length < 250; position += 1000) {
      const piece = text.slice(position, position + 1300), lower = piece.toLowerCase();
      if (piece.length < 70) continue;
      const score = words.reduce((sum, w) => sum + (lower.includes(w) ? 1 : 0), 0) + (/\b(methods|results|limitations|conclusion|findings|randomized|sample)\b/.test(lower) ? 2 : 0);
      chunks.push({ text: piece, page: page.page, score, position });
    }
  }
  const picked = chunks.sort((a,b) => b.score - a.score || a.position - b.position).slice(0, 4);
  return picked.map((p,i) => ({ id: 'p' + (i + 1), text: p.text, ...(p.page ? { page: p.page } : {}) }));
}
export function parseSourceHtml(html: string) {
  const { document } = parseHTML(html);
  const doi = document.querySelector('meta[name="citation_doi"]')?.getAttribute('content')?.slice(0, 250);
  document.querySelectorAll('script,style,noscript,iframe,form,nav,footer,header,svg').forEach(n => n.remove());
  const abstract = document.querySelector('#abstract,.abstract,section[aria-label="Abstract"]');
  const article = new Readability(document as unknown as Document, { charThreshold: 200, maxElemsToParse: 20000 }).parse();
  let text = clean(article?.textContent || document.body?.textContent || '');
  const abstractOnly = !!abstract && text.length < 3500;
  if (abstractOnly) text = clean(abstract.textContent || text);
  if (text.length < 250 || (text.length < 2500 && /access denied|verify you are human|checking your browser|enable javascript|sign in to access|subscribe to read/i.test(text))) throw Error('Only a gate or insufficient article text was available.');
  return { text: text.slice(0, 100000), truncated: text.length > 100000, abstractOnly, doi };
}
export function serviceReading(source: NormalizedEvidence, question: string): SourceReading | null {
  if (!source.original_text || source.original_text.length < 350) return null;
  const raw = source.original_text;
  let text: string, abstractOnly = /(^|\.)(pubmed\.ncbi\.nlm\.nih\.gov|semanticscholar\.org)$/.test(source.domain);
  try { safeSourceUrl(source.original_url); if (/^\s*<(?:!doctype|html|article)/i.test(raw)) { const parsed = parseSourceHtml(raw); text = parsed.text; abstractOnly ||= parsed.abstractOnly; } else text = clean(raw); }
  catch { return null; }
  if (text.length < 350 || (text.length < 2500 && /access denied|verify you are human|checking your browser|enable javascript|sign in to access|subscribe to read/i.test(text))) return null;
  let doi: string | undefined; try { doi = decodeURIComponent(source.original_url).match(/10\.\d{4,9}\/[A-Za-z0-9._-]+/)?.[0]; } catch { /* Unknown identifier. */ }
  return { source_ref: source.source_ref, title: source.title, url: source.original_url, domain: source.domain, published_at: source.published_at, doi, access: abstractOnly ? 'abstract_only' : 'page_text',
    passages: readingPassages([{ text }], question), note: 'Selected original-document text supplied by the search service; its cache age and PDF page numbers are unavailable. Not an exhaustive reading.', read_at: new Date().toISOString(), content_hash: createHash('sha256').update(text).digest('hex'), truncated: raw.length >= 100000 };
}
export async function readSource(source: NormalizedEvidence, question: string): Promise<SourceReading> {
  const cached = cache.get(source.canonical_url);
  if (cached && cached.until > Date.now()) return { ...cached.reading, source_ref: source.source_ref, passages: readingPassages(cached.text, question), reused: true };
  const extracted = serviceReading(source, question);
  if (extracted) { if (cache.size >= 40) cache.delete(cache.keys().next().value!); const raw = source.original_text!; const text = /^\s*<(?:!doctype|html|article)/i.test(raw) ? parseSourceHtml(raw).text : clean(raw); cache.set(source.canonical_url, { until: Date.now() + 30 * 60000, reading: extracted, text: [{ text }] }); return extracted; }
  if (source.reading?.access !== 'search_excerpt' && source.reading?.passages.length && Date.now() - Date.parse(source.reading.read_at) < 30 * 60000) return { ...source.reading, source_ref: source.source_ref, reused: true };
  const reading: SourceReading = { source_ref: source.source_ref, title: source.title, url: source.original_url, domain: source.domain, published_at: source.published_at,
    access: 'search_excerpt', passages: [{ id: 'p1', text: clean(source.snippet) }], note: 'Only the search excerpt was available; the original source was not read.', read_at: new Date().toISOString(), content_hash: '', truncated: false };
  try {
    const result = await publicSourceBytes(source.original_url, AbortSignal.timeout(18000));
    let pages: { text: string; page?: number }[];
    if (result.type.includes('pdf')) {
      if (process.env.FIELDWORK_CLOUDFLARE === 'true') {
        // Text extraction needs geometry and the in-process PDF worker, not a
        // browser Worker, filesystem import or native canvas rendering library.
        if (!globalThis.DOMMatrix) {
          const { default: Matrix } = await import('@thednp/dommatrix');
          Object.assign(globalThis, { DOMMatrix: Matrix });
        }
        // @ts-expect-error PDF.js ships this worker entry without declarations.
        const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
        Object.assign(globalThis, { pdfjsWorker: { WorkerMessageHandler: worker.WorkerMessageHandler } });
      }
      const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const task = pdf.getDocument({ data: new Uint8Array(result.bytes), useSystemFonts: true, disableFontFace: true });
      const timeout = setTimeout(() => { void task.destroy(); }, 12000);
      try { const doc = await task.promise; reading.page_count = doc.numPages; reading.pages_read = Math.min(15, doc.numPages); reading.truncated = doc.numPages > 15; pages = [];
        for(let page = 1; page <= reading.pages_read; page++) { const content = await (await doc.getPage(page)).getTextContent(); pages.push({ page, text: clean(content.items.map(item => 'str' in item ? item.str : '').join(' ')).slice(0, 10000) }); }
        if (pages.reduce((sum,p) => sum + p.text.length,0) < 250) throw Error('No readable PDF text.');
        reading.access = 'pdf_text'; reading.note = `Selected passages from ${reading.pages_read} of ${doc.numPages} PDF pages; not an exhaustive reading.`;
      } finally { clearTimeout(timeout); await task.destroy(); }
    } else if (result.type.includes('html')) {
      const parsed = parseSourceHtml(result.bytes.toString('utf8')); pages = [{ text: parsed.text }]; reading.truncated = parsed.truncated; reading.doi = parsed.doi;
      reading.access = parsed.abstractOnly ? 'abstract_only' : 'page_text'; reading.note = parsed.abstractOnly ? 'Only the available abstract was read.' : 'Selected passages from the original page; not an exhaustive reading.';
    } else { pages = [{ text: clean(result.bytes.toString('utf8')).slice(0, 100000) }]; reading.access = 'page_text'; reading.truncated = result.bytes.length > 100000; reading.note = 'Selected passages from the original text document.'; }
    reading.url = result.url; reading.passages = readingPassages(pages!, question);
    if (!reading.passages.length) throw Error('No usable source passages.');
    reading.content_hash = createHash('sha256').update(JSON.stringify(pages!)).digest('hex');
    if (cache.size >= 40) cache.delete(cache.keys().next().value!);
    cache.set(source.canonical_url, { until: Date.now() + 30 * 60000, reading, text: pages! });
  } catch { reading.access = 'search_excerpt'; reading.passages = [{ id: 'p1', text: clean(source.snippet) }]; reading.content_hash = ''; reading.truncated = false; delete reading.page_count; delete reading.pages_read; delete reading.doi; reading.note = 'The original could not be read (access, network, format or size limit). Only the search excerpt was used.'; }
  return reading;
}
export async function readEvidence(evidence: NormalizedEvidence[], focus: string, maxReads = 3, onRead?: (source: NormalizedEvidence) => Promise<void>) {
  let attempted = 0;
  const priority = (s: NormalizedEvidence) => (/doi\.org|journals\.plos\.org|pmc\.ncbi\.nlm\.nih\.gov|arxiv\.org/.test(s.domain) ? 4 : 0) + (/\.pdf(?:[?#]|$)/i.test(s.original_url) ? 3 : 0) + (s.original_text ? 2 : 0);
  for (const source of [...evidence].sort((a,b) => priority(b) - priority(a))) {
    if (source.reading?.access !== 'search_excerpt' && source.reading?.passages.length) { source.reading = await readSource(source, focus); source.reading.reused = true; continue; }
    if (attempted < maxReads) { attempted++; source.reading = await readSource(source, focus); await onRead?.(source); }
    else source.reading = { source_ref: source.source_ref, title: source.title, url: source.original_url, domain: source.domain, published_at: source.published_at, access: 'search_excerpt', passages: [{ id: 'p1', text: source.snippet }], note: 'Search excerpt only; original-page reading limit reached.', read_at: new Date().toISOString(), content_hash: '', truncated: false };
  }
  return evidence;
}
