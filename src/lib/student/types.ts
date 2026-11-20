export type TextScope = 'full_text' | 'partial_text' | 'abstract_only' | 'metadata_only';
export type StudentAction = 'plan' | 'extract' | 'ask' | 'audit' | 'review';
export type EvidenceField = 'objective' | 'methods' | 'population' | 'findings' | 'limitations';
export interface Author { given?: string; family?: string; literal?: string }
export interface PaperPage { number: number; text: string }
export interface Paper {
  id: string; title: string; authors: Author[]; year: number | null;
  doi: string; url: string; journal: string; volume: string; issue: string; pages: string;
  metadataSource: 'Crossref' | 'manual'; textScope: TextScope;
  textPages: PaperPage[]; contentHash: string; fileHash?: string; fileName?: string;
  notes: string; tags: string[];
}
export interface Passage { paperId: string; page: number; quote: string }
export interface EvidenceCell { text: string; evidence: Passage[] }
export interface Plan { question: string; subquestions: string[]; requirements: string[]; searches: string[] }
export interface StudentOutput {
  plan?: Plan;
  rows?: { paperId: string; cells: Record<EvidenceField, EvidenceCell> }[];
  blocks?: { text: string; evidence: Passage[] }[];
  claims?: { claim: string; status: 'supported' | 'partial' | 'contradicted' | 'not_found'; explanation: string; evidence: Passage[] }[];
  gaps?: string[];
}
export interface Analysis {
  key: string; basis: string; action: StudentAction; paperIds: string[]; question: string;
  createdAt: string; output: StudentOutput;
}
export interface StudentProject {
  id: string; revision: number; title: string; brief: string; rubric: string; question: string;
  minimumSources: number; fromYear: string; toYear: string; citationStyle: 'apa' | 'mla';
  papers: Paper[]; notes: string; draft: string; analyses: Analysis[]; updatedAt: string;
}
export const PROJECT_PREFIX = 'FIELDWORK-PROJECT:';
export const FIELDS: EvidenceField[] = ['objective', 'methods', 'population', 'findings', 'limitations'];
export function newProject(): StudentProject {
  return { id: '', revision: 0, title: 'Untitled research project', brief: '', rubric: '', question: '', minimumSources: 5,
    fromYear: '', toYear: '', citationStyle: 'apa', papers: [], notes: '', draft: '', analyses: [], updatedAt: new Date().toISOString() };
}
export function inputBasis(project: StudentProject, action: StudentAction, ids: string[], question = '') {
  return JSON.stringify({ action, question, brief: project.brief, rubric: project.rubric,
    researchQuestion: action === 'plan' ? undefined : project.question, minimumSources: project.minimumSources,
    fromYear: project.fromYear, toYear: project.toYear,
    papers: project.papers.filter(p => ids.includes(p.id)).map(p => ({ id: p.id, title: p.title, hash: p.contentHash, scope: p.textScope })),
    draft: action === 'audit' ? project.draft : undefined });
}
export function latestAnalysis(project: StudentProject, action: StudentAction, ids: string[], question = '') {
  const basis = inputBasis(project, action, ids, question);
  return [...project.analyses].reverse().find(a => a.action === action && a.basis === basis);
}
