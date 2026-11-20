import { createNebiusClient, getNebiusConfig } from '@/lib/providers/nebius';
import { researchCompletionSettings, researchJson } from '@/lib/providers/nebius-research';
import { QueryPlan } from '@/types/database';

export async function planResearchQueries(
  question: string,
  recentContext?: string,
  onUsage?: (input: number, output: number) => void
): Promise<QueryPlan> {
  const config = getNebiusConfig();
  if (!config) {
    throw new Error('NEBIUS_API_KEY is not configured on the server.');
  }

  const client = createNebiusClient(config);

  const systemPrompt = `You are a research query planner.
Your job is to break down the user's factual research question into AT MOST TWO distinct, high-precision web search query strings.
Do not use complex Boolean operators or site operators unless necessary.
Detect if the question requires recent or time-sensitive evidence.
Output ONLY valid JSON matching this schema:
{
  "focus": "self-contained research question, resolving follow-up context",
  "format": "brief or report (brief only for a narrow factual question)",
  "aspects": [{"id":"a1","question":"one evidence question to investigate"}],
  "queries": ["query 1", "query 2"],
  "is_time_sensitive": true/false,
  "temporal_scope": "optional date/year range string or null",
  "geographic_scope": "optional geographic jurisdiction or null",
  "strategy_reason": "brief 1-sentence statement on what angles are targeted"
}
Rules:
- Maximum 2 queries.
- Identify 2–4 distinct evidence questions for a substantial topic, or one for a narrow factual question. Use IDs a1, a2, etc.
- Prefer primary studies, original statistics and official documentation. Cover methods/limitations and competing evidence where relevant, rather than just finding agreeing summaries.
- Resolve follow-ups into a self-contained focus using recent context; do not silently change the user's question.
- Each query must be concise (under 120 characters) and targeted.
- Do not include personal opinions, markdown fences, or extra text.`;

  const userContent = recentContext
    ? `Recent context:\n${recentContext}\n\nCurrent research question:\n${question}`
    : `Research question:\n${question}`;

  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.1,
    ...researchCompletionSettings(config.model, 'planning'),
    response_format: { type: 'json_object' },
  });

  const parsed: any = researchJson(completion);
  onUsage?.(completion.usage?.prompt_tokens || 0, completion.usage?.completion_tokens || 0);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The research model returned an invalid query plan.');
  }

  // Validate queries
  let queries: string[] = [];
  if (Array.isArray(parsed.queries)) {
    queries = [...new Set<string>(parsed.queries
      .map((q: any) => (typeof q === 'string' ? q.trim() : ''))
      .filter((q: string) => q.length > 0 && q.length < 150)
      .slice(0, 2))];
  }

  if (queries.length === 0) {
    // Fallback to the raw question if planner failed to produce a query
    queries = [question.trim().slice(0, 100)];
  }

  return {
    queries,
    is_time_sensitive: parsed.is_time_sensitive === true,
    temporal_scope: parsed.temporal_scope || undefined,
    geographic_scope: parsed.geographic_scope || undefined,
    strategy_reason: parsed.strategy_reason || 'Targeted factual search queries planned',
    focus: typeof parsed.focus === 'string' ? parsed.focus.trim().slice(0, 1000) : question.slice(0, 1000),
    format: parsed.format === 'brief' ? 'brief' : 'report',
    aspects: Array.isArray(parsed.aspects) && parsed.aspects.length ? parsed.aspects.slice(0,4).map((a: any, i: number) => ({ id: 'a' + (i + 1), question: typeof a?.question === 'string' ? a.question.trim().slice(0, 220) : question.slice(0,220) })) : [{ id: 'a1', question: question.slice(0,220) }],
  };
}
