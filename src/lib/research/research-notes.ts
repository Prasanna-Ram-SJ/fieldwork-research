import type { AnswerBlock } from '@/types/database';
import type { NormalizedEvidence } from '@/types/research';

export type ResearchNoteId = 'status' | 'limits' | 'next_steps';

/** Fixed process explanations, never model-authored claims about the subject. */
export function researchNote(id: ResearchNoteId, evidence: NormalizedEvidence[]): AnswerBlock {
  const count = evidence.filter(s => s.reading?.passages.some(p => p.text.trim().length >= 16)).length;
  const notes = {
    status: {
      section: 'Short answer — answer not established',
      text: `This run retrieved readable material from ${count} source${count === 1 ? '' : 's'}, but did not produce an answer narrative that passed the evidence check. That is a limit of this run, not proof that the proposed explanation is false or that no relevant research exists. The source evidence below remains available to inspect; it should not be treated as an established conclusion.`,
    },
    limits: {
      section: 'Limits of the available evidence',
      text: 'This is a bounded web search, not a systematic review. An accessible quotation establishes what the retrieved passage says; it does not on its own validate a method, establish causation, or demonstrate that a result generalizes. Search excerpts, abstracts and partially read documents can omit essential methods or qualifications. A failed or unavailable evidence review must not be confused with a scientific finding that the evidence is inconclusive.',
    },
    next_steps: {
      section: 'How to investigate further',
      text: 'Treat these as research steps rather than findings: identify sources that test the exact question; inspect their original methods, comparison groups, sample sizes and outcome measures; distinguish direct measurements from simulations or commentary; and look for independent replication and conflicting results. Where a claim remains untested, state the assumption and what observation would support or challenge it. The source quotations above are starting points, not proof that these checks have been satisfied.',
    },
  };
  return { ...notes[id], claim_type: 'research_note', note_id: id, source_refs: [], support: [] };
}

export function validateResearchNote(value: any, evidence: NormalizedEvidence[]): AnswerBlock {
  if (!['status', 'limits', 'next_steps'].includes(value?.note_id)) throw Error('Unknown research note.');
  const expected = researchNote(value.note_id, evidence);
  if (value.text !== expected.text || value.section !== expected.section || !Array.isArray(value.source_refs) || value.source_refs.length || !Array.isArray(value.support) || value.support.length) throw Error('Research note was modified or used as a source claim.');
  return expected;
}
