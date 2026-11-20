import type { SynthesisOutput } from '@/types/research';
import type { AnswerBlock } from '@/types/database';
export function validateAnswer(value: unknown, refs: Set<string>): SynthesisOutput {
    if (!value || typeof value !== 'object')
        throw Error('The model returned an invalid answer.');
    const raw = value as Record<string, unknown>;
    if (!Array.isArray(raw.blocks) || raw.blocks.length === 0 || raw.blocks.length > 20)
        throw Error('The model did not return a usable brief.');
    const states = ['supported', 'limited', 'conflicting', 'insufficient'];
    if (!states.includes(raw.evidence_status as string))
        throw Error('The model returned an invalid evidence status.');
    const blocks: AnswerBlock[] = raw.blocks.map((b: any) => {
        if (!b || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 8000 || !Array.isArray(b.source_refs))
            throw Error('An answer paragraph was malformed.');
        if (!['fact', 'inference', 'background'].includes(b.claim_type))
            throw Error('An answer paragraph had no valid claim type.');
        if (b.source_refs.some((ref: unknown) => typeof ref !== 'string' || !refs.has(ref as string)))
            throw Error('The answer cited a source that was not retrieved. Research stopped.');
        if (b.claim_type === 'fact' && b.source_refs.length === 0)
            throw Error('A factual claim had no supporting citation. Research stopped.');
        return { text: b.text.trim(), claim_type: b.claim_type, source_refs: [...new Set<string>(b.source_refs)], caveat: typeof b.caveat === 'string' ? b.caveat : undefined };
    });
    return { blocks, evidence_status: raw.evidence_status as SynthesisOutput['evidence_status'], uncertainty_note: typeof raw.uncertainty_note === 'string' ? raw.uncertainty_note : undefined };
}
