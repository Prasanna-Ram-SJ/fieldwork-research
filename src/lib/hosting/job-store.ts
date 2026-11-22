import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { LedgerDatabase } from '@/lib/judge/d1-ledger';
export type ResearchJob = {
    id: string;
    owner: string;
    mode: 'guest' | 'account';
    status: 'queued' | 'running' | 'completed' | 'failed';
    sealed_input: string;
    created_at: number;
    expires_at: number;
};
export type JobInput = {
    question: string;
    context: string;
    userId?: string;
    conversationId?: string;
    accessToken?: string;
};
export interface JobEnvironment {
    JUDGE_QUOTA: LedgerDatabase;
    RESEARCH_RUNNER: {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(request: Request): Promise<Response> };
    };
    RESEARCH_JOBS: {
        send(body: {
            id: string;
        }): Promise<void>;
    };
}
export class JobError extends Error {
    constructor(message: string, public status = 503) { super(message); }
}
export const validJobId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
function secret() { const s = process.env.GUEST_SESSION_SECRET || process.env.JUDGE_SESSION_SECRET || ''; if (s.length < 32)
    throw new JobError('Research storage is not configured.'); return s; }
export function ownerHash(id: string) { return createHmac('sha256', secret()).update('research-owner:v1:' + id).digest('base64url'); }
export function sealInput(input: JobInput) { const key = createHash('sha256').update('research-job-encryption:v1:' + secret()).digest(), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(Buffer.from(JSON.stringify(input), 'utf8')), cipher.final(), cipher.getAuthTag()]).toString('base64url'); }
export function openInput(value: string): JobInput { const bytes = Buffer.from(value, 'base64url'), key = createHash('sha256').update('research-job-encryption:v1:' + secret()).digest(), decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(-16)); return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString()); }
export function readTicket(job: Pick<ResearchJob, 'id' | 'owner' | 'expires_at'>) { return createHmac('sha256', secret()).update(`research-read:v1:${job.id}:${job.owner}:${job.expires_at}`).digest('base64url'); }
export function hasTicket(job: ResearchJob, value?: string) { if (!value || job.expires_at <= Date.now())
    return false; const expected = Buffer.from(readTicket(job)), given = Buffer.from(value); return expected.length === given.length && timingSafeEqual(expected, given); }
export async function createJob(db: LedgerDatabase, id: string, owner: string, mode: ResearchJob['mode'], input: JobInput) { const now = Date.now(), expires = now + 15 * 60000; await db.prepare('INSERT INTO research_jobs(id,owner,mode,status,sealed_input,created_at,expires_at) VALUES(?,?,?,\'queued\',?,?,?)').bind(id, owner, mode, sealInput(input), now, expires).run(); return { id, owner, mode, status: 'queued' as const, sealed_input: '', created_at: now, expires_at: expires }; }
export async function getJob(db: LedgerDatabase, id: string) { return db.prepare('SELECT * FROM research_jobs WHERE id=?').bind(id).first<ResearchJob>(); }
export async function claimJob(db: LedgerDatabase, id: string) { const result = await db.prepare("UPDATE research_jobs SET status='running' WHERE id=? AND status='queued' AND expires_at>?").bind(id, Date.now()).run(); return result.meta.changes === 1; }
export function queueSignature(id:string,time:number){return createHmac('sha256',secret()).update(`research-queue:v1:${id}:${time}`).digest('base64url');}
export function validQueueSignature(id:string,time:number,value:string){if(!validJobId(id)||!Number.isSafeInteger(time)||Math.abs(Date.now()-time)>30000)return false;const a=Buffer.from(queueSignature(id,time)),b=Buffer.from(value);return a.length===b.length&&timingSafeEqual(a,b);}

/** Runs outside the research isolate, so a runtime eviction cannot leave a
 * claimed job spinning indefinitely. Never retries or alters quota holds. */
export async function failInterruptedJob(database: LedgerDatabase, id: string) {
    const db = database.withSession?.('first-primary') || database;
    const changed = await db.prepare("UPDATE research_jobs SET status='failed',sealed_input='' WHERE id=? AND status IN ('queued','running')").bind(id).run();
    if (changed.meta.changes !== 1) return;
    const row = await db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM research_job_events WHERE job_id=?').bind(id).first<{next:number}>();
    const sequence = row?.next || 1;
    const frame = JSON.stringify({research_run_id:id,sequence,timestamp:new Date().toISOString(),type:'provider_error',payload:{message:'Background research was interrupted by the hosting runtime. No automatic provider retry was made.'}});
    await db.prepare('INSERT INTO research_job_events(job_id,sequence,frame) VALUES(?,?,?)').bind(id,sequence,frame).run();
}
