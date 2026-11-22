import { GUEST_COOKIE, GuestError, guestSession, guestIdentity, guestAllowance, reserveGuest } from '@/lib/guest/access';
import type { CookieOptions } from '@supabase/ssr';
import { clarificationFor } from '@/lib/research/clarify';
import { createJob, getJob, hasTicket, JobError, ownerHash, readTicket, validJobId, type JobEnvironment, type ResearchJob } from './job-store';
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
function cookies(request: Request) { return (request.headers.get('cookie') || '').split(';').flatMap(part => { const p = part.indexOf('='); return p < 0 ? [] : [{ name: part.slice(0, p).trim(), value: part.slice(p + 1).trim() }]; }); }
function cookie(request: Request, name: string) { return cookies(request).find(c => c.name === name)?.value; }
function ticketCookie(job: ResearchJob, path: string) { return `fieldwork-job-${job.id}=${readTicket(job)}; HttpOnly; Secure; SameSite=Strict; Path=${path}; Max-Age=900`; }
async function account(request: Request) { const { createServerClient, serializeCookieHeader } = await import('@supabase/ssr'); const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; if (!url || !key)
    throw new JobError('Account storage is not configured.'); const updated: string[] = []; const db = createServerClient(url, key, { cookies: { getAll: () => cookies(request), setAll: (values: {
            name: string;
            value: string;
            options: CookieOptions;
        }[]) => { for (const c of values)
            updated.push(serializeCookieHeader(c.name, c.value, { ...c.options, secure: true })); } } }); const { data: { user }, error } = await db.auth.getUser(); if (error || !user)
    throw new JobError('Please sign in to research.', 401); return { db, user, updated }; }
async function body(request: Request) { if (Number(request.headers.get('content-length')) > 40000)
    throw new JobError('Request too large.', 400); const reader = request.body?.getReader(); if (!reader)
    throw new JobError('Enter a question.', 400); const chunks: Uint8Array[] = []; let size = 0; for (;;) {
    const { value, done } = await reader.read();
    if (done)
        break;
    size += value.length;
    if (size > 40000) {
        await reader.cancel();
        throw new JobError('Request too large.', 400);
    }
    chunks.push(value);
} try {
    return JSON.parse(Buffer.concat(chunks).toString());
}
catch {
    throw new JobError('Enter a valid research request.', 400);
} }
export async function researchJobHttp(request: Request, env: JobEnvironment): Promise<Response> {
    try {
        const url = new URL(request.url), path = url.pathname, guest = path.startsWith('/api/guest/'), db = env.JUDGE_QUOTA.withSession?.('first-primary') || env.JUDGE_QUOTA;
        if(path==='/api/status'&&request.method==='GET')return json({supabase:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),nebius:Boolean(process.env.NEBIUS_API_KEY),tavily:Boolean(process.env.TAVILY_API_KEY),model:Boolean(process.env.NEBIUS_MODEL),research_enabled:process.env.PROVIDER_REQUESTS_ENABLED==='true'});
        if (path === '/api/guest/session' && request.method === 'GET') {
            const session = guestSession(cookie(request, GUEST_COOKIE), Date.now(), true), identity = guestIdentity(session.id, request.headers.get('cf-connecting-ip'));
            return json({ enabled: true, ...await guestAllowance(db, identity) }, 200, { 'Set-Cookie': `${GUEST_COOKIE}=${session.token}; HttpOnly; Secure; SameSite=Strict; Path=/api/guest; Max-Age=604800` });
        }
        const match = path.match(/^\/api\/(?:guest\/research|research)\/jobs\/([a-f0-9-]{36})$/);
        if (match && request.method === 'GET') {
            const job = await getJob(db, match[1]);
            if (!job || job.expires_at <= Date.now() || job.mode !== (guest ? 'guest' : 'account'))
                throw new JobError('This research job is unavailable or expired.', 404);
            if (!hasTicket(job, cookie(request, `fieldwork-job-${job.id}`))) {
                const owner = guest ? ownerHash(guestSession(cookie(request, GUEST_COOKIE)).id) : ownerHash((await account(request)).user.id);
                if (owner !== job.owner)
                    throw new JobError('This research job is unavailable.', 404);
            }
            const cursor = Number(url.searchParams.get('after') || 0);
            if (!Number.isSafeInteger(cursor) || cursor < 0)
                throw new JobError('Invalid progress cursor.', 400);
            const data = await db.prepare('SELECT json_group_array(json_object(\'cursor\',sequence,\'event\',json(frame))) AS entries FROM (SELECT sequence,frame FROM research_job_events WHERE job_id=? AND sequence>? ORDER BY sequence LIMIT 20)').bind(job.id, cursor).first<{
                entries: string;
            }>();
            return new Response(`{"status":${JSON.stringify(job.status)},"entries":${data?.entries || '[]'}}`, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': ticketCookie(job, path) } });
        }
        if (request.method !== 'POST' || !['/api/guest/research', '/api/research'].includes(path))
            return json({ error: 'Not found.' }, 404);
        if (request.headers.get('origin') !== url.origin)
            throw new JobError('Request origin not allowed.', 403);
        if (process.env.PROVIDER_REQUESTS_ENABLED !== 'true' || !process.env.NEBIUS_API_KEY || !process.env.NEBIUS_MODEL || !process.env.TAVILY_API_KEY)
            throw new JobError('Live research is paused or not configured.');
        if (!env.RESEARCH_JOBS)
            throw new JobError('Background research is unavailable.');
        const input = await body(request), question = typeof input.question === 'string' ? input.question.trim() : '';
        if (!question || question.length > 1000 || !validJobId(input.request_id))
            throw new JobError('Enter a valid question and request identifier.', 400);
        const clarification = clarificationFor(question);
        if (clarification && input.scope_confirmed !== true)
            return json({ error: clarification, needs_clarification: true }, 422);
        let owner: string, jobInput: {
            question: string;
            context: string;
            userId?: string;
            conversationId?: string;
            accessToken?: string;
        }, updated: string[] = [];
        if (guest) {
            const session = guestSession(cookie(request, GUEST_COOKIE));
            owner = ownerHash(session.id);
            const duplicate = await getJob(db, input.request_id);
            if (duplicate)
                throw new JobError('This request was already accepted. It will not run twice.', 409);
            await reserveGuest(db, guestIdentity(session.id, request.headers.get('cf-connecting-ip')), input.request_id);
            jobInput = { question, context: typeof input.recent_context === 'string' ? input.recent_context.slice(0, 6500) : '' };
        }
        else {
            if (typeof input.conversation_id !== 'string' || !input.conversation_id)
                throw new JobError('A conversation is required.', 400);
            const auth = await account(request);
            updated = auth.updated;
            const { data: conversation, error } = await auth.db.from('conversations').select('id,user_id').eq('id', input.conversation_id).single();
            if (error || conversation?.user_id !== auth.user.id)
                throw new JobError('Conversation not found or inaccessible.', 404);
            const { data: { session } } = await auth.db.auth.getSession();
            if (!session?.access_token)
                throw new JobError('Please sign in again.', 401);
            owner = ownerHash(auth.user.id);
            jobInput = { question, context: '', userId: auth.user.id, conversationId: conversation.id, accessToken: session.access_token };
        }
        const job = await createJob(db, input.request_id, owner, guest ? 'guest' : 'account', jobInput), poll = `${path}/jobs/${job.id}`;
        try {
            await env.RESEARCH_JOBS.send({ id: job.id });
        }
        catch {
            await db.prepare("UPDATE research_jobs SET status='failed' WHERE id=?").bind(job.id).run();
            throw new JobError('Research could not be queued. No provider request was made.');
        }
        const response = json({ job_id: job.id, poll_url: poll }, 202, { 'Set-Cookie': ticketCookie(job, poll) });
        for (const c of updated)
            response.headers.append('Set-Cookie', c);
        return response;
    }
    catch (error) {
        return json({ error: error instanceof JobError || error instanceof GuestError ? error.message : 'Research could not start. No automatic retry was made.' }, error instanceof JobError || error instanceof GuestError ? error.status : 503);
    }
}
