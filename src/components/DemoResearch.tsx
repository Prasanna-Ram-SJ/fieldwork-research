"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { JudgeAccess, lockedJudge } from './JudgeAccess';
import { preparedProject, DEMO_QUESTION } from '@/lib/student/demo';
import type { SynthesisOutput, NormalizedEvidence } from '@/types/research';
import type { StudentProject } from '@/lib/student/types';
import { useResearch } from './ResearchProvider';
export function DemoResearch() {
  const workspace = useResearch();
  const [sample, setSample] = useState<StudentProject | null>(null), [judge, setJudge] = useState(lockedJudge);
  const [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<{ question: string; answer: SynthesisOutput; sources: NormalizedEvidence[] } | null>(null);
  useEffect(() => { let active = true; void preparedProject().then(p => { if (active) setSample(p); }).catch(() => { if (active) setError('The prepared papers could not load. Reload this page to try again.'); }); return () => { active = false; }; }, []);
  return <main id="main-content" className="demo-research"><header><h1>Research you can inspect.</h1><Link href="/demo">All demos</Link></header><div className="demo-research-pane">
    <div className="prepared-label">{result ? 'Live judge result · this browser only' : 'Prepared example · no live search or AI request'}</div>
    {result ? <article><h2>{result.question}</h2>{result.answer.blocks.map((block, i) => <section key={i}><p>{block.text}</p><small>{block.claim_type === 'inference' ? 'Interpretation · ' : ''}{block.source_refs.map(ref => { const source = result.sources.find(s => s.source_ref === ref); return source ? <a href={'#judge-source-' + ref} key={ref}>{source.domain} </a> : null; })}</small></section>)}{result.answer.uncertainty_note && <p>{result.answer.uncertainty_note}</p>}<h2>Sources and excerpts</h2>{result.sources.map(s => <details id={'judge-source-' + s.source_ref} key={s.source_ref}><summary>{s.title}</summary><p>{s.snippet}</p><a href={s.original_url} target="_blank" rel="noopener noreferrer">Open original source ↗</a></details>)}<p className="demo-research-status">Completed one basic search, synthesis and evidence review. There was no refinement or automatic retry. Source support is a model judgment; inspect the excerpts.</p><button className="text-button" onClick={() => setResult(null)}>Return to prepared example</button></article> : sample ? <article><h2>{DEMO_QUESTION}</h2>{sample.analyses.find(a => a.action === 'ask')?.output.blocks?.map((b, i) => <p key={i}>{b.text}</p>)}<p>This prepared answer compares a 2006 cohort study with a 2021 systematic review. It is an example of interpreting evidence, not a current exhaustive literature search.</p><h2>Check the sources</h2>{sample.papers.map(p => <details key={p.id}><summary>{p.title} ({p.year})</summary><p>{p.textPages[0].text.slice(0, 1600)}…</p><a href={p.url} target="_blank" rel="noopener noreferrer">Publication and DOI ↗</a></details>)}</article> : <p role="status">Opening the prepared example…</p>}
    <button className="ink-button" onClick={workspace.showExample}>Open the full report in Workspace</button>
    <JudgeAccess onChange={setJudge} />
    <form className="demo-live-form" onSubmit={async e => {
      e.preventDefault(); if (busy || !judge.unlocked || judge.remaining < 1) return;
      if (!confirm('Run a new live web question? This spends one action from the shared judge allowance. Failed attempts also count.')) return;
      setBusy(true); setError('');
      try { const response = await fetch('/api/judge/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'research', requestId: crypto.randomUUID(), question }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); setResult(data); }
      catch (e) { setError((e as Error).message); }
      finally { setBusy(false); window.dispatchEvent(new Event('fieldwork-judge-update')); }
    }}><label htmlFor="judge-question">Try a new web question</label><textarea id="judge-question" maxLength={500} rows={3} value={question} disabled={busy} onChange={e => setQuestion(e.target.value)} placeholder="Ask a focused factual question…" /><p>One live action searches the web once and checks the answer against retrieved excerpts. No results are saved to an account.</p><button className="ink-button" disabled={busy || !question.trim() || !judge.unlocked || judge.remaining < 1}>{busy ? 'Searching and checking evidence…' : 'Research · uses 1 shared live action'}</button>{!judge.unlocked && <p>Enter a judge code above to run a new question, or <Link href="/login">sign in for your own research allowance</Link>.</p>}{judge.unlocked && judge.remaining === 0 && <p>The shared judge allowance is used up. The prepared examples still work.</p>}</form>
    {error && <p role="alert" className="inline-error">{error}</p>}
  </div></main>;
}
