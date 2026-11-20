import { TavilySearchResponse } from '@/types/research';
import { assertProviderRequestsEnabled } from './access';
import { providerFetch } from './request-budget';

export interface TavilySearchParams {
  query: string;
  topic?: 'general' | 'news';
  search_depth?: 'basic' | 'advanced';
  max_results?: number;
  chunks_per_source?: number;
  time_range?: 'day' | 'week' | 'month' | 'year';
  include_raw_content?: boolean;
}

export class TavilyError extends Error {
  statusCode: number;
  errorCode: string;

  constructor(message: string, statusCode: number, errorCode: string) {
    super(message);
    this.name = 'TavilyError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export async function searchTavily(
  params: TavilySearchParams,
  apiKey?: string
): Promise<TavilySearchResponse & { creditsUsed: number }> {
  assertProviderRequestsEnabled();
  const key = apiKey || process.env.TAVILY_API_KEY;

  if (!key) {
    throw new TavilyError(
      'Tavily API key is not configured on the server.',
      401,
      'missing_tavily_api_key'
    );
  }

  const payload = {
    query: params.query.trim(),
    search_depth: params.search_depth || 'basic',
    topic: params.topic || 'general',
    max_results: params.max_results || 8,
    chunks_per_source: params.chunks_per_source || 3,
    include_answer: false,
    include_raw_content: params.include_raw_content ? 'text' : false,
    include_usage: true,
    ...(params.time_range ? { time_range: params.time_range } : {}),
  };

  const response = await providerFetch('tavily','https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const status = response.status;
    let errorMessage = `Tavily Search failed with status ${status}`;
    let errorCode = 'tavily_search_error';

    try {
      const errorBody = await response.json();
      if (errorBody && (errorBody.error || errorBody.message || errorBody.detail)) {
        errorMessage = errorBody.error || errorBody.message || errorBody.detail;
      }
    } catch {
      // Non-JSON error body
    }

    if (status === 401) {
      errorCode = 'tavily_auth_failure';
      errorMessage = 'Invalid or expired Tavily API key.';
    } else if (status === 429) {
      errorCode = 'tavily_rate_limit';
      errorMessage = 'Tavily rate limit exceeded. Please wait a moment before retrying.';
    } else if (status === 432 || status === 402 || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('credit')) {
      errorCode = 'tavily_quota_exhausted';
      errorMessage = 'Tavily search credit allowance exhausted.';
    }

    throw new TavilyError(errorMessage, status, errorCode);
  }

  const data = await response.json();

  // Basic search costs 1 credit
  const creditsUsed = typeof data.usage?.credits === 'number' ? data.usage.credits : 1;

  return {
    query: data.query || params.query,
    results: (data.results || []).map((r: any) => ({
      title: r.title || 'Untitled Source',
      url: r.url,
      content: r.content || '',
      score: typeof r.score === 'number' ? r.score : null,
      published_date: r.published_date || null,
      raw_content: params.include_raw_content && typeof r.raw_content === 'string' ? r.raw_content.slice(0,100000) : null,
    })),
    response_time: data.response_time,
    creditsUsed,
  };
}
