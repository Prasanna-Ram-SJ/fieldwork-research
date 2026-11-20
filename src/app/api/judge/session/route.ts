import { NextRequest, NextResponse } from 'next/server';
import { JUDGE_COOKIE, JudgeError, judgeStatus, checkCodeAttempt, issueJudgeSession } from '@/lib/judge/access';
import { readStudentBody } from '@/lib/student/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function response(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function GET(request: NextRequest) {
  try { return response(await judgeStatus(request.cookies.get(JUDGE_COOKIE)?.value)); }
  catch (e) { return response({ error: e instanceof JudgeError ? e.message : 'Judge access is unavailable.' }, 503); }
}
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new JudgeError('Request origin not allowed.');
    let body; try { body = await readStudentBody(request, 500); } catch { throw new JudgeError('Enter only your judge code.', 400); }
    await checkCodeAttempt();
    const session = issueJudgeSession(body.code);
    const result = response(await judgeStatus(session.token));
    result.cookies.set(JUDGE_COOKIE, session.token, { httpOnly: true, sameSite: 'strict', secure: new URL(request.url).protocol === 'https:', path: '/api/judge', maxAge: Math.floor((session.expiry - Date.now()) / 1000) });
    return result;
  } catch (e) { return response({ error: e instanceof JudgeError ? e.message : 'Judge access is unavailable.' }, e instanceof JudgeError ? e.status : 503); }
}
export async function DELETE(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return response({ error: 'Request origin not allowed.' }, 403);
  const result = response({ unlocked: false }); result.cookies.set(JUDGE_COOKIE, '', { maxAge: 0, path: '/api/judge' }); return result;
}
