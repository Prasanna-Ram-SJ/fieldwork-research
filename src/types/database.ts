/**
 * Database schema and application data models
 * Based on BACKEND_SCHEMA.md
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ResearchRunStatus =
  | 'queued'
  | 'planning'
  | 'searching'
  | 'evaluating'
  | 'refining'
  | 'synthesizing'
  | 'completed'
  | 'insufficient_evidence'
  | 'failed'
  | 'quota_exhausted'
  | 'cancelled';

export interface Profile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  deleted_at: string | null;
}

export type MessageRole = 'user' | 'assistant';

export interface AnswerBlock {
  text: string;
  source_refs: string[]; // e.g. ["S1", "S2"]
  claim_type?: 'fact' | 'inference' | 'background' | 'research_note';
  note_id?: 'status' | 'limits' | 'next_steps';
  caveat?: string;
  section?: string;
  support?: EvidenceSupport[];
}

export interface EvidenceSupport { source_ref: string; passage_id: string; quote: string }
export interface ResearchAspect { id: string; question: string }
export interface CoverageItem { aspect_id: string; status: 'addressed' | 'partial' | 'missing'; source_refs: string[]; reason: string }
export interface ReadingPassage { id: string; text: string; page?: number }
export interface SourceReading {
  source_ref: string; title: string; url: string; domain: string; published_at: string | null;
  access: 'page_text' | 'pdf_text' | 'abstract_only' | 'search_excerpt';
  passages: ReadingPassage[]; note: string; read_at: string; content_hash: string;
  truncated: boolean; page_count?: number; pages_read?: number; doi?: string;
  reused?: boolean;
}
export interface ResearchReport {
  version: 1; scope: string; plan: ResearchAspect[]; coverage: CoverageItem[];
  sources: SourceReading[]; searched_queries: string[]; searched_at: string;
  source_assessments: { source_ref: string; contribution: string; method: string; limitation: string; support: EvidenceSupport[] }[];
  followups: string[]; stop_reason: string;
}

export interface AssistantContent {
  blocks: AnswerBlock[];
  uncertainty_note?: string | null;
  summary?: string;
  evidence_status?: 'supported' | 'limited' | 'conflicting' | 'insufficient';
  report?: ResearchReport;
}

export interface UserContent {
  text: string;
}

export type MessageContent = UserContent | AssistantContent;

export interface Message {
  id: string;
  user_id: string;
  conversation_id: string;
  research_run_id: string | null;
  role: MessageRole;
  content: MessageContent;
  created_at: string;
}

export interface QueryPlan {
  queries: string[];
  is_time_sensitive: boolean;
  temporal_scope?: string;
  geographic_scope?: string;
  strategy_reason?: string;
  planning_fallback?: boolean;
  focus?: string;
  aspects?: ResearchAspect[];
  format?: 'brief' | 'report';
}

export interface ResearchRun {
  id: string;
  user_id: string;
  conversation_id: string;
  user_message_id: string | null;
  assistant_message_id: string | null;
  status: ResearchRunStatus;
  model_id: string | null;
  query_plan: QueryPlan | null;
  error_code: string | null;
  tavily_credits_actual: number;
  nebius_input_tokens: number | null;
  nebius_output_tokens: number | null;
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number | null;
}

export interface ResearchEvent {
  id: number;
  user_id: string;
  research_run_id: string;
  sequence_no: number;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface Source {
  id: string;
  user_id: string;
  research_run_id: string;
  source_ref: string; // e.g. "S1"
  original_url: string;
  canonical_url: string;
  title: string;
  domain: string;
  published_at: string | null;
  snippet: string;
  tavily_score: number | null;
  query_text: string;
  selected: boolean;
  created_at: string;
}

export interface Citation {
  id: string;
  user_id: string;
  research_run_id: string;
  message_id: string;
  source_id: string;
  claim_index: number;
  created_at: string;
}

export interface UsageEvent {
  id: number;
  user_id: string;
  research_run_id: string;
  service: 'nebius' | 'tavily';
  operation: 'planner' | 'search' | 'refinement' | 'synthesis';
  units: number;
  status: 'reserved' | 'succeeded' | 'failed' | 'released';
  provider_request_id: string | null;
  created_at: string;
}
