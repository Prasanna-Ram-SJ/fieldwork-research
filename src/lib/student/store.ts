import type { SupabaseClient } from '@supabase/supabase-js';
import { PROJECT_PREFIX, type StudentProject } from './types';
export class ProjectError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function loadProject(db: SupabaseClient, userId: string, id: string) {
  const { data: conversation, error: conversationError } = await db.from('conversations').select('id,title').eq('id', id).eq('user_id', userId).is('deleted_at', null).single();
  if (conversationError || !conversation?.title.startsWith(PROJECT_PREFIX)) throw new ProjectError('Project not found.', 404);
  const { data, error } = await db.from('messages').select('id,content').eq('conversation_id', id).eq('user_id', userId).eq('content->>kind', 'student_project').single();
  if (error || !data?.content?.project) throw new ProjectError('The project could not be loaded.', 503);
  return { messageId: data.id as string, project: data.content.project as StudentProject };
}
export async function saveProject(db: SupabaseClient, userId: string, messageId: string, project: StudentProject, revision: number) {
  const next = { ...project, revision: revision + 1, updatedAt: new Date().toISOString(), analyses: project.analyses.slice(-18) };
  const summary = { title: next.title, question: next.question, updatedAt: next.updatedAt, papers: next.papers.length };
  const content = { kind: 'student_project', revision: next.revision, summary, project: next };
  if (Buffer.byteLength(JSON.stringify(content)) > 2200000) throw new ProjectError('Project storage is full. Export your work and start another project.');
  const { data, error } = await db.from('messages').update({ content }).eq('id', messageId).eq('user_id', userId).eq('content->>revision', String(revision)).select('id');
  if (error) throw new ProjectError('Project could not be saved. Please try again.', 503);
  if (!data?.length) throw new ProjectError('This project changed in another tab. Reload it before saving.', 409);
  await db.from('conversations').update({ updated_at: next.updatedAt, last_message_at: next.updatedAt }).eq('id', next.id).eq('user_id', userId);
  return next;
}
