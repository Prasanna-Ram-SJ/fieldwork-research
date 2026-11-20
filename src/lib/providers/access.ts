/** Live provider access stays disabled until the owner explicitly authorizes it. */
export function assertProviderRequestsEnabled(): void {
  if (process.env.PROVIDER_REQUESTS_ENABLED !== 'true') {
    throw new Error('Live research is paused by the project owner. No provider request was made.');
  }
}
