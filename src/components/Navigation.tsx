'use client';

import { Cpu, Settings as SettingsIcon, LogOut, PanelLeft, Plus } from 'lucide-react';
import Link from 'next/link';

interface NavigationProps {
  onToggleSidebar?: () => void;
  onOpenSettings?: () => void;
  onNewResearch?: () => void;
  onSignOut?: () => void;
  dailyTurnsUsed?: number;
  dailyTurnsLimit?: number;
  userEmail?: string | null;
  userName?: string | null;
  activeModel?: string;
}

export function Navigation({
  onToggleSidebar,
  onOpenSettings,
  onNewResearch,
  onSignOut,
  dailyTurnsUsed = 0,
  dailyTurnsLimit = 5,
  userName,
  activeModel = 'Meta-Llama-3.1-70B',
}: NavigationProps) {
  return (
    <header className="h-14 border-b border-surface-border bg-background/80 backdrop-blur-md sticky top-0 z-40 px-4 flex items-center justify-between">
      {/* Left section: Sidebar toggle & Brand */}
      <div className="flex items-center space-x-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle history sidebar"
            className="interactive-btn p-2 rounded-lg text-muted hover:text-ink hover:bg-surface border border-transparent hover:border-surface-border cursor-pointer"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        <Link href="/" className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <span className="font-medium text-sm tracking-tight text-ink">Research Agent</span>
        </Link>

        {onNewResearch && (
          <button
            type="button"
            onClick={onNewResearch}
            className="interactive-btn hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-ink bg-surface hover:bg-surface-elevated border border-surface-border cursor-pointer ml-2"
          >
            <Plus className="w-3.5 h-3.5 text-accent" />
            <span>New</span>
          </button>
        )}
      </div>

      {/* Middle/Right: Model badge, Usage pill, Settings, User */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Model badge */}
        <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-surface border border-surface-border text-[11px] font-mono text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
          <span>Nebius</span>
          <span className="text-surface-border">/</span>
          <span className="text-ink max-w-[140px] truncate">{activeModel.split('/').pop()}</span>
        </div>

        {/* Daily Turn Meter Badge */}
        <div
          title={`${dailyTurnsUsed} of ${dailyTurnsLimit} research turns used today (UTC)`}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-surface border border-surface-border text-xs font-mono"
        >
          <span className="text-muted text-[11px]">Daily:</span>
          <span className={dailyTurnsUsed >= dailyTurnsLimit ? 'text-danger font-semibold' : 'text-accent font-semibold'}>
            {dailyTurnsUsed}
          </span>
          <span className="text-muted text-[11px]">/{dailyTurnsLimit}</span>
        </div>

        {/* Settings button */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings and usage details"
            className="interactive-btn p-2 rounded-lg text-muted hover:text-ink hover:bg-surface border border-transparent hover:border-surface-border cursor-pointer"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        )}

        {/* Sign out button */}
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title={userName ? `Signed in as ${userName}` : 'Sign out'}
            className="interactive-btn p-2 rounded-lg text-muted hover:text-danger hover:bg-danger-surface border border-transparent hover:border-danger-border cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
