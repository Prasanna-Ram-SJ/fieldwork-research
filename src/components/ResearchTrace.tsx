'use client';

import { useState } from 'react';
import { SSETraceEvent } from '@/types/research';
import {
  BrainCircuit,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
} from 'lucide-react';

interface ResearchTraceProps {
  events: SSETraceEvent[];
  isActive: boolean;
  status?: string;
  elapsedMs?: number | null;
  modelId?: string | null;
}

export function ResearchTrace({
  events,
  isActive,
  status,
  elapsedMs,
  modelId = 'meta-llama/Meta-Llama-3.1-70B-Instruct',
}: ResearchTraceProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (events.length === 0 && !isActive) return null;

  // Derive current step
  const latestEvent = events[events.length - 1];
  const hasCompleted = events.some((e) => e.type === 'answer_completed');
  const hasFailed = events.some((e) => e.type === 'provider_error' || e.type === 'quota_exhausted');
  const hasInsufficientEvidence = events.some((e) => e.type === 'insufficient_evidence');

  return (
    <div className="w-full rounded-2xl bg-surface border border-surface-border overflow-hidden shadow-sm my-4 transition-all">
      {/* Header bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-3 bg-surface-elevated/40 border-b border-surface-border flex items-center justify-between cursor-pointer hover:bg-surface-elevated/60 transition-colors"
      >
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center justify-center">
            {isActive ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
              </span>
            ) : hasFailed ? (
              <AlertCircle className="w-4 h-4 text-danger" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-accent" />
            )}
          </div>

          <span className="text-xs font-mono font-medium text-ink">
            {isActive
              ? 'Live Research Activity Trace'
              : hasFailed
              ? 'Research Activity Stopped'
              : hasInsufficientEvidence
              ? 'Research Completed · Insufficient Evidence'
              : 'Verifiable Research Trace'}
          </span>

          {modelId && (
            <span className="hidden sm:inline-block text-[11px] font-mono text-muted px-2 py-0.5 rounded bg-surface border border-surface-border">
              {modelId.split('/').pop()}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3 text-xs text-muted font-mono">
          {elapsedMs && (
            <span className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>{(elapsedMs / 1000).toFixed(1)}s</span>
            </span>
          )}
          <span>{events.length} events</span>
          <button
            type="button"
            aria-label={isExpanded ? 'Collapse trace' : 'Expand trace'}
            className="p-1 hover:text-ink text-muted"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded event stream logs */}
      {isExpanded && (
        <div className="p-4 space-y-3.5 text-xs font-mono">
          {events.map((evt, idx) => {
            const isLast = idx === events.length - 1;
            return (
              <div
                key={evt.sequence || idx}
                className="flex items-start space-x-3 animate-fadeIn"
              >
                {/* Event Icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {evt.type === 'run_started' && <Layers className="w-3.5 h-3.5 text-muted" />}
                  {evt.type === 'planning_started' && <BrainCircuit className="w-3.5 h-3.5 text-accent animate-pulse" />}
                  {evt.type === 'queries_planned' && <BrainCircuit className="w-3.5 h-3.5 text-accent" />}
                  {evt.type === 'search_started' && <Search className="w-3.5 h-3.5 text-info animate-pulse" />}
                  {evt.type === 'search_completed' && <Search className="w-3.5 h-3.5 text-info" />}
                  {evt.type === 'refinement_started' && <RefreshCw className="w-3.5 h-3.5 text-warning animate-spin" />}
                  {evt.type === 'evidence_selected' && <Filter className="w-3.5 h-3.5 text-success" />}
                  {evt.type === 'synthesis_started' && <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" />}
                  {evt.type === 'answer_completed' && <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
                  {evt.type === 'insufficient_evidence' && <AlertCircle className="w-3.5 h-3.5 text-warning" />}
                  {evt.type === 'provider_error' && <AlertCircle className="w-3.5 h-3.5 text-danger" />}
                  {evt.type === 'quota_exhausted' && <AlertCircle className="w-3.5 h-3.5 text-danger" />}
                </div>

                {/* Event Description */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-ink capitalize">
                      {evt.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-muted">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Contextual event payloads */}
                  {evt.type === 'queries_planned' && (
                    <div className="mt-1 space-y-1 pl-2 border-l border-accent/40 text-muted">
                      <p className="text-[11px] text-accent/90">{evt.payload.strategy_reason}</p>
                      <ul className="list-disc list-inside space-y-0.5 text-ink">
                        {evt.payload.queries?.map((q: string, i: number) => (
                          <li key={i} className="truncate">"{q}"</li>
                        ))}
                      </ul>
                      {evt.payload.is_time_sensitive && (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-warning/20 text-warning text-[10px]">
                          Time-sensitive query
                        </span>
                      )}
                    </div>
                  )}

                  {evt.type === 'search_started' && (
                    <div className="text-muted pl-2 border-l border-info/40 text-[11px]">
                      Searching Tavily ({evt.payload.queries?.length} queries, basic depth, topic: {evt.payload.topic})...
                    </div>
                  )}

                  {evt.type === 'search_completed' && (
                    <div className="text-muted pl-2 border-l border-info/40 text-[11px]">
                      Retrieved {evt.payload.raw_results_count} results across {evt.payload.searches_count} searches.
                    </div>
                  )}

                  {evt.type === 'refinement_started' && (
                    <div className="text-warning pl-2 border-l border-warning/40 text-[11px] space-y-0.5">
                      <p>Initial evidence sparse. Refining query: "{evt.payload.refinement_query}"</p>
                      <p className="text-muted text-[10px]">Reason: {evt.payload.reason}</p>
                    </div>
                  )}

                  {evt.type === 'evidence_selected' && (
                    <div className="text-muted pl-2 border-l border-success/40 text-[11px] space-y-1">
                      <p className="text-ink font-medium">Selected {evt.payload.selected_sources_count} deduplicated web sources for synthesis:</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {evt.payload.sources?.map((s: any, idx: number) => (
                          <span
                            key={idx}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-surface border border-surface-border text-[10px]"
                          >
                            <span className="text-accent font-bold">{s.source_ref}</span>
                            <span className="text-ink max-w-[120px] truncate">{s.domain}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {evt.type === 'synthesis_started' && (
                    <div className="text-muted pl-2 border-l border-accent/40 text-[11px]">
                      Synthesizing claims with Token Factory ({evt.payload.model_id?.split('/').pop()}) using {evt.payload.evidence_count} sources...
                    </div>
                  )}

                  {evt.type === 'answer_completed' && (
                    <div className="text-success pl-2 border-l border-success/40 text-[11px] space-y-0.5">
                      <p>Synthesis complete in {(evt.payload.elapsed_ms / 1000).toFixed(1)}s.</p>
                      <p className="text-muted text-[10px]">
                        Tavily API Credits: {evt.payload.tavily_credits} · Token Factory: {evt.payload.tokens?.input + evt.payload.tokens?.output} tokens
                      </p>
                    </div>
                  )}

                  {evt.type === 'insufficient_evidence' && (
                    <div className="p-2 rounded bg-warning/10 border border-warning/30 text-warning text-[11px]">
                      {evt.payload.message}
                    </div>
                  )}

                  {(evt.type === 'provider_error' || evt.type === 'quota_exhausted') && (
                    <div className="p-2 rounded bg-danger/10 border border-danger/30 text-danger text-[11px] space-y-1">
                      <p className="font-semibold">{evt.payload.message}</p>
                      {evt.payload.setup_required && (
                        <p className="text-muted text-[10px]">Configure your credentials in .env.local to proceed.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
