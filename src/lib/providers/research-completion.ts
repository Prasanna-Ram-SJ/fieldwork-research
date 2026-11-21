import type OpenAI from 'openai';
import type { RequestOptions } from 'openai/core';
import type { ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import type { Stream } from 'openai/streaming';

/** Stream at the provider boundary; expose only a completed answer to the
 * existing JSON/evidence validators. Never retain reasoning_content. */
export async function completeResearch(
  client: OpenAI,
  request: ChatCompletionCreateParamsNonStreaming,
  options: RequestOptions = {},
): Promise<ChatCompletion> {
  if (request.n && request.n !== 1) throw Error('Research expects a single completion.');
  const controller = new AbortController();
  const deadline = options.timeout ?? client.timeout;
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (options.signal?.aborted) controller.abort();
  // The SDK's fetch timeout ends at response headers. This deadline also
  // covers consumption of the response body, including a stalled stream.
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, deadline);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      const error = new Error(timedOut ? 'The research model exceeded its response deadline.' : 'Research inference was cancelled.');
      error.name = timedOut ? 'APIConnectionTimeoutError' : 'AbortError';
      reject(error);
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  let stream: Stream<ChatCompletionChunk> | undefined;
  let iterator: AsyncIterator<ChatCompletionChunk> | undefined;
  let finished = false;
  try {
    if (controller.signal.aborted) throw Object.assign(new Error('Research inference was cancelled.'), { name: 'AbortError' });
    stream = await Promise.race([client.chat.completions.create({
      ...request, stream: true, stream_options: { include_usage: true },
    }, { ...options, signal: controller.signal, maxRetries: 0 }), aborted]);
    iterator = stream[Symbol.asyncIterator]();
    let content = '', refusal = '', contentBytes = 0;
    let finishReason: ChatCompletion.Choice['finish_reason'] | null = null;
    let usage: ChatCompletion['usage'];
    let id = '', model = request.model, created = 0;
    while (true) {
      const next = await Promise.race([iterator.next(), aborted]);
      if (next.done) break;
      const chunk = next.value;
      id = chunk.id || id; model = chunk.model || model; created = chunk.created || created;
      if (chunk.usage) usage = chunk.usage;
      const choice = chunk.choices?.find(c => c.index === 0);
      if (!choice) continue; // The final usage chunk legitimately has no choices.
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const text = choice.delta?.content, denied = choice.delta?.refusal;
      if (typeof text === 'string') { contentBytes += Buffer.byteLength(text); content += text; }
      if (typeof denied === 'string') { contentBytes += Buffer.byteLength(denied); refusal += denied; }
      if (contentBytes > 262144) throw Error('The research response exceeded its safe size.');
    }
    if (!finishReason) throw Object.assign(new Error('The research stream ended before completion.'), { name: 'APIConnectionError' });
    finished = true;
    return { id, model, created, object: 'chat.completion', choices: [{ index: 0, finish_reason: finishReason, logprobs: null,
      message: { role: 'assistant', content: content || null, refusal: refusal || null },
    }], ...(usage ? { usage } : {}) };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
    controller.signal.removeEventListener('abort', onAbort);
    if (!finished) {
      controller.abort();
      stream?.controller.abort();
      // Do not await a stuck iterator while attempting to cancel it.
      void iterator?.return?.().catch(() => {});
    }
  }
}
