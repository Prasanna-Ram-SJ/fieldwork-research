import type { NextRequest } from 'next/server';
import { studentSession, studentResponse, studentFailure, readStudentBody } from '@/lib/student/http';
import { validateProject } from '@/lib/student/validation';
import { PROJECT_PREFIX } from '@/lib/student/types';
export async function GET(request: NextRequest) {
  try {
    const { db, user } = await studentSession();
    const params = request.nextUrl.searchParams;
    const search = (params.get('q') || '').trim().slice(0, 180);
    const offset = Math.max(0, Math.min(100000, Number(params.get('offset')) || 0));
    let query = db.from('messages').select('conversation_id,summary:content->summary').eq('user_id', user.id).eq('content->>kind', 'student_project');
    if (search) query = query.ilike('content->project->>title', '%' + search.replace(/[\\%_]/g, '\\$&') + '%');
    const { data, error } = await query.order('created_at', { ascending: false }).range(offset, offset + 49);
    if (error) throw error;
    return studentResponse({ projects: (data || []).map(r => ({ id: r.conversation_id, ...(r.summary as { title: string; question: string; updatedAt: string; papers: number }) })), more: data?.length === 50 });
  } catch (e) { return studentFailure(e); }
}
export async function POST(request: NextRequest) {
  try {
    const { db, user } = await studentSession(request), raw = await readStudentBody(request), project = validateProject(raw);
    const id = crypto.randomUUID();
    const { error } = await db.from('conversations').insert({ id, user_id: user.id, title: PROJECT_PREFIX + id });
    if (error) throw error;
    project.id = id;
    project.revision = 1;
    const summary = { title: project.title, question: project.question, updatedAt: project.updatedAt, papers: project.papers.length };
    const { error: writeError } = await db.from('messages').insert({ conversation_id: id, user_id: user.id, role: 'user', content: { kind: 'student_project', revision: 1, summary, project } });
    if (writeError) { await db.from('conversations').delete().eq('id', id).eq('user_id', user.id); throw writeError; }
    return studentResponse({ project }, 201);
  } catch (e) { return studentFailure(e); }
}
