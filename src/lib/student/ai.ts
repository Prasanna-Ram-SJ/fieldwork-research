import { createNebiusClient, getNebiusConfig } from '@/lib/providers/nebius';
import { KIMI_RESEARCH_MODEL, researchJson } from '@/lib/providers/nebius-research';
import { studentContext, studentInstructions, validateStudentOutput } from './evidence';
import type { Paper, StudentAction, StudentProject } from './types';
export function prepareStudentAnalysis(project: StudentProject, action: StudentAction, papers: Paper[], question: string) {
  const { passages, context } = studentContext(project, action, papers, question);
  if (action !== 'plan' && !passages.length) throw Error('Add readable paper text before running this tool.');
  const messages = [{ role: 'system' as const, content: studentInstructions(action) }, { role: 'user' as const, content: JSON.stringify(context) }];
  if (Buffer.byteLength(JSON.stringify(messages)) > 120000) throw Error('The selected reading context is too large. Select fewer papers.');
  return { passages, messages };
}
export async function runStudentAnalysis(project: StudentProject, action: StudentAction, papers: Paper[], question: string) {
  const config = getNebiusConfig();
  if (!config) throw Error('The research model is not configured.');
  const { passages, messages } = prepareStudentAnalysis(project, action, papers, question);
  const completion = await createNebiusClient(config).chat.completions.create({ model: config.model, messages,
    response_format: { type: 'json_object' }, max_tokens: 8192,
    ...(config.model === KIMI_RESEARCH_MODEL ? { reasoning_effort: 'low' as const } : {}) });
  const output = validateStudentOutput(action, researchJson(completion), passages, papers, project.draft);
  return { output, usage: { input: completion.usage?.prompt_tokens || 0, output: completion.usage?.completion_tokens || 0 } };
}
