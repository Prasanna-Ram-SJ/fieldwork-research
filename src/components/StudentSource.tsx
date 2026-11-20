"use client";
import { useEffect, useState } from 'react';
import { PanelDialog } from './PanelDialog';
import { readOriginal } from '@/lib/student/local-files';
import type { Paper, Passage } from '@/lib/student/types';
const demoPdfs: Record<string, string> = { 'demo-eysenbach-2006': '/demo/eysenbach-2006.pdf', 'demo-langham-2021': '/demo/langham-putrow-2021.pdf' };
export function paperLink(paper: Paper) {
  const value = paper.url || (paper.doi ? 'https://doi.org/' + encodeURIComponent(paper.doi) : '');
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function SourceButtons({ evidence, papers, onOpen }: { evidence: Passage[]; papers: Paper[]; onOpen: (passage: Passage) => void }) {
  return <span className="student-citations">{evidence.map((e, i) => {
    const paper = papers.find(p => p.id === e.paperId);
    return <button type="button" key={i} onClick={() => onOpen(e)} title={paper?.title}>{paper?.textScope === 'abstract_only' ? 'Abstract' : 'p. ' + e.page} · {papers.findIndex(p => p.id === e.paperId) + 1}</button>;
  })}</span>;
}
export function StudentSource({ passage, papers, accountId, onClose, onNavigate }: { passage: Passage | null; papers: Paper[]; accountId: string; onClose: () => void; onNavigate: (passage: Passage) => void }) {
  const paper = papers.find(p => p.id === passage?.paperId), [original, setOriginal] = useState('');
  useEffect(() => {
    let active = true, url = '';
    setOriginal('');
    if (paper?.fileHash) void readOriginal(accountId, paper.fileHash).then(file => {
      if (active && file) { url = URL.createObjectURL(file); setOriginal(url); }
    }).catch(() => {});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [accountId, paper?.fileHash]);
  const normalize = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
  const text = normalize(paper?.textPages.find(p => p.number === passage?.page)?.text || '');
  const quote = normalize(passage?.quote || ''), index = text.indexOf(quote);
  return <PanelDialog open={!!passage} onClose={onClose} title={paper?.title || 'Source passage'}>
    {paper && passage && <div className="student-source">
      {paper.textPages.length > 1 && <label>Read another page <select value={passage.page} onChange={e => onNavigate({ paperId: paper.id, page: Number(e.target.value), quote: '' })}>{paper.textPages.map(page => <option key={page.number} value={page.number}>Page {page.number}</option>)}</select></label>}
      <p className="student-muted">{paper.textScope === 'abstract_only' ? 'Abstract from the publication record; PDF page numbers are unavailable.' : 'Page ' + passage.page + ' · Extracted PDF text'}</p>
      {quote && <blockquote>{quote}</blockquote>}
      <details open={!quote}><summary>Read the available page</summary><p className="student-source-page">{quote && index >= 0 ? <>{text.slice(0, index)}<mark>{text.slice(index, index + quote.length)}</mark>{text.slice(index + quote.length)}</> : text || 'This page is no longer available in the project.'}</p></details>
      <div className="student-actions">
        {(original || (paper && demoPdfs[paper.id])) && <a className="ink-button" href={(original || demoPdfs[paper.id]) + '#page=' + passage.page} target="_blank" rel="noopener noreferrer">Open original PDF</a>}
        {paperLink(paper) && <a className="text-button" href={paperLink(paper)} target="_blank" rel="noopener noreferrer">Publication page ↗</a>}
      </div>
      {!original && paper.fileHash && <p className="student-muted">The original PDF stays in the browser where it was uploaded. Re-upload the same file here to open it; its extracted text is kept with this project.</p>}
    </div>}
  </PanelDialog>;
}
