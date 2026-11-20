'use client';

import { useState } from 'react';
import { Conversation } from '@/types/database';
import { Plus, MessageSquare, Trash2, X, Clock } from 'lucide-react';
import Link from 'next/link';

interface ConversationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeConversationId?: string | null;
  onSelectConversation: (id: string) => void;
  onNewResearch: () => void;
  onDeleteConversation: (id: string) => Promise<void>;
}

export function ConversationSidebar({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewResearch,
  onDeleteConversation,
}: ConversationSidebarProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();

    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    setDeletingId(id);
    try {
      await onDeleteConversation(id);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar container */}
      <aside
        className="fixed md:static top-0 left-0 bottom-0 w-72 bg-surface border-r border-surface-border z-50 flex flex-col transition-transform duration-200 ease-out"
        aria-label="Saved conversations"
      >
        {/* Header */}
        <div className="h-14 border-b border-surface-border px-4 flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-muted uppercase tracking-wider">
            Research History
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history sidebar"
            className="interactive-btn p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-elevated md:hidden cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action: New Research */}
        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              onNewResearch();
              if (window.innerWidth < 768) onClose();
            }}
            className="interactive-btn w-full py-2.5 px-3 rounded-xl bg-accent text-accent-ink font-medium text-xs flex items-center justify-center space-x-2 hover:bg-accent-hover cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Research Thread</span>
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted space-y-1">
              <Clock className="w-6 h-6 mx-auto text-muted/60 mb-2" />
              <p>No saved research yet.</p>
              <p className="text-[11px] text-muted/80">Start asking questions to build your cross-device library.</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const isConfirming = confirmDeleteId === conv.id;

              return (
                <div
                  key={conv.id}
                  className={`group relative flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-surface-elevated text-ink font-medium border border-surface-border'
                      : 'text-muted hover:text-ink hover:bg-surface-elevated/50 border border-transparent'
                  }`}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    if (window.innerWidth < 768) onClose();
                  }}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-6">
                    <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-accent' : 'text-muted'}`} />
                    <span className="truncate" title={conv.title}>
                      {conv.title || 'Untitled Research'}
                    </span>
                  </div>

                  {/* Delete button with confirmation */}
                  <div className="absolute right-2 flex items-center">
                    {isConfirming ? (
                      <div className="flex items-center space-x-1 bg-surface-elevated p-1 rounded border border-danger/40">
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, conv.id)}
                          disabled={deletingId === conv.id}
                          className="px-1.5 py-0.5 text-[10px] bg-danger text-white rounded hover:bg-danger/90 font-mono"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          className="px-1 text-[10px] text-muted hover:text-ink font-mono"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, conv.id)}
                        aria-label={`Delete conversation ${conv.title}`}
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-danger rounded hover:bg-danger/10 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-surface-border text-[11px] font-mono text-muted text-center">
          Authenticated Cloud Sync · RLS
        </div>
      </aside>
    </>
  );
}
