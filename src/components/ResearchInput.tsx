'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';

interface ResearchInputProps {
  onSubmit: (question: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  initialDraft?: string;
  onDraftChange?: (draft: string) => void;
  showPresets?: boolean;
}

const EXAMPLE_QUESTIONS = [
  'What are the key differences between Llama 3.1 70B and Llama 3.3 70B?',
  'What recent breakthroughs occurred in solid-state battery commercialization in 2026?',
  'What are the legal status and key provisions of the EU AI Act enforcement timeline?',
  'How do modern open-source reasoning models compare on ARC-AGI benchmarks?',
];

export function ResearchInput({
  onSubmit,
  isLoading,
  disabled = false,
  initialDraft = '',
  onDraftChange,
  showPresets = false,
}: ResearchInputProps) {
  const [question, setQuestion] = useState(initialDraft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync draft
  useEffect(() => {
    if (initialDraft && initialDraft !== question) {
      setQuestion(initialDraft);
    }
  }, [initialDraft]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [question]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setQuestion(val);
    if (onDraftChange) onDraftChange(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = question.trim();
    if (!trimmed || isLoading || disabled) return;
    onSubmit(trimmed);
    setQuestion('');
    if (onDraftChange) onDraftChange('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSelectPreset = (preset: string) => {
    setQuestion(preset);
    if (onDraftChange) onDraftChange(preset);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Preset factual query pills */}
      {showPresets && !question && (
        <div className="space-y-1.5 animate-fadeIn">
          <div className="flex items-center space-x-1.5 text-xs text-muted font-mono">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span>Sample factual research questions:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXAMPLE_QUESTIONS.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectPreset(q)}
                className="interactive-btn text-left p-2.5 rounded-xl bg-surface border border-surface-border text-xs text-muted hover:text-ink hover:border-accent/40 hover:bg-surface-elevated transition-all line-clamp-2 cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main input container */}
      <div className="relative rounded-2xl bg-surface border border-surface-border focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/40 shadow-lg transition-all p-3">
        <textarea
          ref={textareaRef}
          value={question}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading || disabled}
          placeholder="Ask a research question... (e.g. 'What are the verified claims regarding...')"
          rows={2}
          aria-label="Research question"
          className="w-full bg-transparent text-ink placeholder:text-muted/60 text-sm focus:outline-none resize-none pr-12 leading-relaxed"
        />

        {/* Submit button */}
        <div className="absolute right-3 bottom-3 flex items-center space-x-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!question.trim() || isLoading || disabled}
            aria-label="Send research question"
            className="interactive-btn w-8 h-8 rounded-xl bg-accent text-accent-ink flex items-center justify-center hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow"
          >
            {isLoading ? (
              <span className="w-3.5 h-3.5 border-2 border-accent-ink border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted font-mono px-1">
        <span>Enter to search · Shift+Enter for newline</span>
        <span>Tavily Web Search + Nebius Token Factory</span>
      </div>
    </div>
  );
}
