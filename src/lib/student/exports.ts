import { FIELDS, inputBasis, type Paper, type StudentProject } from './types';
export function cslItem(p: Paper) {
  return { id: p.id, type: p.journal ? 'article-journal' : 'document', title: p.title,
    author: p.authors.map(a => a.literal ? { literal: a.literal } : { given: a.given, family: a.family }),
    ...(p.year ? { issued: { 'date-parts': [[p.year]] } } : {}),
    DOI: p.doi || undefined, URL: p.url || undefined, 'container-title': p.journal || undefined,
    volume: p.volume || undefined, issue: p.issue || undefined, page: p.pages || undefined };
}
export async function formattedBibliography(papers: Paper[], style: 'apa' | 'mla'): Promise<string[]> {
  if (!papers.length) return [];
  const [CSL, template, locale] = await Promise.all([import('citeproc'), fetch('/csl/' + style + '.csl').then(r => { if (!r.ok) throw Error('Citation style could not load.'); return r.text(); }), fetch('/csl/en-US.xml').then(r => { if (!r.ok) throw Error('Citation locale could not load.'); return r.text(); })]);
  const items = Object.fromEntries(papers.map(p => [p.id, cslItem(p)]));
  const Processor = CSL.Engine || CSL.default?.Engine;
  if (typeof Processor !== 'function') throw Error('The reference formatter could not load. Please refresh and try again.');
  const processor = new Processor({ retrieveLocale: () => locale, retrieveItem: (id: string) => items[id] }, template);
  processor.setOutputFormat('text');
  processor.updateItems(papers.map(p => p.id));
  const bibliography = processor.makeBibliography();
  if (!bibliography) throw Error('References could not be formatted.');
  return bibliography[1].map((line: string) => line.trim());
}
const line = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();
const tex = (value: string) => line(value).replace(/[\\{}%&#_$]/g, c => c === '\\' ? '\\textbackslash{}' : '\\' + c);
export function bibtex(papers: Paper[]) {
  return papers.map(p => {
    const fields: Record<string, string> = { title: p.title, author: p.authors.map(a => a.literal || [a.family, a.given].filter(Boolean).join(', ')).join(' and '), year: p.year ? String(p.year) : '', journal: p.journal, volume: p.volume, number: p.issue, pages: p.pages, doi: p.doi, url: p.url };
    return '@' + (p.journal ? 'article' : 'misc') + '{fieldwork' + p.id.replace(/[^a-z0-9]/gi, '') + ',\n' + Object.entries(fields).filter(([, v]) => v).map(([key, value]) => '  ' + key + ' = {' + tex(value) + '}').join(',\n') + '\n}';
  }).join('\n\n');
}
export function ris(papers: Paper[]) {
  return papers.map(p => ['TY  - ' + (p.journal ? 'JOUR' : 'GEN'), 'TI  - ' + line(p.title), ...p.authors.map(a => 'AU  - ' + line(a.literal || [a.family, a.given].filter(Boolean).join(', '))),
    ...(p.year ? ['PY  - ' + p.year] : []), ...[['JO', p.journal], ['VL', p.volume], ['IS', p.issue], ['SP', p.pages], ['DO', p.doi], ['UR', p.url]].filter(([, value]) => value).map(([key, value]) => key + '  - ' + line(value)), 'ER  - '].join('\n')).join('\n\n');
}
function csv(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function evidenceCsv(project: StudentProject) {
  const rows = project.papers.map(p => {
    const analyses = project.analyses.filter(a => a.action === 'extract' && a.paperIds.includes(p.id) && a.basis === inputBasis(project, a.action, a.paperIds, a.question));
    const latest = analyses.at(-1)?.output.rows?.find(r => r.paperId === p.id);
    return [p.title, String(p.year || ''), p.doi, p.textScope, ...FIELDS.flatMap(field => {
      const cell = latest?.cells[field];
      return [cell?.text || '', (cell?.evidence || []).map(e => (p.textScope === 'abstract_only' ? 'Abstract' : 'Page ' + e.page) + ': ' + e.quote).join(' | ')];
    }), p.notes].map(csv).join(',');
  });
  return [['Title', 'Year', 'DOI', 'Text access', ...FIELDS.flatMap(f => [f, f + ' quotations']), 'Notes'].map(csv).join(','), ...rows].join('\r\n');
}
export function projectMarkdown(input: StudentProject, bibliography: string[]) {
  const project = { ...input, analyses: input.analyses.filter(a => a.basis === inputBasis(input, a.action, a.paperIds, a.question)) };
  const source = (id: string) => project.papers.find(p => p.id === id)?.title || 'Removed paper';
  const location = (e: {paperId:string;page:number}) => project.papers.find(p => p.id === e.paperId)?.textScope === 'abstract_only' ? ', abstract' : ', page ' + e.page;
  const analysis = project.analyses.map(a => '## ' + ({ plan: 'Research plan', extract: 'Evidence table', ask: 'Paper question', audit: 'Draft evidence check', review: 'Comparative review' }[a.action]) + '\n' + a.createdAt + (a.question ? '\nQuestion: ' + a.question : '') + '\n\n' +
    (a.output.plan ? [a.output.plan.question, ...a.output.plan.subquestions, ...a.output.plan.requirements].join('\n- ') : '') +
    (a.output.rows || []).map(r => '### ' + source(r.paperId) + '\n' + FIELDS.map(f => '**' + f + ':** ' + r.cells[f].text + '\n' + r.cells[f].evidence.map(e => '> ' + e.quote + ' — ' + source(e.paperId) + location(e)).join('\n')).join('\n\n')).join('\n\n') +
    (a.output.blocks || []).map(b => b.text + '\n' + b.evidence.map(e => '> ' + e.quote + ' — ' + source(e.paperId) + location(e)).join('\n')).join('\n\n') +
    (a.output.claims || []).map(c => '**' + c.status + ':** ' + c.claim + '\n' + c.explanation + '\n' + c.evidence.map(e => '> ' + e.quote + ' — ' + source(e.paperId) + location(e)).join('\n')).join('\n\n') +
    (a.output.gaps?.length ? '\n\nAvailable-evidence limits:\n' + a.output.gaps.map(g => '- ' + g).join('\n') : '')).join('\n\n');
  return '# ' + project.title + '\n\n## Assignment\n' + project.brief + '\n\n## Rubric\n' + project.rubric + '\n\n## Research question\n' + project.question + '\n\n## Notes\n' + project.notes + '\n\n' + project.papers.map(p => '### ' + p.title + '\nAccess: ' + p.textScope + '\n' + p.notes).join('\n\n') + '\n\n## Student draft\n' + project.draft + '\n\n' + analysis + '\n\n## References (' + project.citationStyle.toUpperCase() + ')\n' + bibliography.map(b => '- ' + b).join('\n') + '\n\nAI notes and draft checks must be reviewed against the original passages. Abstracts and selected excerpts do not establish full-paper coverage. Missing metadata has not been invented.';
}
export function downloadText(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
