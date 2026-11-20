import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { studentSession, readStudentBody, studentResponse, studentFailure } from '@/lib/student/http';
import { loadProject, saveProject, ProjectError } from '@/lib/student/store';
import { inputBasis, type StudentAction } from '@/lib/student/types';
import { prepareStudentAnalysis, runStudentAnalysis } from '@/lib/student/ai';
import { getNebiusConfig } from '@/lib/providers/nebius';
import { reserveBudget } from '@/lib/budget/limits';
export const runtime = 'nodejs';
export const maxDuration = 240;
export async function POST(request: NextRequest) {
  let runId = '', dbForFailure: any;
  try {
    const { db, user } = await studentSession(request);
    dbForFailure = db;
    const body = await readStudentBody(request);
    const action = body.action as StudentAction;
    if (!['plan', 'extract', 'ask', 'audit', 'review'].includes(action)) throw new ProjectError('Choose a research tool.');
    const { project, messageId } = await loadProject(db, user.id, String(body.projectId || ''));
    const ids: string[] = Array.isArray(body.paperIds) ? [...new Set<string>(body.paperIds.filter((id: unknown) => typeof id === 'string'))].slice(0, action === 'extract' ? 3 : 12) : [];
    const papers = project.papers.filter(p => ids.includes(p.id));
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 1800) : '';
    if (action === 'plan' && !project.brief.trim()) throw new ProjectError('Add your assignment brief first.');
    if (action !== 'plan' && (!papers.length || !papers.some(p => p.textPages.length))) throw new ProjectError('Select papers with readable full text or an abstract.');
    if (action === 'ask' && !question) throw new ProjectError('Ask a question about the selected papers.');
    if (action === 'audit' && !project.draft.trim()) throw new ProjectError('Add your own draft first.');
    const basis = inputBasis(project, action, ids, question);
    const key = createHash('sha256').update(basis).digest('hex');
    const cached = project.analyses.find(a => a.key === key);
    if (cached) return studentResponse({ project, analysis: cached, cached: true });
    if (process.env.PROVIDER_REQUESTS_ENABLED !== 'true') throw new ProjectError('AI research is currently paused.', 403);
    if (!getNebiusConfig()) throw new ProjectError('The research model is not configured.', 503);
    try { prepareStudentAnalysis(project, action, papers, question); }
    catch (e) { throw new ProjectError((e as Error).message); }
    const { data: run, error } = await db.from('research_runs').insert({ user_id: user.id, conversation_id: project.id, status: 'planning', model_id: process.env.NEBIUS_MODEL, query_plan: { mode: 'student', action, paper_ids: ids } }).select('id').single();
    if (error || !run) throw new ProjectError('Could not create a protected research action.', 503);
    runId = run.id;
    const reservation = await reserveBudget(db, user.id, runId);
    if (!reservation.allowed) throw new ProjectError(reservation.message || 'Research allowance reached.', 429);
    const result = await runStudentAnalysis(project, action, papers, question);
    const analysis = { key, basis, action, paperIds: ids, question, createdAt: new Date().toISOString(), output: result.output };
    const next = await saveProject(db, user.id, messageId, { ...project, analyses: [...project.analyses, analysis] }, project.revision);
    await db.from('research_runs').update({ status: 'completed', completed_at: new Date().toISOString(), nebius_input_tokens: result.usage.input, nebius_output_tokens: result.usage.output, tavily_credits_actual: 0 }).eq('id', runId).eq('user_id', user.id);
    return studentResponse({ project: next, analysis, cached: false });
  } catch (e) {
    if (runId && dbForFailure) await dbForFailure.from('research_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error_code: 'student_action_failed' }).eq('id', runId);
    if (e instanceof ProjectError) return studentFailure(e);
    return studentFailure(new ProjectError('The paper analysis could not finish. Check your allowance and paper text before retrying. No result was fabricated.', 502));
  }
}
