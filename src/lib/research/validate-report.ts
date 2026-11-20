import { validateAnswer } from './validate-answer';
import type { NormalizedEvidence } from '@/types/research';
import type { EvidenceSupport, ResearchReport } from '@/types/database';
const normalize = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
export function validateSupports(value: unknown, evidence: NormalizedEvidence[]): EvidenceSupport[] {
  if (!Array.isArray(value) || !value.length || value.length > 6) throw Error('A report statement has no inspectable supporting passage.');
  return value.map(s => {
    const source = evidence.find(e => e.source_ref === s?.source_ref);
    const passage = source?.reading?.passages.find(p => p.id === s?.passage_id);
    if (!passage || typeof s.quote !== 'string' || normalize(s.quote).length < 16 || s.quote.length > 1200 || !normalize(passage.text).includes(normalize(s.quote))) throw Error('A report quotation did not match the supplied source passage.');
    return { source_ref: source!.source_ref, passage_id: passage.id, quote: normalize(s.quote) };
  });
}
export function validateReport(raw: any, evidence: NormalizedEvidence[]) {
  const base = validateAnswer(raw, new Set(evidence.map(e => e.source_ref)));
  const blocks = base.blocks.map((block,i) => {
    const original = raw.blocks[i], support = validateSupports(original.support, evidence);
    if (block.source_refs.some(ref => !support.some(s => s.source_ref === ref)) || support.some(s => !block.source_refs.includes(s.source_ref))) throw Error('A report citation did not match its supporting passage.');
    if (typeof original.section !== 'string' || !original.section.trim() || original.section.length > 100) throw Error('A report section was missing.');
    return { ...block, section: original.section.trim(), support };
  });
  if (typeof raw.scope !== 'string' || !raw.scope.trim() || raw.scope.length > 1200) throw Error('Report scope was missing.');
  if (!Array.isArray(raw.source_assessments) || raw.source_assessments.length > evidence.length) throw Error('Source comparison was invalid.');
  const seen = new Set<string>();
  const assessments: ResearchReport['source_assessments'] = raw.source_assessments.map((row: any) => {
    if (seen.has(row.source_ref) || !evidence.some(e => e.source_ref === row.source_ref)) throw Error('Source comparison cited an unknown or repeated source.');
    seen.add(row.source_ref);
    for (const key of ['contribution','method','limitation']) if (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > 900) throw Error('Source comparison was incomplete.');
    const support = validateSupports(row.support, evidence);
    if (support.some(s => s.source_ref !== row.source_ref)) throw Error('A source comparison used another source’s quotation.');
    return { source_ref: row.source_ref as string, contribution: row.contribution as string, method: row.method as string, limitation: row.limitation as string, support };
  });
  if (!Array.isArray(raw.followups) || raw.followups.some((q: unknown) => typeof q !== 'string' || q.length > 350)) throw Error('Report follow-up questions were invalid.');
  return { ...base, blocks, scope: raw.scope as string, source_assessments: assessments, followups: (raw.followups as string[]).map(q => q.trim()).filter(Boolean).slice(0, 3) };
}
