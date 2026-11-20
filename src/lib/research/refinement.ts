import { createNebiusClient, getNebiusConfig } from '@/lib/providers/nebius';
import { researchCompletionSettings, researchJson } from '@/lib/providers/nebius-research';
import { NormalizedEvidence } from '@/types/research';

export async function planRefinementQuery(
  question: string,
  initialQueries: string[],
  retrievedEvidence: NormalizedEvidence[]
): Promise<{ query: string; reason: string } | null> {
  // If we already have 3 or more solid sources, no refinement needed
  if (retrievedEvidence.length >= 3) {
    return null;
  }

  const config = getNebiusConfig();
  if (!config) return null;

  const client = createNebiusClient(config);

  const systemPrompt = `You evaluate search results for factual research questions.
If the retrieved evidence is empty or missing key aspects, propose EXACTLY ONE refined search query string that approaches the question from an alternative angle.
If current evidence is already sufficient, set needs_refinement to false.
Output ONLY valid JSON matching this schema:
{
  "needs_refinement": true/false,
  "refinement_query": "specific single alternative search query",
  "reason": "1-sentence explanation of what evidence is missing"
}`;

  const evidenceSummary = retrievedEvidence.length === 0
    ? 'No results were found for the initial queries.'
    : retrievedEvidence.map((e) => `- ${e.title} (${e.domain}): ${e.snippet.slice(0, 150)}...`).join('\n');

  const userContent = `Original question: ${question}
Initial queries used: ${initialQueries.join(', ')}

Retrieved evidence:
${evidenceSummary}`;

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      ...researchCompletionSettings(config.model, 'refinement'),
      response_format: { type: 'json_object' },
    });

    const parsed: any = researchJson(completion);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    if (parsed.needs_refinement && parsed.refinement_query && typeof parsed.refinement_query === 'string') {
      const q = parsed.refinement_query.trim();
      if (q.length > 0 && !initialQueries.includes(q)) {
        return {
          query: q.slice(0, 120),
          reason: parsed.reason || 'Broadening search angle to locate verifiable evidence',
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
