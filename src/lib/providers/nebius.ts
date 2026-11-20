import OpenAI from 'openai';
import { assertProviderRequestsEnabled } from './access';
import { KIMI_RESEARCH_MODEL } from './nebius-research';
import { providerFetch } from './request-budget';

export interface NebiusConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export function getNebiusConfig(): NebiusConfig | null {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey || !process.env.NEBIUS_MODEL) {
    return null;
  }

  return {
    apiKey,
    baseURL: process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1',
    model: process.env.NEBIUS_MODEL,
  };
}

export function createNebiusClient(config: NebiusConfig): OpenAI {
  assertProviderRequestsEnabled();
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    // OpenAI v4's Node shim uses node-fetch/agentkeepalive, which fails in
    // workerd before any request is sent. Always use the host's native fetch.
    fetch: (url, init) => providerFetch('nebius',url as RequestInfo,init as RequestInit),
    timeout: config.model === KIMI_RESEARCH_MODEL ? 180000 : 60000,
    maxRetries: 0,
  });
}
