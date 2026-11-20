"use client";
import { ArrowRight } from 'lucide-react';
import { useResearch } from './ResearchProvider';

export function DemoWorkspaceEntry() {
  const workspace = useResearch();
  return <button type="button" className="ink-button" onClick={workspace.reset}>Open Workspace <ArrowRight size={16} /></button>;
}
