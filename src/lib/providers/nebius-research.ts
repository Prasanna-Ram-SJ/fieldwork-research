import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

export const KIMI_RESEARCH_MODEL = 'moonshotai/Kimi-K3.1-Pro';
export type ResearchStage = 'planning' | 'refinement' | 'synthesis' | 'verification';

const legacyLimits: Record<ResearchStage, number> = {
  planning: 300,
  refinement: 250,
  synthesis: 1500,
  verification: 500,
};

/** Reasoning shares the output cap with JSON. Keep a finite budget per stage. */
export function researchCompletionSettings(
  model: string,
  stage: ResearchStage,
): Pick<ChatCompletionCreateParamsNonStreaming, 'max_tokens' | 'reasoning_effort'> {
  if (model !== KIMI_RESEARCH_MODEL) return { max_tokens: legacyLimits[stage] };
  const detailed = stage === 'synthesis' || stage === 'verification';
  return {
    max_tokens: detailed ? 8192 : 4096,
    reasoning_effort: detailed ? 'high' : 'low',
  };
}

/** Read only the visible answer; never expose or parse reasoning_content. */
export function researchJson(completion: Pick<ChatCompletion, 'choices'>): unknown {
  const choice = completion.choices[0];
  if (choice?.finish_reason === 'length') {
    throw new Error('The research response reached its output limit before finishing. Please try a more focused question.');
  }
  if (!choice || choice.finish_reason !== 'stop' || choice.message.refusal) {
    throw new Error('The research model could not complete a structured answer. Please try rephrasing the question.');
  }
  const text = choice.message.content?.trim();
  if (!text) throw new Error('The research model returned no answer. Please try a more focused question.');
  // Some compatible endpoints wrap JSON in a Markdown fence despite JSON mode.
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('The research model returned an incomplete or invalid structured answer. Please try again.');
  }
}
