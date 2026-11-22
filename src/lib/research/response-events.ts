import type { SSETraceEvent } from '@/types/research';
const terminal = new Set(['answer_completed', 'provider_error', 'quota_exhausted', 'insufficient_evidence']);
function wait(ms: number, signal: AbortSignal) { return new Promise<void>((resolve, reject) => { const abort = () => { clearTimeout(timer); reject(new DOMException('Research progress cancelled.', 'AbortError')); }; const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted)
    abort(); }); }
/** Local development keeps SSE; hosted research uses short, authorized reads
 * while the queue consumer works. A progress-read retry never starts research. */
export async function* researchResponseEvents(response: Response, signal: AbortSignal): AsyncGenerator<SSETraceEvent> {
    if (response.status === 202) {
        const accepted = await response.json(), path = accepted.poll_url;
        if (typeof path !== 'string' || !/^\/api\/(?:guest\/research|research)\/jobs\/[a-f0-9-]{36}$/.test(path))
            throw Error('Invalid research progress address.');
        let cursor = 0, failures = 0;
        const deadline = Date.now() + 15 * 60000;
        while (Date.now() < deadline) {
            let result: Response;
            try {
                result = await fetch(`${path}?after=${cursor}`, { signal, cache: 'no-store' });
            }
            catch (error) {
                if (signal.aborted || ++failures > 2)
                    throw error;
                await wait(1200, signal);
                continue;
            }
            if (!result.ok) {
                if (result.status >= 500 && ++failures <= 2) {
                    await wait(1200, signal);
                    continue;
                }
                let message = 'Research progress could not be read. No research retry was made.';
                try {
                    message = (await result.json()).error || message;
                }
                catch { }
                throw Error(message);
            }
            let data;
            try {
                data = await result.json();
            }
            catch (error) {
                if (++failures > 2)
                    throw error;
                await wait(1200, signal);
                continue;
            }
            failures = 0;
            if (!Array.isArray(data.entries))
                throw Error('Invalid research progress response.');
            for (const item of data.entries) {
                if (!Number.isSafeInteger(item.cursor) || item.cursor <= cursor || !item.event?.type)
                    throw Error('Invalid research progress sequence.');
                cursor = item.cursor;
                yield item.event;
                if (terminal.has(item.event.type))
                    return;
            }
            if (['completed', 'failed'].includes(data.status) && !data.entries.length)
                throw Error('Background research ended without a saved result. No automatic retry was made.');
            await wait(data.entries.length === 20 ? 0 : 1800, signal);
        }
        throw Error('The research job reached its time limit. No automatic retry was made.');
    }
    if (!response.headers.get('Content-Type')?.includes('text/event-stream'))
        throw Error('The research service returned an unexpected response. No automatic retry was made.');
    if (!response.body)
        throw Error('The research stream was unavailable.');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '';
    try {
        for (;;) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) >= 0) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const line = frame.split('\n').find(l => l.startsWith('data: '));
                if (line)
                    yield JSON.parse(line.slice(6));
            }
            if (done)
                break;
        }
    }
    finally {
        reader.releaseLock();
    }
}
