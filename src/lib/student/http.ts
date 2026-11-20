import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import { ProjectError } from './store';
export async function studentSession(request?: NextRequest) {
  if (request && request.method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) throw new ProjectError('Request origin not allowed.', 403);
  const db = await createClient();
  if (!db) throw new ProjectError('Account storage is not configured.', 503);
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new ProjectError('Please sign in to open your research projects.', 401);
  return { db, user };
}
export async function readStudentBody(request: NextRequest, maxBytes = 2300000) {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new ProjectError('This request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ProjectError('No project data was provided.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new ProjectError('This request is too large.'); }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(text); } catch { throw new ProjectError('Invalid project data.'); }
}
export function studentResponse(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
export function studentFailure(error: unknown) { return studentResponse({ error: error instanceof ProjectError ? error.message : 'The project request could not finish. Please try again.' }, error instanceof ProjectError ? error.status : 500); }
