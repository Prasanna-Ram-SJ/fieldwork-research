"use client";
import type { ResearchReport } from '@/types/database';
export const accessLabel = (access: string) => ({ page_text: 'Original page text', pdf_text: 'Original PDF passages', abstract_only: 'Abstract only', search_excerpt: 'Search excerpt only' }[access] || 'Saved excerpt');
export function ResearchReportScope({ report, prepared = false }: { report: ResearchReport; prepared?: boolean }) {
  return <div className="research-report-scope"><p><strong>Scope.</strong> {report.scope}</p><details><summary>Research questions and coverage</summary><p className="report-help">{prepared ? 'Coverage labels were prepared in advance for this example.' : 'Coverage is a model assessment of the available passages.'} They are not confidence scores or guarantees of truth.</p><ol>{report.plan.map(a => { const coverage = report.coverage.find(c => c.aspect_id === a.id); return <li key={a.id}><strong>{a.question}</strong><span className="coverage-state">{coverage?.status || 'Not assessed'}</span><p>{coverage?.reason || 'Coverage was not assessed.'}</p></li>; })}</ol><p>{report.stop_reason}</p><p className="report-help">{report.searched_queries.length ? 'Searches: ' + report.searched_queries.join(' · ') : 'No searches were performed for this prepared example.'} Saved {new Date(report.searched_at).toLocaleString()}.</p></details></div>;
}
export function ResearchReportComparison({ report, id, cite }: { report: ResearchReport; id: string; cite: (ref: string) => void }) {
  if (!report.source_assessments.length) return null;
  return <section className="report-comparison"><h3 id={'comparison-' + id} tabIndex={-1}>Compare the strongest evidence</h3><div className="report-table-scroll"><table><caption>Source contributions and limitations · inspect the linked passages</caption><thead><tr><th>Source and access</th><th>What it establishes</th><th>Methods or basis</th><th>Limits</th></tr></thead><tbody>{report.source_assessments.map(row => {
    const source = report.sources.find(s => s.source_ref === row.source_ref);
    return <tr key={row.source_ref}><th scope="row"><button className="report-source-link" onClick={() => cite(row.source_ref)}>{source?.title || row.source_ref}</button><small>{source ? accessLabel(source.access) : 'Source details unavailable'}</small></th><td>{row.contribution}</td><td>{row.method}</td><td>{row.limitation}</td></tr>;
  })}</tbody></table></div></section>;
}
export function ResearchReportFollowups({ report, prepare }: { report: ResearchReport; prepare: (question: string) => void }) {
  return <div className="report-followups"><p>{report.stop_reason}</p>{report.followups.length > 0 && <><h4>Investigate a remaining question</h4><p className="report-help">Choosing one fills the question box. Research starts only when you submit it and uses your normal allowance.</p>{report.followups.map(q => <button type="button" className="text-button" key={q} onClick={() => prepare(q)}>{q}</button>)}</>}</div>;
}
