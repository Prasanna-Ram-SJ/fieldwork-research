import { createHash } from 'node:crypto';
import { newProject, type Paper, type PaperPage, type StudentProject } from './types';
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function safeLink(value: unknown) {
  try { const u = new URL(String(value)); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; }
  catch { return ''; }
}
export function normalizeDoi(value: unknown) {
  const doi = text(value, 250).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : '';
}
export function validatePaper(raw: any): Paper {
  if (!raw || typeof raw !== 'object') throw Error('Invalid paper.');
  const title = text(raw.title, 700);
  if (!title) throw Error('Each paper needs a title.');
  let remaining = 90000;
  let truncated = Array.isArray(raw.textPages) && raw.textPages.length > 120;
  const seen = new Set<number>();
  const textPages: PaperPage[] = (Array.isArray(raw.textPages) ? raw.textPages : []).slice(0, 120).map((page: any) => {
    const number = Number(page?.number);
    if (!Number.isInteger(number) || number < 1 || number > 10000 || seen.has(number)) throw Error('Invalid paper page number.');
    seen.add(number);
    const content = text(page.text, Math.min(15000, remaining));
    if (typeof page.text === 'string' && page.text.trim().length > content.length) truncated = true;
    remaining -= content.length;
    return { number, text: content };
  }).filter((page: { text: string }) => page.text);
  const contentHash = createHash('sha256').update(JSON.stringify(textPages)).digest('hex');
  const year = Number(raw.year);
  const doi = normalizeDoi(raw.doi);
  const authors = (Array.isArray(raw.authors) ? raw.authors : []).slice(0, 80).map((a: any) => ({ given: text(a?.given, 120), family: text(a?.family, 150), literal: text(a?.literal, 200) })).filter((a: any) => a.family || a.literal);
  const scope = ['full_text', 'partial_text', 'abstract_only', 'metadata_only'].includes(raw.textScope) ? raw.textScope : 'metadata_only';
  return { id: text(raw.id, 100) || crypto.randomUUID(), title, authors, year: Number.isInteger(year) && year > 1500 && year < 2200 ? year : null,
    doi, url: safeLink(raw.url), journal: text(raw.journal, 350), volume: text(raw.volume, 30), issue: text(raw.issue, 30), pages: text(raw.pages, 60),
    metadataSource: raw.metadataSource === 'Crossref' && doi ? 'Crossref' : 'manual',
    textScope: textPages.length ? truncated || scope === 'metadata_only' ? 'partial_text' : scope : 'metadata_only',
    textPages, contentHash, fileHash: text(raw.fileHash, 64), fileName: text(raw.fileName, 250), notes: text(raw.notes, 10000),
    tags: (Array.isArray(raw.tags) ? raw.tags : []).slice(0, 8).map((s: unknown) => text(s, 50)).filter(Boolean) };
}
export function validateProject(raw: any, previous?: StudentProject): StudentProject {
  if (!raw || typeof raw !== 'object') throw Error('Invalid project.');
  const papers: Paper[] = (Array.isArray(raw.papers) ? raw.papers : []).slice(0, 12).map(validatePaper);
  if (new Set(papers.map(p => p.id)).size !== papers.length) throw Error('Duplicate paper identifiers.');
  if (papers.reduce((n, p) => n + p.textPages.reduce((s, page) => s + page.text.length, 0), 0) > 500000) throw Error('This project exceeds its 500,000-character reading capacity. Remove a paper or create another project.');
  const project: StudentProject = { ...newProject(), id: previous?.id || '', revision: previous?.revision || 0,
    title: text(raw.title, 180) || 'Untitled research project', brief: text(raw.brief, 10000), rubric: text(raw.rubric, 8000), question: text(raw.question, 1500),
    minimumSources: Math.max(1, Math.min(12, Math.floor(Number(raw.minimumSources) || 5))),
    fromYear: /^\d{4}$/.test(String(raw.fromYear)) ? String(raw.fromYear) : '', toYear: /^\d{4}$/.test(String(raw.toYear)) ? String(raw.toYear) : '',
    citationStyle: raw.citationStyle === 'mla' ? 'mla' : 'apa', papers, notes: text(raw.notes, 30000), draft: text(raw.draft, 12000),
    analyses: previous?.analyses || [], updatedAt: new Date().toISOString() };
  if (project.fromYear && project.toYear && project.fromYear > project.toYear) throw Error('The start year must not be later than the end year.');
  return project;
}
