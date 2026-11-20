import type { NextRequest } from 'next/server';
import { JUDGE_COOKIE, JudgeError, requireJudge, reserveJudge } from '@/lib/judge/access';
import { readStudentBody, studentResponse } from '@/lib/student/http';
import { validateProject } from '@/lib/student/validation';
import { inputBasis, type StudentAction } from '@/lib/student/types';
import { prepareStudentAnalysis, runStudentAnalysis } from '@/lib/student/ai';
import { getNebiusConfig } from '@/lib/providers/nebius';
import { searchTavily } from '@/lib/providers/tavily';
import { deduplicateAndRankEvidence } from '@/lib/research/dedup';
import { synthesizeResearchAnswer } from '@/lib/research/synthesizer';
import { createHash } from 'node:crypto';
export const runtime = 'nodejs';
export const maxDuration = 240;
export async function POST(request: NextRequest) {
  let reserved = false;
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new JudgeError('Request origin not allowed.');
    const token = request.cookies.get(JUDGE_COOKIE)?.value;
    requireJudge(token);
    const body = await readStudentBody(request);
    if (typeof body.requestId !== 'string' || !/^[\w-]{20,80}$/.test(body.requestId)) throw new JudgeError('A valid request identifier is required.', 400);
    if (process.env.PROVIDER_REQUESTS_ENABLED !== 'true' || !getNebiusConfig()) throw new JudgeError('Live analysis is paused or not configured. The prepared demo still works.', 503);
    let project, papers, action: StudentAction | undefined;
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 1800) : '';
    if (body.mode === 'research') {
      if (!question || question.length > 500) throw new JudgeError('Enter a research question of 1–500 characters.', 400);
      if (!process.env.TAVILY_API_KEY) throw new JudgeError('Live search is not configured.', 503);
    } else if (body.mode === 'student') {
      action = body.action;
      if (!action || !['plan', 'extract', 'ask', 'audit', 'review'].includes(action)) throw new JudgeError('Choose a paper tool.', 400);
      try { project = validateProject(body.project); } catch { throw new JudgeError('Check your assignment, publication years and paper limits before trying again.', 400); }
      const ids = Array.isArray(body.paperIds) ? body.paperIds.filter((id: unknown) => typeof id === 'string').slice(0, action === 'extract' ? 3 : 12) : [];
      papers = project.papers.filter(p => ids.includes(p.id));
      if (action === 'plan' && !project.brief.trim()) throw new JudgeError('Add an assignment or topic first.', 400);
      if (action === 'ask' && !question) throw new JudgeError('Enter a question about the papers.', 400);
      if (action === 'audit' && !project.draft.trim()) throw new JudgeError('Add your draft first.', 400);
      try { prepareStudentAnalysis(project, action, papers, question); } catch { throw new JudgeError('Select papers with readable text, or narrow the assignment.', 400); }
    } else throw new JudgeError('Choose general research or a paper tool.', 400);
    const reservation = await reserveJudge(token, body.mode === 'research' ? 'research' : action!, body.requestId);
    if (!reservation.allowed) return studentResponse({ error: reservation.reason, remaining: reservation.remaining }, 429);
    reserved = true;
    if (body.mode === 'research') {
      // Deliberately bounded guest path: one basic search, one synthesis and one
      // evidence review. No planner, refinement, retries or account/database writes.
      const search = await searchTavily({ query: question, search_depth: 'basic', max_results: 5 });
      const sources = deduplicateAndRankEvidence([{ query: question, results: search.results }], 5).filter(s => {
        try { const u = new URL(s.original_url); return !u.username && !u.password; } catch { return false; }
      });
      if (!sources.length) throw new JudgeError('No usable evidence was found. This attempt used one shared action.', 502);
      const result = await synthesizeResearchAnswer(question, sources);
      return studentResponse({ question, answer: result.output, sources, remaining: reservation.remaining, prepared: false });
    }
    const result = await runStudentAnalysis(project!, action!, papers!, question);
    const ids = papers!.map(p => p.id), basis = inputBasis(project!, action!, ids, action === 'ask' ? question : '');
    const analysis = { key: createHash('sha256').update(basis).digest('hex'), basis, action, paperIds: ids, question: action === 'ask' ? question : '', createdAt: new Date().toISOString(), output: result.output };
    return studentResponse({ analysis, remaining: reservation.remaining, prepared: false });
  } catch (e) {
    const message = e instanceof JudgeError ? e.message : 'Live analysis could not finish. No answer was fabricated.';
    return studentResponse({ error: message + (reserved ? ' The reserved action remains counted; no automatic retry was made.' : '') }, e instanceof JudgeError ? e.status : 502);
  }
}
