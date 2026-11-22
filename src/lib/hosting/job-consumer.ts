import { claimJob, getJob, openInput, type JobEnvironment } from './job-store';
import { withProviderBudget } from '@/lib/providers/request-budget';
import { reserveGuestProvider, settleGuestProvider } from '@/lib/guest/access';
import type { SSETraceEvent } from '@/types/research';
export async function consumeResearchJobs(batch: {
    messages: {
        body: {
            id: string;
        };
        ack(): void;
    }[];
}, env: JobEnvironment) {
    const db = env.JUDGE_QUOTA.withSession?.('first-primary') || env.JUDGE_QUOTA;
    // Expire only job payloads/results; quota reservations are never deleted.
    await db.prepare('DELETE FROM research_jobs WHERE id IN (SELECT id FROM research_jobs WHERE expires_at<? ORDER BY expires_at LIMIT 100)').bind(Date.now()).run();
    for (const message of batch.messages) {
        const id = message.body?.id;
        message.ack(); // Delivery must never automatically repeat paid inference.
        if (typeof id !== 'string' || !await claimJob(db, id))
            continue;
        let sequence = 0, terminal = false;
        const emit = async (event: SSETraceEvent) => { const frame = JSON.stringify(event); if (Buffer.byteLength(frame) > 700000 || sequence >= 100)
            throw Error('Research progress exceeded its safe size.'); await db.prepare('INSERT INTO research_job_events(job_id,sequence,frame) VALUES(?,?,?)').bind(id, ++sequence, frame).run(); if (['answer_completed', 'provider_error', 'quota_exhausted', 'insufficient_evidence'].includes(event.type))
            terminal = true; };
        try {
            const job = await getJob(db, id);
            if (!job)
                throw Error('Research job missing.');
            const input = openInput(job.sealed_input);
            if (job.mode === 'guest') {
                const { runGuestResearch } = await import('@/lib/guest/research');
                await withProviderBudget(reservation => reserveGuestProvider(db, id, reservation), () => runGuestResearch(input.question, input.context, emit), (reservation,usage)=>settleGuestProvider(db,id,reservation,usage));
            }
            else {
                const { createClient } = await import('@supabase/supabase-js');
                const { runResearchOrchestration } = await import('@/lib/research/orchestrator');
                if (!input.accessToken || !input.userId || !input.conversationId)
                    throw Error('Account research authorization missing.');
                const client = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${input.accessToken}` } }, auth: { persistSession: false, autoRefreshToken: false } });
                await runResearchOrchestration({ supabase: client, userId: input.userId, conversationId: input.conversationId, question: input.question, emitEvent: emit });
            }
            if (!terminal)
                throw Error('Research finished without a final result.');
            await db.prepare("UPDATE research_jobs SET status='completed',sealed_input='' WHERE id=?").bind(id).run();
        }
        catch {
            try {
                if (!terminal)
                    await emit({ research_run_id: id, sequence: sequence + 1, timestamp: new Date().toISOString(), type: 'provider_error', payload: { message: 'Background research could not finish. No automatic provider retry was made.' } });
            }
            finally {
                await db.prepare("UPDATE research_jobs SET status='failed',sealed_input='' WHERE id=?").bind(id).run();
            }
        }
    }
}
