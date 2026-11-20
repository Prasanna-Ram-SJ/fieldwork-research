import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { DemoWorkspaceEntry } from '@/components/DemoWorkspaceEntry';
import './demo.css';
export const metadata = { title: 'Try without signing in — Fieldwork' };
export default function DemoPage() {
  return <main id="main-content" className="demo-home"><div className="demo-home-content"><h1>Follow the evidence.<br /><em>No account needed.</em></h1><p>Open Workspace and ask your own research question. Follow the searches, read the findings and inspect the evidence, without signing in.</p>
    <section className="demo-workspace-entry"><h2>Start at the research desk.</h2><p>Guest research uses the same source-reading and evidence-checked report process as account research. You can ask up to three questions per day, while the shared preview allowance remains available.</p><DemoWorkspaceEntry /><p className="demo-example-note">Opening Workspace does not start a search. Research begins when you submit your question.</p><Link href="/demo/research" className="text-button">Have a judge code? <ArrowRight size={16} /></Link></section>
    <p className="demo-storage">Guest answers remain in this open tab. Sign in to save future conversations to Library and use your account allowance. A shared connection may have fewer guest questions available.</p><Link href="/login" className="text-button">Sign in / Sign up</Link>
  </div></main>;
}
