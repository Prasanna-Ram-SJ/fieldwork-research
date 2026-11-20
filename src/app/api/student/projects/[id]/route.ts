import type { NextRequest } from 'next/server';
import { studentSession, studentResponse, studentFailure, readStudentBody } from '@/lib/student/http';
import { loadProject, saveProject, ProjectError } from '@/lib/student/store';
import { validateProject } from '@/lib/student/validation';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try { const { db, user } = await studentSession(), { id } = await context.params; return studentResponse({ project: (await loadProject(db, user.id, id)).project }); }
  catch (e) { return studentFailure(e); }
}
export async function PUT(request: NextRequest, context: Context) {
  try {
    const { db, user } = await studentSession(request), { id } = await context.params;
    const { project: previous, messageId } = await loadProject(db, user.id, id), raw = await readStudentBody(request);
    if (raw.revision !== previous.revision) throw new ProjectError('This project changed in another tab. Reload it before saving.', 409);
    return studentResponse({ project: await saveProject(db, user.id, messageId, validateProject(raw, previous), previous.revision) });
  } catch (e) { return studentFailure(e); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { db, user } = await studentSession(request), { id } = await context.params;
    await loadProject(db, user.id, id);
    const { error } = await db.from('conversations').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    return studentResponse({ deleted: true });
  } catch (e) { return studentFailure(e); }
}
