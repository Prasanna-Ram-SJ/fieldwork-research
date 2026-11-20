import type { Paper, StudentProject, StudentAction, StudentOutput, Passage } from './types';
import { newProject, inputBasis } from './types';
export const DEMO_PDF_PATHS: Record<string, string> = {
  'demo-eysenbach-2006': '/demo/eysenbach-2006.pdf',
  'demo-langham-2021': '/demo/langham-putrow-2021.pdf',
};
export const DEMO_QUESTION = 'Does open access guarantee more citations?';
export async function preparedProject(): Promise<StudentProject> {
  const response = await fetch('/demo/papers.json');
  if (!response.ok) throw Error('The example papers could not load. Retry or start a blank assignment.');
  return buildPreparedProject(await response.json());
}
export function buildPreparedProject(papers: Paper[]): StudentProject {
  const project: StudentProject = { ...newProject(), id: 'prepared-open-access', title: 'Does open access increase citations?',
    brief: 'Compare two papers about open access and citation impact. Explain their methods, findings and limitations. Write a careful evidence-based conclusion.',
    rubric: 'Compare study designs. Distinguish association from causation. Use specific evidence and acknowledge uncertainty.',
    question: 'What can these studies establish about open access and citation impact?', minimumSources: 2, papers,
    notes: 'Prepared teaching example using two real CC BY papers. The comparison and draft judgments were written in advance, not generated during this visit.',
    draft: 'The 2006 study analyzed 1,492 original research articles. Open access guarantees that every article will receive more citations.' };
  function quote(index: number, snippet: string): Passage {
    const paper = papers[index], page = paper.textPages.find(p => p.text.includes(snippet));
    if (!page) throw Error('A prepared quotation no longer matches its paper.');
    return { paperId: paper.id, page: page.number, quote: snippet };
  }
  const q1 = quote(0, 'A total of 1,492 original research articles were analyzed');
  const q2 = quote(0, 'This was a longitudinal bibliometric analysis of a cohort');
  const q3 = quote(0, 'The average number of citations of OA articles was higher compared to non-OA articles');
  const q4 = quote(1, 'We conducted a systematic review to compare studies of citations to OA and non-OA articles.');
  const q5 = quote(1, 'Ultimately, 134 items were identified for inclusion.');
  const q6 = quote(1, '37 (27.6%) found that it did not exist');
  const q7 = quote(1, '3 were found to have an overall low risk of bias.');
  const cell = (text: string, ...evidence: Passage[]) => ({ text, evidence });
  function add(action: StudentAction, ids: string[], output: StudentOutput, question = '') {
    const basis = inputBasis(project, action, ids, question);
    project.analyses.push({ key: 'prepared-' + action, basis, action, paperIds: ids, question, createdAt: '2026-11-20T00:00:00Z', output });
  }
  const ids = papers.map(p => p.id);
  add('plan', [], { plan: { question: project.question, subquestions: ['How do the study designs differ?', 'Do reported advantages apply consistently?', 'What limits a causal conclusion?'], requirements: ['Compare both papers.', 'Explain methods and limitations.', 'Support claims with quotations and references.'], searches: ['open access citation advantage systematic review'] } });
  add('extract', ids, { rows: [
    { paperId: ids[0], cells: { objective: cell('Compare citations to open and non-open articles in one journal.', q2), methods: cell('Longitudinal bibliometric cohort analysis.', q2), population: cell('1,492 original research articles.', q1), findings: cell('Open articles had higher average citation counts in this cohort.', q3), limitations: cell('Scope interpretation: a single-journal observational cohort cannot establish a guarantee for every article.', q2) } },
    { paperId: ids[1], cells: { objective: cell('Review evidence for an open access citation advantage.', q4), methods: cell('Systematic review of studies comparing citation outcomes.', q4), population: cell('134 included items.', q5), findings: cell('Results differed: some studies found no advantage.', q6), limitations: cell('Only three included studies had an overall low risk of bias.', q7) } },
  ], gaps: ['Prepared summaries describe these two papers; they do not establish what every field or article will experience.'] });
  const explanation = { blocks: [{ text: 'These papers do not establish a guarantee. The cohort reports a citation advantage, while the systematic review includes studies that found no advantage. Their different designs and scope matter when interpreting the results.', evidence: [q3, q6] }], gaps: ['This is a prepared interpretation of these sources, not a new live research run or a universal causal conclusion.'] };
  add('ask', ids, explanation, DEMO_QUESTION);
  add('review', ids, explanation);
  add('audit', ids, { claims: [
    { claim: 'The 2006 study analyzed 1,492 original research articles.', status: 'supported', explanation: 'The reported study count matches this sentence.', evidence: [q1] },
    { claim: 'Open access guarantees that every article will receive more citations.', status: 'contradicted', explanation: 'The universal guarantee conflicts with the review’s finding that some studies found no advantage. Rewrite the claim to reflect mixed evidence and scope.', evidence: [q6] },
  ], gaps: ['These judgments were prepared for demonstration. Always check source context before relying on a claim label.'] });
  return project;
}
