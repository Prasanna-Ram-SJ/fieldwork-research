/**
 * Research trace event types and streaming payloads
 * Based on TECHNICAL_REQUIREMENTS.md and APP_FLOW.md
 */

import { AnswerBlock, QueryPlan, ResearchRunStatus, Source, SourceReading, ResearchReport } from './database';

export type SSEEventType =
  | 'run_started'
  | 'planning_started'
  | 'queries_planned'
  | 'search_started'
  | 'search_completed'
  | 'sources_reading_started'
  | 'source_read'
  | 'coverage_checked'
  | 'sources_reused'
  | 'refinement_started'
  | 'evidence_selected'
  | 'synthesis_started'
  | 'verification_started'
  | 'answer_completed'
  | 'insufficient_evidence'
  | 'provider_error'
  | 'quota_exhausted';

export interface SSETraceEvent {
  research_run_id: string;
  sequence: number;
  timestamp: string;
  type: SSEEventType;
  payload: Record<string, any>;
}

export interface ResearchRequestBody {
  conversation_id: string;
  question: string;
}

export interface TavilySearchResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string;
  raw_content?: string | null;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResultItem[];
  response_time?: number;
}

export interface NormalizedEvidence {
  source_ref: string;
  title: string;
  original_url: string;
  canonical_url: string;
  domain: string;
  published_at: string | null;
  snippet: string;
  score: number | null;
  query_text: string;
  selected: boolean;
  reading?: SourceReading;
  original_text?: string;
}

export interface SynthesisOutput {
  blocks: AnswerBlock[];
  uncertainty_note?: string;
  evidence_status: 'supported' | 'limited' | 'conflicting' | 'insufficient';
  report?: ResearchReport;
}
