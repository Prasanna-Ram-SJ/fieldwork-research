/** Recover only temporary upstream failures, never authorization or quota denials. */
export function temporaryInferenceFailure(error: unknown): boolean {
  const value = error as { status?: number; name?: string } | null;
  return [408, 500, 502, 503, 504, 520, 522, 523, 524].includes(value?.status ?? 0)
    || ['APIConnectionError', 'APIConnectionTimeoutError'].includes(value?.name ?? '');
}

export function inferenceErrorMessage(error: unknown): string | undefined {
  const value = error as { status?: number; name?: string } | null;
  if ([408, 504, 524].includes(value?.status ?? 0) || value?.name === 'APIConnectionTimeoutError') {
    return 'The AI provider timed out before completing this step. No automatic retry was made. This is a service timeout, not a problem with your question.';
  }
  return undefined;
}
