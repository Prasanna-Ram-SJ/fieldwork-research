'use client';

import { useState } from 'react';
import { AssistantContent, Source } from '@/types/database';
import {
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Info,
  Calendar,
  Globe,
  FileText,
  CheckCircle,
} from 'lucide-react';

interface AnswerViewProps {
  content: AssistantContent;
  sources: Source[];
  createdAt?: string;
}

export function AnswerView({ content, sources, createdAt }: AnswerViewProps) {
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null);

  // Map sources by source_ref (e.g. "S1" -> Source)
  const sourceMap = new Map<string, Source>();
  sources.forEach((s) => sourceMap.set(s.source_ref, s));

  const handleCitationClick = (ref: string) => {
    setHighlightedRef(ref);
    const element = document.getElementById(`source-card-${ref}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const isLimited = content.evidence_status === 'limited';
  const isConflicting = content.evidence_status === 'conflicting';
  const isInsufficient = content.evidence_status === 'insufficient';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Evidence Status Banner if limited or conflicting */}
      {isConflicting && (
        <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs space-y-1">
          <div className="font-semibold flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4" />
            <span>Conflicting Evidence Detected</span>
          </div>
          <p className="text-ink/90 leading-relaxed">
            {content.uncertainty_note ||
              'Retrieved web sources report differing factual claims or dates. Both viewpoints are detailed below with their respective citations.'}
          </p>
        </div>
      )}

      {isLimited && (
        <div className="p-3.5 rounded-xl bg-info/10 border border-info/30 text-info text-xs space-y-1">
          <div className="font-semibold flex items-center space-x-1.5">
            <Info className="w-4 h-4" />
            <span>Limited Evidence Caveat</span>
          </div>
          <p className="text-ink/90 leading-relaxed">
            {content.uncertainty_note ||
              'Only a single authoritative web source was available for this query. Independent confirmation could not be verified from additional publishers.'}
          </p>
        </div>
      )}

      {isInsufficient && (
        <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs space-y-1">
          <div className="font-semibold flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4" />
            <span>Insufficient Evidence to Form a Reliable Answer</span>
          </div>
          <p className="text-ink/90 leading-relaxed">
            {content.uncertainty_note ||
              'Public web search did not return sufficient verifiable evidence to substantiate an answer. Operational queries were attempted as documented in the trace above.'}
          </p>
        </div>
      )}

      {/* Answer Blocks */}
      <div className="space-y-4">
        {content.blocks?.map((block, idx) => {
          return (
            <div key={idx} className="space-y-2">
              <div className="text-sm md:text-base leading-relaxed text-ink/95">
                {block.text}

                {/* Inline Citations */}
                {block.source_refs && block.source_refs.length > 0 && (
                  <span className="inline-flex items-center space-x-1 ml-1.5 select-none align-baseline">
                    {block.source_refs.map((ref) => {
                      const source = sourceMap.get(ref);
                      const isHighlighted = highlightedRef === ref;

                      return (
                        <button
                          key={ref}
                          type="button"
                          onClick={() => handleCitationClick(ref)}
                          title={source ? `${source.title} (${source.domain})` : `Source ${ref}`}
                          className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium transition-all cursor-pointer ${
                            isHighlighted
                              ? 'bg-accent text-accent-ink ring-2 ring-accent shadow'
                              : 'bg-surface-elevated text-accent hover:bg-accent/20 border border-surface-border'
                          }`}
                        >
                          [{ref}]
                        </button>
                      );
                    })}
                  </span>
                )}
              </div>

              {/* Claim classification badge & caveat if present */}
              {(block.claim_type === 'inference' || block.caveat) && (
                <div className="flex items-center space-x-2 text-[11px] font-mono text-muted pl-2 border-l-2 border-surface-border">
                  {block.claim_type === 'inference' && (
                    <span className="text-muted-light">Inference / Deductive synthesis</span>
                  )}
                  {block.caveat && (
                    <span className="text-warning">Note: {block.caveat}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Uncertainty note if present and not already shown */}
      {content.uncertainty_note && !isConflicting && !isLimited && !isInsufficient && (
        <div className="p-3 rounded-lg bg-surface border border-surface-border text-xs text-muted space-y-1">
          <div className="text-ink font-medium flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-accent" />
            <span>Research Note</span>
          </div>
          <p className="leading-relaxed">{content.uncertainty_note}</p>
        </div>
      )}

      {/* Verified Sources List */}
      {sources.length > 0 && (
        <div className="pt-6 border-t border-surface-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-accent" />
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-ink">
                Verified Web Sources ({sources.length})
              </h3>
            </div>
            <span className="text-[11px] font-mono text-muted">
              Retrieved via Tavily Search
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {sources.map((src) => {
              const isHighlighted = highlightedRef === src.source_ref;

              return (
                <div
                  key={src.id || src.source_ref}
                  id={`source-card-${src.source_ref}`}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isHighlighted
                      ? 'bg-surface-elevated border-accent ring-1 ring-accent/50 shadow-md'
                      : 'bg-surface border-surface-border hover:border-surface-border/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-accent/15 text-accent border border-accent/30 flex-shrink-0">
                        {src.source_ref}
                      </span>
                      <h4 className="text-xs font-medium text-ink truncate" title={src.title}>
                        {src.title}
                      </h4>
                    </div>

                    <a
                      href={src.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="interactive-btn flex items-center space-x-1 text-[11px] font-mono text-accent hover:text-accent-hover flex-shrink-0 ml-2"
                    >
                      <span>Open source</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {/* Domain & Published date */}
                  <div className="flex items-center space-x-3 text-[11px] font-mono text-muted mt-1.5">
                    <span className="flex items-center space-x-1">
                      <Globe className="w-3 h-3" />
                      <span>{src.domain}</span>
                    </span>

                    {src.published_at && (
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(src.published_at).toLocaleDateString()}</span>
                      </span>
                    )}

                    {src.tavily_score && (
                      <span className="text-muted/60">
                        Relevance: {(src.tavily_score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>

                  {/* Evidence snippet excerpt */}
                  <p className="text-xs text-muted-light mt-2 line-clamp-3 leading-relaxed pl-2 border-l border-surface-border bg-surface-elevated/20 p-1.5 rounded-r">
                    "{src.snippet}"
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
