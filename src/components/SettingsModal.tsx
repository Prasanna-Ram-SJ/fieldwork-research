'use client';

import { useState, useEffect } from 'react';
import { X, Shield, Cpu, Globe, Database, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

export function SettingsModal({ isOpen, onClose, onSignOut }: SettingsModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    fetch('/api/user/usage')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load user settings:', err);
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const usage = data?.usage || {
    daily_turns_used: 0,
    daily_turns_limit: 5,
    monthly_credits_used: 0,
    monthly_credits_limit: 800,
  };

  const providers = data?.providers || {
    nebius_configured: false,
    nebius_model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
    tavily_configured: false,
  };

  const user = data?.user || {
    email: 'Loading...',
    display_name: 'Researcher',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="w-full max-w-lg bg-surface border border-surface-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="h-14 border-b border-surface-border px-6 flex items-center justify-between bg-surface-elevated/40">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-accent" />
            <h2 id="settings-title" className="text-sm font-semibold tracking-tight text-ink">
              Settings & Research Budget
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="interactive-btn p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-elevated cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Account Card */}
          <div className="p-4 rounded-xl bg-surface-elevated/60 border border-surface-border space-y-1">
            <span className="text-[11px] font-mono text-muted uppercase tracking-wider">
              Signed-in Identity
            </span>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">{user.display_name}</p>
                <p className="text-xs text-muted font-mono">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="interactive-btn px-3 py-1.5 text-xs text-danger font-medium rounded-lg bg-danger-surface hover:bg-danger/20 border border-danger-border flex items-center space-x-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </div>

          {/* Usage & Budget Meters */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted uppercase tracking-wider">
                Operating Limits (Zero-Cost Cap)
              </span>
              <span className="text-[11px] font-mono text-accent">Active Caps</span>
            </div>

            {/* Daily user turns meter */}
            <div className="p-4 rounded-xl bg-surface border border-surface-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink font-medium">Daily Research Turns</span>
                <span className="font-mono text-muted">
                  <span className="text-accent font-semibold">{usage.daily_turns_used}</span> / {usage.daily_turns_limit} turns
                </span>
              </div>
              <div className="w-full bg-surface-elevated rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (usage.daily_turns_used / usage.daily_turns_limit) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-muted">
                Per-user limit of 5 turns per UTC day. Resets at midnight (00:00 UTC).
              </p>
            </div>

            {/* Monthly Tavily credits meter */}
            <div className="p-4 rounded-xl bg-surface border border-surface-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink font-medium">Global Tavily Monthly Search Budget</span>
                <span className="font-mono text-muted">
                  <span className="text-accent font-semibold">{usage.monthly_credits_used}</span> / {usage.monthly_credits_limit} credits
                </span>
              </div>
              <div className="w-full bg-surface-elevated rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (usage.monthly_credits_used / usage.monthly_credits_limit) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-muted">
                Enforced atomically across the application to prevent exceeding free tier limits (800 credit hard ceiling).
              </p>
            </div>
          </div>

          {/* Connected Providers */}
          <div className="space-y-3">
            <span className="text-xs font-mono text-muted uppercase tracking-wider">
              Connected Infrastructure
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Nebius */}
              <div className="p-3.5 rounded-xl bg-surface border border-surface-border space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-xs font-medium text-ink">
                    <Cpu className="w-3.5 h-3.5 text-accent" />
                    <span>Token Factory</span>
                  </div>
                  {providers.nebius_configured ? (
                    <span className="flex items-center space-x-1 text-[10px] text-success font-mono">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Ready</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-[10px] text-danger font-mono">
                      <AlertCircle className="w-3 h-3" />
                      <span>Missing Key</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono text-muted truncate" title={providers.nebius_model}>
                  {providers.nebius_model}
                </p>
              </div>

              {/* Tavily */}
              <div className="p-3.5 rounded-xl bg-surface border border-surface-border space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-xs font-medium text-ink">
                    <Globe className="w-3.5 h-3.5 text-accent" />
                    <span>Tavily Search</span>
                  </div>
                  {providers.tavily_configured ? (
                    <span className="flex items-center space-x-1 text-[10px] text-success font-mono">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Ready</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-[10px] text-danger font-mono">
                      <AlertCircle className="w-3 h-3" />
                      <span>Missing Key</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono text-muted">
                  Basic Depth · General & News
                </p>
              </div>
            </div>
          </div>

          {/* Privacy & Zero-Cost Notice */}
          <div className="p-4 rounded-xl bg-surface border border-surface-border space-y-2 text-xs text-muted">
            <div className="flex items-center space-x-1.5 text-ink font-medium">
              <Database className="w-3.5 h-3.5 text-accent" />
              <span>Data & Privacy Notice</span>
            </div>
            <p className="leading-relaxed">
              Research questions and selected web evidence are stored under your Supabase account to enable cross-device history. Queries and retrieved excerpts are sent to Nebius Token Factory and Tavily to generate answers. Secrets are never exposed.
            </p>
            <p className="leading-relaxed">
              This application operates strictly under a zero-cost limit policy. No paid billing will ever be automatically triggered.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-border bg-surface-elevated/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="interactive-btn px-4 py-2 rounded-xl bg-surface border border-surface-border hover:bg-surface-elevated text-xs font-medium text-ink cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
