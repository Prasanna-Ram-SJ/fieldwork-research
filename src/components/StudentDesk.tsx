"use client";
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Search, Upload, ArrowRight, Trash2, Download, Check, Loader2, FileText } from 'lucide-react';
import { useResearch } from './ResearchProvider';
import { StudentSource, SourceButtons, paperLink } from './StudentSource';
import { FIELDS, inputBasis, newProject, type Analysis, type Paper, type Passage, type StudentAction, type StudentProject } from '@/lib/student/types';
import { saveOriginal } from '@/lib/student/local-files';
import { bibtex, ris, evidenceCsv, projectMarkdown, formattedBibliography, downloadText, cslItem } from '@/lib/student/exports';
import { guestProjects, saveGuest, deleteGuest } from '@/lib/student/guest-store';
import { JudgeAccess, lockedJudge } from './JudgeAccess';

type Tab = 'Brief' | 'Papers' | 'Evidence' | 'Read' | 'Draft' | 'Notes' | 'Export';
type ProjectSummary = { id: string; title: string; question: string; papers: number; updatedAt: string };
const TAB_LABELS: Record<Tab, string> = { Brief: 'Assignment', Papers: 'Add papers', Evidence: 'Compare papers', Read: 'Ask your papers', Draft: 'Check your draft', Notes: 'Notes', Export: 'Export' };
const scopeLabel = (p: Paper) => ({ full_text: 'Full text extracted', partial_text: 'Partial text', abstract_only: 'Abstract only', metadata_only: 'Reference only' }[p.textScope]);
const isCurrent = (project: StudentProject, result: Analysis) => result.basis === inputBasis(project, result.action, result.paperIds, result.question);
async function responseJson(response: Response) { const data = await response.json(); if (!response.ok) throw Error(data.error || 'The request could not finish.'); return data; }
function Metadata({ paper, disabled, update, lookup }: { paper: Paper; disabled: boolean; update: (changes: Partial<Paper>) => void; lookup: () => void }) {
  return <details className="student-metadata"><summary>Edit reference, tags and reading notes</summary><div className="student-form-grid">
    <label className="student-wide">Title<input disabled={disabled} value={paper.title} onChange={e => update({ title: e.target.value, metadataSource: 'manual' })} /></label>
    <label className="student-wide">Authors (Family, Given; …)<input key={paper.authors.map(a => a.literal || a.family + ',' + a.given).join(';')} disabled={disabled} defaultValue={paper.authors.map(a => a.literal || [a.family, a.given].filter(Boolean).join(', ')).join('; ')} onBlur={e => update({ authors: e.target.value.split(';').filter(s => s.trim()).map(s => { const [family, ...given] = s.trim().split(','); return given.length ? { family: family.trim(), given: given.join(',').trim() } : { literal: family.trim() }; }), metadataSource: 'manual' })} /></label>
    <label>Year<input type="number" min="1501" max="2199" disabled={disabled} value={paper.year || ''} onChange={e => update({ year: Number(e.target.value) || null, metadataSource: 'manual' })} /></label>
    <label>Journal<input disabled={disabled} value={paper.journal} onChange={e => update({ journal: e.target.value, metadataSource: 'manual' })} /></label>
    <label className="student-wide">DOI<input disabled={disabled} value={paper.doi} onChange={e => update({ doi: e.target.value, metadataSource: 'manual' })} /></label>
    <div className="student-wide"><button type="button" disabled={disabled || !paper.doi} className="text-button" onClick={lookup}>Look up reference details in Crossref</button></div>
    <label>Volume<input disabled={disabled} value={paper.volume} onChange={e => update({ volume: e.target.value, metadataSource: 'manual' })} /></label>
    <label>Issue<input disabled={disabled} value={paper.issue} onChange={e => update({ issue: e.target.value, metadataSource: 'manual' })} /></label>
    <label>Page range<input disabled={disabled} value={paper.pages} onChange={e => update({ pages: e.target.value, metadataSource: 'manual' })} /></label>
    <label>Tags (separate with commas)<input key={paper.tags.join(',')} disabled={disabled} defaultValue={paper.tags.join(', ')} onBlur={e => update({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8) })} /></label>
    <label className="student-wide">Reading notes<textarea disabled={disabled} rows={4} maxLength={10000} value={paper.notes} onChange={e => update({ notes: e.target.value })} /></label>
  </div></details>;
}
export function StudentDesk({ localMode = false }: { localMode?: boolean } = {}) {
  const account = useResearch(), accountId = localMode ? 'guest-browser' : account.user?.id || '';
  const [judge, setJudge] = useState(lockedJudge);
  const [examplePrepared, setExamplePrepared] = useState(false);
  const activeAccount = useRef(accountId);
  const [projects, setProjects] = useState<ProjectSummary[]>([]), [project, setProject] = useState<StudentProject | null>(null);
  const [tab, setTab] = useState<Tab>('Brief'), [busy, setBusy] = useState(''), [saving, setSaving] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(true);
  const [projectQuery, setProjectQuery] = useState(''), [paperQuery, setPaperQuery] = useState(''), [results, setResults] = useState<Paper[]>([]);
  const [moreProjects, setMoreProjects] = useState(false), [showProjectSearch, setShowProjectSearch] = useState(false);
  const queryRef = useRef(''), projectsCount = useRef(0), queryRequest = useRef(0);
  const [selected, setSelected] = useState<string[]>([]), [question, setQuestion] = useState(''), [tag, setTag] = useState('');
  const [readAnswerKey, setReadAnswerKey] = useState('');
  const [passage, setPassage] = useState<Passage | null>(null), [references, setReferences] = useState<string[]>([]), [referenceError, setReferenceError] = useState('');
  const [referenceBasisDone, setReferenceBasisDone] = useState('');
  const referenceBasis = project ? JSON.stringify([project.citationStyle, project.papers.map(cslItem)]) : '';
  const projectRef = useRef<StudentProject | null>(null), sequence = useRef(0), savedSequence = useRef(-1), pendingSave = useRef<Promise<StudentProject> | null>(null), alive = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const uploadTarget = useRef<string | null>(null);
  const replace = useCallback((next: StudentProject | null) => { projectRef.current = next; setProject(next); }, []);
  const refresh = useCallback(async (append = false) => {
    const version = ++queryRequest.current;
    const query = queryRef.current;
    if (localMode) { const all = guestProjects().filter(p => p.title.toLowerCase().includes(query.toLowerCase())); setProjects(all.map(p => ({ id: p.id, title: p.title, question: p.question, papers: p.papers.length, updatedAt: p.updatedAt }))); setMoreProjects(false); return; }
    const data = await responseJson(await fetch('/api/student/projects?q=' + encodeURIComponent(query) + '&offset=' + (append ? projectsCount.current : 0)));
    if (alive.current && version === queryRequest.current && query === queryRef.current) { setProjects(previous => append ? [...previous, ...data.projects] : data.projects); setMoreProjects(!!data.more); }
  }, [localMode]);
  queryRef.current = projectQuery; projectsCount.current = projects.length;
  const change = (changes: Partial<StudentProject>) => {
    const previous = projectRef.current;
    if (!previous) return;
    const next = { ...previous, ...changes }; sequence.current++; replace(next); setDirty(true); setError('');
    try { localStorage.setItem('fieldwork-project-draft:' + accountId, JSON.stringify(next)); } catch { /* Server save remains available if browser storage is full. */ }
  };
  const save = useCallback(async (): Promise<StudentProject> => {
    if (pendingSave.current) { await pendingSave.current; return save(); }
    const snapshot = projectRef.current;
    if (!snapshot) throw Error('Open a project first.');
    if (snapshot.id && savedSequence.current === sequence.current) return snapshot;
    const version = sequence.current;
    setSaving(true);
    const task = (async () => {
      let saved: StudentProject;
      if (localMode) { saved = saveGuest(snapshot); const url = new URL(location.href); url.search = ''; url.searchParams.set('project', saved.id); history.replaceState(history.state, '', url); }
      else { const response = await fetch('/api/student/projects' + (snapshot.id ? '/' + snapshot.id : ''), { method: snapshot.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) }); saved = (await responseJson(response)).project; }
      if (alive.current && activeAccount.current === accountId && projectRef.current?.id === snapshot.id) {
        savedSequence.current = version;
        if (sequence.current === version) { replace(saved); setDirty(false); try { localStorage.removeItem('fieldwork-project-draft:' + accountId); } catch { /* Account save succeeded. */ } }
        else { replace({ ...projectRef.current, id: saved.id, revision: saved.revision, analyses: saved.analyses }); }
        void refresh().catch(() => {});
      }
      return saved;
    })();
    pendingSave.current = task;
    try { return await task; } finally { pendingSave.current = null; if (alive.current) setSaving(false); }
  }, [accountId, refresh, replace, localMode]);
  useEffect(() => {
    alive.current = true;
    activeAccount.current = accountId;
    queryRequest.current++; queryRef.current = '';
    replace(null); setProjects([]); setDirty(false); setSelected([]); setResults([]); setPassage(null); setReferences([]); setReferenceBasisDone(''); setQuestion(''); setReadAnswerKey(''); setProjectQuery(''); setError('');
    sequence.current++; savedSequence.current = -1;
    if (!accountId) { setLoading(false); return () => { alive.current = false; }; }
    setLoading(true);
    void refresh().catch(e => setError(e.message)).finally(() => setLoading(false));
    if (localMode) {
      const params = new URLSearchParams(location.search), savedId = params.get('project'), loadVersion = sequence.current;
      if (savedId) { try { const saved = guestProjects().find(p => p.id === savedId); if (!saved) throw Error('That browser project is no longer available. Choose another project or start an assignment.'); replace(saved); setExamplePrepared(saved.papers.some(p => p.id.startsWith('demo-')) && saved.analyses.some(a => a.key.startsWith('prepared-'))); setSelected(saved.papers.slice(0, 3).map(p => p.id)); } catch (e) { setError((e as Error).message); } }
      else if (params.get('start') === 'blank') { replace(newProject()); sequence.current++; setDirty(true); setTab('Brief'); }
      else void import('@/lib/student/demo').then(m => m.preparedProject()).then(p => { if (alive.current && sequence.current === loadVersion) { replace(p); setExamplePrepared(true); setSelected(p.papers.map(source => source.id)); setQuestion('Does open access guarantee more citations?'); setTab('Evidence'); } }).catch(e => { if (alive.current) setError(e.message); });
      return () => { alive.current = false; };
    }
    try { const value = localStorage.getItem('fieldwork-project-draft:' + accountId); if (value) {
      const recovered = JSON.parse(value); if (recovered?.title && Array.isArray(recovered.papers)) { replace(recovered); setDirty(true); setNotice('Recovered unsaved work from this browser.'); }
    } } catch { /* Ignore a malformed local recovery copy. */ }
    return () => { alive.current = false; };
  }, [accountId, refresh, replace, localMode]);
  useEffect(() => { paneRef.current?.scrollTo({ top: 0 }); }, [tab]);
  useEffect(() => {
    if (!accountId) return;
    const timer = setTimeout(() => { void refresh().catch(e => setError(e.message)); }, 300);
    return () => clearTimeout(timer);
  }, [projectQuery, accountId, refresh]);
  useEffect(() => {
    if (!dirty || !project || !accountId || busy || saving || error) return;
    const timer = setTimeout(() => { void save().catch(e => setError(e.message)); }, 1200);
    return () => clearTimeout(timer);
  }, [project, dirty, accountId, busy, saving, error, save]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    addEventListener('beforeunload', warn); return () => removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    let current = true;
    setReferenceError('');
    setReferences([]); setReferenceBasisDone('');
    if (project && tab === 'Export') void formattedBibliography(project.papers, project.citationStyle).then(value => { if (current) { setReferences(value); setReferenceBasisDone(referenceBasis); } }).catch(e => { if (current) setReferenceError(e.message); });
    return () => { current = false; };
  }, [referenceBasis, tab]);
  async function create() {
    setBusy('Creating project'); setError('');
    try { if (dirty) await save(); paneRef.current?.scrollTo({ top: 0 }); replace(newProject()); sequence.current++; setDirty(true); setExamplePrepared(false); setSelected([]); setResults([]); setTab('Brief'); await save(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function open(id: string) {
    setBusy('Opening project'); setError('');
    try { if (dirty) await save(); const opened: StudentProject = localMode ? guestProjects().find(p => p.id === id)! : (await responseJson(await fetch('/api/student/projects/' + id))).project; if (!opened) throw Error('That browser project is no longer available.'); paneRef.current?.scrollTo({ top: 0 }); replace(opened); setExamplePrepared(opened.papers.some(p => p.id.startsWith('demo-')) && opened.analyses.some(a => a.key.startsWith('prepared-'))); if (localMode) { const url = new URL(location.href); url.search = ''; url.searchParams.set('project', opened.id); history.replaceState(history.state, '', url); } sequence.current++; setDirty(false); setSelected(opened.papers.slice(0, 3).map((p: Paper) => p.id)); setResults([]); setQuestion(''); setTab('Brief'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function reloadSaved() {
    const current = projectRef.current;
    if (!current?.id || (dirty && !confirm('Discard unsaved local edits and load the version saved to your account? You can export a backup first.'))) return;
    setBusy('Reloading saved project');
    try {
      const data = localMode ? { project: guestProjects().find(p => p.id === current.id) } : await responseJson(await fetch('/api/student/projects/' + current.id));
      if (!data.project) throw Error('No saved browser version exists. Export the open work before leaving.');
      replace(data.project); sequence.current++; savedSequence.current = sequence.current;
      setDirty(false); setError('');
      try { localStorage.removeItem('fieldwork-project-draft:' + accountId); } catch { /* Browser recovery storage may be unavailable. */ }
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function run(action: StudentAction, prompt = question) {
    setBusy({ plan: 'Planning your assignment', extract: 'Reading the selected papers', ask: 'Checking the paper passages', audit: 'Checking your draft against the evidence', review: 'Comparing the selected studies' }[action]); setError('');
    try {
      const saved = await save(), ids = action === 'plan' ? [] : selected.filter(id => saved.papers.some(p => p.id === id)).slice(0, action === 'extract' ? 3 : 12);
      if (!alive.current || activeAccount.current !== accountId) return;
      if (localMode) {
        const basis = inputBasis(saved, action, ids, action === 'ask' ? prompt : '');
        const cached = saved.analyses.find(a => a.basis === basis);
        if (cached) { if (action === 'ask') setReadAnswerKey(cached.key); setNotice('Opened a prepared or saved result. No live AI request.'); return; }
        if (!judge.unlocked || judge.remaining < 1) throw Error('A new AI analysis needs a judge code with remaining actions, or sign-in. You can still add papers, write notes and export locally. Explore the example for prepared results.');
        if (!confirm('Run a new live analysis? This spends one action from the shared judge allowance. Failed attempts also count.')) return;
        try {
          const data = await responseJson(await fetch('/api/judge/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'student', requestId: crypto.randomUUID(), project: saved, action, paperIds: ids, question: action === 'ask' ? prompt : '' }) }));
          change({ analyses: [...saved.analyses, data.analysis].slice(-18) });
          if (action === 'ask') setReadAnswerKey(data.analysis.key);
          await save(); setNotice('Live result saved in this browser.');
        } finally { window.dispatchEvent(new Event('fieldwork-judge-update')); }
        return;
      }
      const data = await responseJson(await fetch('/api/student/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: saved.id, action, paperIds: ids, question: action === 'ask' ? prompt : '' }) }));
      if (!alive.current || activeAccount.current !== accountId || projectRef.current?.id !== saved.id) return;
      replace(data.project); setDirty(false); try { localStorage.removeItem('fieldwork-project-draft:' + accountId); } catch { /* Account save succeeded. */ }
      if (action === 'ask') setReadAnswerKey(data.analysis.key);
      setNotice(data.cached ? 'Reopened saved analysis. No new model request.' : 'Analysis saved with its source passages.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function discover(doi?: string, mergeId?: string) {
    setBusy('Looking up scholarly records'); setError('');
    try {
      const p = projectRef.current!;
      const url = '/api/student/discover?q=' + encodeURIComponent(doi || paperQuery) + '&from=' + p.fromYear + '&to=' + p.toYear;
      const data = await responseJson(await fetch(url));
      if (!alive.current || activeAccount.current !== accountId || projectRef.current?.id !== p.id) return;
      if (mergeId && data.papers[0]) {
        const old = p.papers.find(source => source.id === mergeId)!;
        const metadata = data.papers[0];
        change({ papers: p.papers.map(source => source.id === mergeId ? { ...source, ...metadata, id: source.id, textPages: old.textPages.length && old.textScope !== 'abstract_only' ? old.textPages : metadata.textPages, contentHash: old.textPages.length && old.textScope !== 'abstract_only' ? old.contentHash : metadata.contentHash, textScope: old.textPages.length && old.textScope !== 'abstract_only' ? old.textScope : metadata.textScope, fileHash: old.fileHash, fileName: old.fileName, notes: old.notes, tags: old.tags } : source) });
        setNotice('Publication details attached to your paper.');
      } else setResults(data.papers);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy('Reading PDF text'); setError('');
    try {
      const { readPaperPdf } = await import('@/lib/student/pdf');
      let current = projectRef.current!, papers = [...current.papers], added: string[] = [];
      for (const file of Array.from(files).slice(0, uploadTarget.current ? 1 : 12)) {
        const paper = await readPaperPdf(file, (page, total) => { if (alive.current && activeAccount.current === accountId) setBusy('Reading ' + file.name + ' · page ' + page + ' of ' + total); });
        if (!alive.current || activeAccount.current !== accountId || projectRef.current?.id !== current.id) return;
        const duplicate = papers.find(p => uploadTarget.current ? p.id === uploadTarget.current : p.fileHash === paper.fileHash);
        if (duplicate) {
          papers = papers.map(p => p.id === duplicate.id ? { ...p, textPages: paper.textPages, contentHash: paper.contentHash, fileHash: paper.fileHash, fileName: paper.fileName, textScope: paper.textScope } : p);
          added.push(duplicate.id);
        } else { if (papers.length >= 12) throw Error('This project already holds twelve papers. Attach a PDF to an existing paper or create another project.'); papers.push(paper); added.push(paper.id); }
        if (papers.reduce((sum, p) => sum + p.textPages.reduce((n, page) => n + page.text.length, 0), 0) > 500000) throw Error('This project holds up to 500,000 extracted text characters. Remove a paper or start another project.');
        try { await saveOriginal(accountId, paper.fileHash!, file); } catch { setNotice('Paper text is available, but this browser could not cache the original PDF.'); }
        change({ papers }); setSelected([...added].slice(0, 3));
      }
      if (!added.length) throw Error('A project holds up to twelve papers. Remove one or create another project.');
      change({ papers }); setSelected(added.slice(0, 3));
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); uploadTarget.current = null; if (fileInput.current) fileInput.current.value = ''; }
  }
  const updatePaper = (id: string, patch: Partial<Paper>) => change({ papers: projectRef.current!.papers.map(p => p.id === id ? { ...p, ...patch } : p) });
  const currentResults = project?.analyses.filter(a => isCurrent(project, a)) || [];
  const last = (action: StudentAction) => currentResults.filter(a => a.action === action).at(-1);
  const savedQuestions = currentResults.filter(a => a.action === 'ask');
  const readAnswer = savedQuestions.find(a => a.key === readAnswerKey) || last('ask');
  const plan = last('plan')?.output.plan, audit = last('audit')?.output;
  const hasLiveGuestResult = localMode && project?.analyses.some(a => !a.key.startsWith('prepared-'));
  const visiblePapers = project?.papers.filter(p => !tag || p.tags.includes(tag)) || [];
  const selectedPapers = project?.papers.filter(p => selected.includes(p.id)) || [];
  const cachedAction = (action: StudentAction) => {
    if (!project) return undefined;
    const ids = action === 'plan' ? [] : selected.filter(id => project.papers.some(p => p.id === id)).slice(0, action === 'extract' ? 3 : 12);
    const basis = inputBasis(project, action, ids, action === 'ask' ? question : '');
    return project.analyses.find(a => a.basis === basis);
  };
  const canRun = (action: StudentAction) => !localMode || !!cachedAction(action) || (judge.unlocked && judge.remaining > 0);
  const actionLabel = (action: StudentAction, label: string) => { const result = cachedAction(action); return localMode && result ? (result.key.startsWith('prepared-') ? 'Open prepared ' : 'Open saved ') + ({ plan: 'plan', extract: 'comparison', ask: 'answer', audit: 'draft check', review: 'thematic comparison' }[action]) : label + (localMode ? ' · 1 live action' : ''); };
  const referencesReady = referenceBasisDone === referenceBasis && !referenceError && references.length === (project?.papers.length || 0);
  if (activeAccount.current !== accountId) return <main id="main-content" className="student-page"><p role="status">Opening your desk…</p></main>;
  const exportFile = (format: string) => {
    if (!project) return;
    const name = project.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 70) || 'fieldwork';
    if (format === 'bib') downloadText(name + '.bib', bibtex(project.papers));
    if (format === 'ris') downloadText(name + '.ris', ris(project.papers));
    if (format === 'csv') downloadText(name + '-evidence.csv', evidenceCsv(project), 'text/csv;charset=utf-8');
    if (format === 'json') downloadText(name + '.json', JSON.stringify({ schema: 'fieldwork-project-v1', project }, null, 2), 'application/json');
    if (format === 'csl') downloadText(name + '-references.json', JSON.stringify(project.papers.map(cslItem), null, 2), 'application/json');
    if (format === 'md') downloadText(name + '.md', projectMarkdown(project, references), 'text/markdown;charset=utf-8');
  };
  function paperSelection() { return <div className="student-selection"><span>{selected.length} selected</span>{project!.papers.map((p, i) => <label key={p.id} title={p.title}><input type="checkbox" disabled={!!busy} checked={selected.includes(p.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} />{i + 1}. {p.title}</label>)}</div>; }
  function outputBlocks(analysis: Analysis | undefined) { return analysis && <div className="student-reading">{localMode && <p className="student-muted">{analysis.key.startsWith('prepared-') ? 'Prepared result · written in advance, no new AI request' : 'Saved live AI result · check the linked evidence'}</p>}{analysis.action === 'ask' && analysis.question && <h2>{analysis.question}</h2>}{analysis.output.blocks?.map((b, i) => <section key={i}><p>{b.text}</p><SourceButtons evidence={b.evidence} papers={project!.papers} onOpen={setPassage} /></section>)}{analysis.output.gaps?.length ? <aside className="student-caveat"><strong>What this evidence cannot establish</strong><ul>{analysis.output.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></aside> : null}</div>; }
  if (!localMode && !account.user && account.authReady !== false) return <main id="main-content" className="student-page student-signed-out"><h1>Your research desk.</h1><p>Sign in to save assignments, papers, evidence and notes together, or explore without an account.</p><Link href="/demo" className="ink-button">Try without signing in <ArrowRight size={16} /></Link><Link href="/login" className="text-button">Sign in / Sign up</Link></main>;
  return <main id="main-content" className="student-page">
    <aside className="student-index"><div className="student-index-title"><h2>{localMode ? 'Browser projects' : 'Your projects'}</h2><button type="button" className="icon-button" disabled={!!busy || saving} onClick={() => void create()} aria-label="New research project"><Plus size={18} /></button></div><label className="student-project-search"><Search size={15} /><input aria-label="Find a project" placeholder="Find a project…" value={projectQuery} onChange={e => setProjectQuery(e.target.value)} /></label>
      <div className="student-project-list">{loading ? <p role="status">Opening your desk…</p> : projects.map(p => <button type="button" key={p.id} disabled={!!busy} aria-current={project?.id === p.id ? 'page' : undefined} onClick={() => void open(p.id)}><strong>{p.title}</strong><span>{p.papers} papers · {new Date(p.updatedAt).toLocaleDateString()}</span></button>)}{moreProjects && <button className="text-button" onClick={() => void refresh(true).catch(e => setError(e.message))}>Load more projects</button>}</div><Link className="text-button" href={localMode ? "/demo/research" : "/workspace"}>Open general research <ArrowRight size={14} /></Link>
    </aside>
    <div className="student-desk">
      <div className="student-mobile-projects"><label>Project<select disabled={!!busy} value={project?.id || ''} onChange={e => { if (e.target.value) void open(e.target.value); }}><option value="">{examplePrepared && !projects.some(p => p.id === project?.id) ? 'Prepared example' : 'Choose a project'}</option>{projects.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label><button className="text-button" disabled={!!busy} onClick={() => void create()}><Plus size={15} /> New</button><button type="button" className="icon-button" aria-label="Find saved projects" aria-expanded={showProjectSearch} onClick={() => setShowProjectSearch(value => !value)}><Search size={16} /></button>{showProjectSearch && <input aria-label="Find projects" placeholder="Find a saved project…" value={projectQuery} onChange={e => setProjectQuery(e.target.value)} />}</div>
      {project ? <><header className="student-heading"><div><label className="sr-only" htmlFor="student-project-title">Project title</label><input id="student-project-title" value={project.title} maxLength={180} disabled={!!busy} onChange={e => change({ title: e.target.value })} /><span className="student-save-status" role="status">{saving ? (localMode ? 'Saving in this browser…' : 'Saving to your account…') : dirty ? 'Unsaved changes' : localMode ? (examplePrepared && savedSequence.current < 0 ? 'Prepared example · edits save in this browser' : 'Saved in this browser') : 'Saved to your account'}</span></div><button type="button" className="text-button" disabled={!!busy || saving || !dirty} onClick={() => void save().catch(e => setError(e.message))}><Check size={15} /> Save</button></header>
      <nav className="student-steps" aria-label="Assignment stages">{(['Brief', 'Papers', 'Evidence'] as Tab[]).map((name, i) => <button type="button" key={name} aria-current={tab === name || (name === 'Evidence' && ['Read', 'Draft', 'Notes', 'Export'].includes(tab)) ? 'step' : undefined} onClick={() => setTab(name)}><span>{i + 1}</span>{['Set the assignment', 'Add papers', 'Explore evidence'][i]}</button>)}</nav>
      {['Evidence', 'Read', 'Draft', 'Notes', 'Export'].includes(tab) && <nav className="student-tabs" aria-label="Research tools">{(['Evidence', 'Read', 'Draft'] as Tab[]).map(name => <button type="button" key={name} aria-current={name === tab ? 'page' : undefined} onClick={() => setTab(name)}>{TAB_LABELS[name]}</button>)}</nav>}
      <div className="student-support-links"><button className="text-button" aria-current={tab === 'Notes' ? 'page' : undefined} onClick={() => setTab('Notes')}>Notes</button><button className="text-button" aria-current={tab === 'Export' ? 'page' : undefined} onClick={() => setTab('Export')}>Export</button><Link href="/demo/projects">Explore an example</Link></div>
      <div className="student-feedback" aria-live="polite">{busy && <span className="student-working"><Loader2 size={15} className="spin" /> {busy}…</span>}{error && <div><p role="alert" className="inline-error">{error}</p>{project.id && <button className="text-button" disabled={!!busy} onClick={() => void reloadSaved()}>Reload saved version</button>}</div>}{notice && <p>{notice}</p>}</div>
      <div ref={paneRef} className="student-pane" tabIndex={0} aria-label={TAB_LABELS[tab] + ' content'} aria-busy={!!busy}>
        {localMode && <aside className="student-guest-notice"><strong>{examplePrepared ? (hasLiveGuestResult ? 'Example papers · includes saved live results' : 'Prepared example · results written in advance') : 'Guest assignment · saved only in this browser'}</strong><details className="student-guest-help"><summary>How the demo and saving work</summary><p>{examplePrepared ? 'These are two real CC BY papers. The comparison, question and draft check were prepared in advance. Open a page citation to check the actual PDF.' : 'Add papers, edit your assignment, write notes and export without an account.'} Edits stay in this browser. Signing in does not transfer this draft; export a backup first. New AI analysis needs a judge code with remaining actions and asks for confirmation. Reopening unchanged saved results makes no paid request.</p>{examplePrepared && <a href="/demo/ATTRIBUTION.txt" target="_blank" rel="noopener noreferrer">Paper credits and preparation details</a>}<Link href="/login">Sign in for separate account projects</Link></details><JudgeAccess onChange={setJudge} /></aside>}
        {['Evidence', 'Read', 'Draft'].includes(tab) && !project.papers.some(p => p.textPages.length) && <div className="student-next-step"><p>Add a paper with readable text before using these tools. A reference record alone may not include the article.</p><button className="ink-button" onClick={() => setTab('Papers')}>Add your first paper <ArrowRight size={16} /></button></div>}
        {tab === 'Brief' && <section><h1>Begin with the assignment.</h1><p className="student-intro">Keep the question, requirements and evidence in one place. Confirm the scope before searching.</p><div className="student-form-grid">
          <label className="student-wide">Topic or assignment instructions<textarea rows={6} maxLength={10000} disabled={!!busy} placeholder="For example: Compare research on whether open access increases citations. Or paste your teacher’s instructions…" value={project.brief} onChange={e => change({ brief: e.target.value })} /></label>
          <details className="student-wide student-requirements"><summary>More requirements (optional)</summary><div className="student-form-grid"><label className="student-wide">Rubric or assessment criteria<textarea rows={4} maxLength={8000} disabled={!!busy} placeholder="What will you need to demonstrate?" value={project.rubric} onChange={e => change({ rubric: e.target.value })} /></label>
          <label className="student-wide">Research question<textarea rows={2} maxLength={1500} disabled={!!busy} value={project.question} onChange={e => change({ question: e.target.value })} /></label>
          <label>Paper target<input type="number" min="1" max="12" disabled={!!busy} value={project.minimumSources} onChange={e => change({ minimumSources: Number(e.target.value) })} /></label>
          <label>Citation style<select disabled={!!busy} value={project.citationStyle} onChange={e => change({ citationStyle: e.target.value as 'apa' | 'mla' })}><option value="apa">APA 7</option><option value="mla">MLA 9</option></select></label>
          <label>Publication from year<input type="number" min="1501" max="2199" placeholder="Any year" disabled={!!busy} value={project.fromYear} onChange={e => change({ fromYear: e.target.value })} /></label>
          <label>Through year<input type="number" min="1501" max="2199" placeholder="Any year" disabled={!!busy} value={project.toYear} onChange={e => change({ toYear: e.target.value })} /></label></div></details>
        </div><div className="student-actions"><button className="ink-button" disabled={!!busy || !project.brief.trim()} onClick={() => setTab('Papers')}>Continue to papers <ArrowRight size={16} /></button><button className="text-button" disabled={!!busy || !project.brief.trim() || !canRun('plan')} onClick={() => void run('plan')}>{actionLabel('plan', plan ? 'Open saved research plan' : 'Suggest a research plan')}</button></div><p className="student-muted">Planning is optional. You can add papers now. Generating a new plan uses {localMode ? 'one shared judge action' : 'one daily AI action'}; opening an unchanged saved plan does not.</p>
          {plan && <article className="student-plan"><h2>A proposed direction</h2><p>{plan.question}</p><button className="text-button" disabled={!!busy} onClick={() => change({ question: plan.question })}>Use this research question</button><h3>Questions to investigate</h3><ul>{plan.subquestions.map((q, i) => <li key={i}>{q}</li>)}</ul><h3>Assignment requirements</h3><ul>{plan.requirements.map((q, i) => <li key={i}>{q}</li>)}</ul><h3>Search ideas</h3>{plan.searches.map((q, i) => <button className="student-search-suggestion" key={i} onClick={() => { setPaperQuery(q); setTab('Papers'); }}>{q} <ArrowRight size={13} /></button>)}</article>}
          <div className="student-coverage"><h2>Your evidence so far</h2><p>{project.papers.length} of {project.minimumSources} papers in your target collected · {project.papers.filter(p => p.textScope === 'full_text').length} full texts · {project.papers.filter(p => p.textScope === 'abstract_only').length} abstracts.</p><p className="student-muted">Counts show collection coverage; they do not establish source quality or completion of the rubric.</p></div>
        </section>}
        {tab === 'Papers' && <section><h1>Build your reading collection.</h1><p className="student-intro">Find scholarly records by topic or DOI, or upload the PDFs you already have. Crossref supplies publication records; check their details before citing. A record does not establish peer review.</p><form className="student-discovery" onSubmit={e => { e.preventDefault(); void discover(); }}><input aria-label="Research topic or DOI" maxLength={250} value={paperQuery} onChange={e => setPaperQuery(e.target.value)} placeholder="Topic, paper title or 10.… DOI" disabled={!!busy} /><button className="ink-button" disabled={!!busy || paperQuery.trim().length < 3}><Search size={15} /> Find papers</button></form>
          <div className="student-actions"><input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden disabled={!!busy} onChange={e => void upload(e.target.files)} /><button className="text-button" disabled={!!busy} onClick={() => { uploadTarget.current = null; fileInput.current?.click(); }}><Upload size={16} /> Upload PDFs</button><button className="text-button" disabled={!!busy || project.papers.length >= 12} onClick={() => change({ papers: [...project.papers, { id: crypto.randomUUID(), title: 'Untitled paper', authors: [], year: null, doi: '', url: '', journal: '', volume: '', issue: '', pages: '', metadataSource: 'manual', textScope: 'metadata_only', textPages: [], contentHash: '', notes: '', tags: [] }] })}>Add reference manually</button></div><p className="student-muted">Up to 12 papers per project; 12 MB per PDF. {localMode ? 'Both extracted text and original PDFs stay in this browser.' : 'Searchable text is saved to your account. The original PDF stays in this browser.'} Scanned PDFs need OCR first.</p>
          {results.length > 0 && <div className="student-search-results"><h2>Publication records</h2>{results.map(p => <article key={p.id}><div><h3>{p.title}</h3><p className="student-muted">{p.year || 'Year unavailable'} · {p.journal || 'Publication record'} · {scopeLabel(p)}</p></div><button className="text-button" disabled={!!busy || project.papers.length >= 12 || project.papers.some(own => own.doi && own.doi.toLowerCase() === p.doi.toLowerCase())} onClick={() => { change({ papers: [...project.papers, p] }); setSelected(ids => [...ids, p.id]); }}>Add paper <Plus size={14} /></button></article>)}</div>}
          <div className="student-next-step"><p>{project.papers.some(p => p.textPages.length) ? 'Your paper text is ready. Ask what it found or compare your sources.' : 'Next: add a paper with readable text. A publication record may contain only a title and reference details.'}</p><button className="ink-button" disabled={!!busy || !project.papers.some(p => p.textPages.length)} onClick={() => setTab(project.papers.length === 1 ? 'Read' : 'Evidence')}>{project.papers.length === 1 ? 'Ask your paper' : 'Explore the evidence'} <ArrowRight size={16} /></button></div><div className="student-paper-heading"><h2>Your papers <span>({project.papers.length})</span></h2><label>Filter by tag<select value={tag} onChange={e => setTag(e.target.value)}><option value="">All papers</option>{[...new Set(project.papers.flatMap(p => p.tags))].map(t => <option key={t}>{t}</option>)}</select></label></div>
          {!project.papers.length && <p className="student-empty"><FileText size={28} /> Add your first paper to start collecting evidence.</p>}
          {visiblePapers.map((p, i) => <article className="student-paper" key={p.id}><div className="student-paper-top"><label className="student-paper-title"><input type="checkbox" disabled={!!busy} checked={selected.includes(p.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} /><strong>{i + 1}. {p.title}</strong></label><button className="icon-button" aria-label={'Remove ' + p.title} disabled={!!busy} onClick={() => { if (confirm('Remove this paper and its available text from the project?')) { change({ papers: project.papers.filter(item => item.id !== p.id) }); setSelected(ids => ids.filter(id => id !== p.id)); } }}><Trash2 size={15} /></button></div><p className="student-muted">{p.year || 'Year missing'} · {scopeLabel(p)} · {p.metadataSource === 'Crossref' ? 'Metadata from Crossref' : 'Reference details need review'}</p><div className="student-actions">{p.textPages.length > 0 && <button className="text-button" onClick={() => setPassage({ paperId: p.id, page: p.textPages[0].number, quote: '' })}>Read available text</button>}{paperLink(p) && <a className="text-button" href={paperLink(p)} target="_blank" rel="noopener noreferrer">Publication ↗</a>}<button className="text-button" disabled={!!busy} onClick={() => { setSelected([p.id]); setTab('Read'); }}>Ask this paper <ArrowRight size={14} /></button></div><button className="text-button student-attach" disabled={!!busy} onClick={() => { uploadTarget.current = p.id; fileInput.current?.click(); }}>Attach / replace PDF for this paper</button><Metadata paper={p} disabled={!!busy} update={changes => updatePaper(p.id, changes)} lookup={() => void discover(p.doi, p.id)} /></article>)}
        </section>}
        {tab === 'Evidence' && <section><h1>Compare the evidence.</h1><p className="student-intro">Read the objective, methods, population, findings and limitations side by side. Every extracted field links to the words behind it. Analyses use selected passages; open the source to check context.</p>{paperSelection()}<div className="student-actions"><button className="ink-button" disabled={!!busy || !selectedPapers.some(p => p.textPages.length) || !canRun('extract')} onClick={() => void run('extract')}>{actionLabel('extract', 'Analyze ' + Math.min(3, selected.length) + ' selected papers')} <ArrowRight size={16} /></button><button className="text-button" disabled={!!busy || selectedPapers.filter(p => p.textPages.length).length < 2 || !canRun('review')} onClick={() => void run('review')}>{actionLabel('review', 'Compare studies by theme')}</button><span className="student-muted">Extraction reads up to three selected papers per action. Change your selection for the next group.</span></div><div className="student-table-wrap"><table className="student-evidence-table"><caption>{localMode ? 'Paper comparison · check each row’s prepared or live result' : 'Paper comparison · AI extraction, check the linked passages'}</caption><thead><tr><th>Paper</th>{FIELDS.map(f => <th key={f}>{f}</th>)}</tr></thead><tbody>{project.papers.map((p, i) => {
            const rowAnalysis = [...currentResults].reverse().find(a => a.output.rows?.some(r => r.paperId === p.id));
            const row = rowAnalysis?.output.rows?.find(r => r.paperId === p.id);
            return <tr key={p.id}><th scope="row">{i + 1}. {p.title}<small>{scopeLabel(p)}</small>{localMode && rowAnalysis && <small>{rowAnalysis.key.startsWith('prepared-') ? 'Prepared comparison' : 'Saved live comparison'}</small>}</th>{FIELDS.map(f => <td key={f}>{row ? <><p>{row.cells[f].text}</p><SourceButtons evidence={row.cells[f].evidence} papers={project.papers} onOpen={setPassage} /></> : <span className="student-muted">{p.textPages.length ? 'Select and analyze this paper.' : 'Upload readable text first.'}</span>}</td>)}</tr>;
          })}</tbody></table></div>{outputBlocks(last('review'))}</section>}
        {tab === 'Read' && <section><h1>Ask the papers.</h1><p className="student-intro">Ask for a source-grounded explanation of the selected papers. Answers use available passages and show their limits.</p>{paperSelection()}<form onSubmit={e => { e.preventDefault(); void run('ask'); }}><label>Your paper question<textarea rows={3} maxLength={1800} disabled={!!busy} value={question} onChange={e => setQuestion(e.target.value)} placeholder="How was this study designed, and what does it actually establish?" /></label><div className="student-actions"><button className="ink-button" disabled={!!busy || !question.trim() || !selectedPapers.some(p => p.textPages.length) || !canRun('ask')}>{actionLabel('ask', 'Ask selected papers')} <ArrowRight size={16} /></button></div></form><div className="student-quick-questions">{['Explain the study methods in plain language.', 'What limitations do the authors report?', 'Where do these studies agree or disagree?'].map(q => <button type="button" key={q} disabled={!!busy} onClick={() => setQuestion(q)}>{q}</button>)}</div>{savedQuestions.length > 0 && <label className="student-question-history">Saved paper questions<select disabled={!!busy} value={readAnswer?.key || ''} onChange={e => { const answer = savedQuestions.find(a => a.key === e.target.value); if (answer) { setReadAnswerKey(answer.key); setQuestion(answer.question); setSelected(answer.paperIds); } }}>{savedQuestions.map(a => <option value={a.key} key={a.key}>{a.question || 'Saved paper explanation'}</option>)}</select></label>}{outputBlocks(readAnswer)}</section>}
        {tab === 'Draft' && <section><h1>Which claims can you defend?</h1><p className="student-intro">Paste your own writing. Check up to twelve factual claims against the selected papers, then inspect the supporting or conflicting passages.</p>{paperSelection()}<label>Your draft<textarea className="student-draft" rows={10} maxLength={12000} disabled={!!busy} value={project.draft} onChange={e => change({ draft: e.target.value })} placeholder="Write or paste your own paragraph here…" /></label><div className="student-actions"><button className="ink-button" disabled={!!busy || !project.draft.trim() || !selectedPapers.some(p => p.textPages.length) || !canRun('audit')} onClick={() => void run('audit')}>{actionLabel('audit', 'Check evidence')} <ArrowRight size={16} /></button><span className="student-muted">{project.draft.length.toLocaleString()} / 12,000 characters</span></div><p className="student-muted">A judgment concerns the passages available here. “Not found” does not mean a claim is universally false. Review AI judgments against the originals.</p>{localMode && audit && <p className="student-muted">{last('audit')?.key.startsWith('prepared-') ? 'Prepared draft judgments · written in advance, not a new AI check' : 'Saved live draft check · inspect the linked evidence'}</p>}{audit?.claims?.map((claim, i) => <article className="student-claim" key={i}><span className={'student-claim-status ' + claim.status}>{claim.status.replace('_', ' ')}</span><blockquote>{claim.claim}</blockquote><p>{claim.explanation}</p><SourceButtons evidence={claim.evidence} papers={project.papers} onOpen={setPassage} /></article>)}{audit?.gaps?.map((g, i) => <p className="student-caveat" key={i}>{g}</p>)}</section>}
        {tab === 'Notes' && <section><h1>Keep your own thinking.</h1><p className="student-intro">Develop your argument and record decisions as you read. Paper-specific notes stay with each source in Papers.</p><label>Project notes<textarea rows={16} maxLength={30000} disabled={!!busy} value={project.notes} onChange={e => change({ notes: e.target.value })} placeholder="Themes, disagreements, questions for your tutor, and ideas worth following…" /></label>{project.papers.filter(p => p.notes).map(p => <article className="student-paper-note" key={p.id}><h2>{p.title}</h2><p>{p.notes}</p></article>)}</section>}
        {tab === 'Export' && <section><h1>Take your research with you.</h1><p className="student-intro">Export your sources, evidence and notes. Missing author or date details remain missing; review each reference before submitting.</p><label>Citation style<select value={project.citationStyle} disabled={!!busy} onChange={e => change({ citationStyle: e.target.value as 'apa' | 'mla' })}><option value="apa">APA 7</option><option value="mla">MLA 9</option></select></label>{referenceError && <p role="alert" className="inline-error">{referenceError}</p>}<div className="student-export-actions"><button className="ink-button" disabled={!referencesReady} onClick={() => exportFile('md')}><Download size={15} /> Research notes (.md)</button><button className="text-button" onClick={() => exportFile('csv')}>Evidence table (.csv)</button><button className="text-button" onClick={() => exportFile('bib')}>BibTeX (.bib)</button><button className="text-button" onClick={() => exportFile('ris')}>Zotero / Mendeley (.ris)</button><button className="text-button" onClick={() => exportFile('csl')}>CSL references (.json)</button><button className="text-button" onClick={() => exportFile('json')}>Full project backup (.json)</button><button className="text-button" disabled={!referencesReady} onClick={() => window.print()}>Print / save PDF</button></div><h2>References</h2>{!project.papers.length && <p>Add papers to generate references.</p>}<ol className="student-bibliography">{references.map((reference, i) => <li key={i}>{reference}</li>)}</ol><h2>Before submitting</h2><ul className="student-checklist"><li>Open the cited passages and check that they support your wording.</li><li>Complete missing publication details and confirm the required style.</li><li>Explain the studies’ methods and limitations in your own words.</li><li>Check the assignment requirements and your institution’s guidance on AI assistance.</li></ul><button className="text-button student-delete" disabled={!!busy} onClick={async () => {
            if (!confirm('Permanently delete this project from its saved location? Export a backup first if you need one.')) return;
            setBusy('Deleting project'); try { if (localMode) deleteGuest(project.id); else await responseJson(await fetch('/api/student/projects/' + project.id, { method: 'DELETE' })); localStorage.removeItem('fieldwork-project-draft:' + accountId); replace(null); setDirty(false); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
          }}><Trash2 size={14} /> Delete project</button></section>}
      </div></> : <section className="student-welcome"><h1>Your assignment.<br />The evidence behind it.</h1><p>Turn an assignment into a research plan, compare papers, and check the evidence behind your writing.</p><ol><li>Set the assignment: paste a topic or instructions.</li><li>Add papers: find references or upload PDFs.</li><li>Explore evidence: compare, ask questions and check your draft.</li></ol><div className="student-actions"><button className="ink-button" disabled={!!busy || !accountId} onClick={() => void create()}><Plus size={16} /> Start my assignment</button><Link className="text-button" href="/demo/projects">Explore an example <ArrowRight size={15} /></Link></div>{error && <p className="inline-error" role="alert">{error}</p>}</section>}
    </div>
    <StudentSource passage={passage} papers={project?.papers || []} accountId={accountId} onClose={() => setPassage(null)} onNavigate={setPassage} />
    {project && <article className="student-print"><h1>{project.title}</h1><h2>Assignment</h2><p>{project.brief}</p><h2>Research question</h2><p>{project.question}</p><h2>Notes</h2><p>{project.notes}</p><h2>Student draft</h2><p>{project.draft}</p>{currentResults.map(a => <section key={a.key}><h2>{a.action === 'extract' ? 'Evidence comparison' : a.action === 'audit' ? 'Draft evidence check' : a.action === 'plan' ? 'Research plan' : a.question || 'Comparative reading'}</h2>{a.output.plan && <p>{a.output.plan.question}{'\n' + a.output.plan.subquestions.join('\n')}</p>}{a.output.rows?.map(row => <section key={row.paperId}><h3>{project.papers.find(p => p.id === row.paperId)?.title}</h3>{FIELDS.map(f => <p key={f}><strong>{f}: </strong>{row.cells[f].text}{row.cells[f].evidence.map(e => '\n“' + e.quote + '” (' + (project.papers.find(p => p.id === e.paperId)?.textScope === 'abstract_only' ? 'abstract' : 'p. ' + e.page) + ')').join('')}</p>)}</section>)}{a.output.blocks?.map((b, i) => <p key={i}>{b.text}{b.evidence.map(e => '\n“' + e.quote + '” — ' + project.papers.find(p => p.id === e.paperId)?.title + (project.papers.find(p => p.id === e.paperId)?.textScope === 'abstract_only' ? ', abstract' : ', p. ' + e.page)).join('')}</p>)}{a.output.claims?.map((c, i) => <p key={i}><strong>{c.status}: </strong>{c.claim}{'\n' + c.explanation}{c.evidence.map(e => '\n“' + e.quote + '” — ' + project.papers.find(p => p.id === e.paperId)?.title).join('')}</p>)}</section>)}<h2>References</h2>{references.map((r, i) => <p key={i}>{r}</p>)}</article>}
  </main>;
}
