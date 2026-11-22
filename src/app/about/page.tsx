import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { WorkflowPaper } from '@/components/WorkflowPaper';
import "./guide.css";

export const metadata: Metadata = {
  title: "The Fieldwork Guide — How to use the research desk",
  description: "A practical, single-page guide to Fieldwork: sign in, ask a question, follow Activity, inspect Evidence and return to saved research in Library.",
};

const stories = [
  {
    label: "THE NAVBAR", title: "Find your desk.", shortTitle: "Start.",
    text: <>Choose <strong>Try without signing in</strong> to ask a question in <strong>Workspace</strong>. Guest answers stay in the open tab. Sign in with Google to save future research in <strong>Library</strong>. <strong>Home</strong> returns to the front page; <strong>About</strong> brings you here.</>,
    compact: <><strong>Workspace</strong> accepts guest questions. Sign in with Google to save future work in <strong>Library</strong>.</>,
  },
  {
    label: "WORKSPACE", title: "Ask your question.", shortTitle: "Ask.",
    text: <>Type in the bottom composer; press <strong>Enter</strong> or the arrow to send. <strong>Shift + Enter</strong> adds a line. The microphone types your question when supported; it never sends it.</>,
    compact: <><strong>Enter</strong> or arrow sends. Mic types only. <strong>Shift + Enter</strong> adds a line.</>,
  },
  {
    label: "ACTIVITY TAB", title: "Follow the reporting.", shortTitle: "Activity.",
    text: <>Open <strong>Activity</strong> to follow the searches and progress. Select an entry for its recorded details. Tavily gathers web sources; Nebius turns the findings into a brief.</>,
    compact: <><strong>Activity:</strong> progress and entry details. Tavily searches; Nebius writes.</>,
  },
  {
    label: "THE ANSWER", title: "Read the brief.", shortTitle: "Read.",
    text: <>Read the answer in the centre. The right-hand <strong>outline</strong> jumps between sections. Ask a follow-up below, or use <strong>Copy brief</strong> and <strong>Export</strong> to keep a copy with citations.</>,
    compact: <>Read, jump with the <strong>outline</strong>, follow up, <strong>Copy brief</strong> or <strong>Export</strong>.</>,
  },
  {
    label: "EVIDENCE TAB", title: "Check the source.", shortTitle: "Verify.",
    text: <>Select a citation icon in the answer to open its source in <strong>Evidence</strong>. Read the supporting excerpt, then choose <strong>Read original page</strong> to examine the claim in context.</>,
    compact: <>Citations open <strong>Evidence</strong>. Read the excerpt and <strong>Read original page</strong>.</>,
  },
  {
    label: "YOUR LIBRARY", title: "Pick up the thread.", shortTitle: "Revisit.",
    text: <>Search <strong>Library</strong> and reopen a saved conversation to continue. Choose <strong>New research</strong> or the navbar’s <strong>Workspace</strong> to start fresh. Your saved conversations stay in Library.</>,
    compact: <><strong>Library</strong> reopens conversations. <strong>Workspace</strong> or <strong>New research</strong> starts fresh.</>,
  },
];

// Short phones retain the six-step workflow without shrinking readable text.
const pocketStories = [
  "Workspace asks. Sign in to save to Library.",
  "Enter sends your question. The mic types only.",
  "Activity shows progress. Select an entry for details.",
  "Read the brief. Use the outline, Copy or Export.",
  "Open a citation, read its excerpt and original.",
  "Library reopens chats. New research starts fresh.",
];

export default function About() {
  return (
    <main id="main-content" className="workflow-guide" tabIndex={-1}>
      <WorkflowPaper>
        <header className="guide-masthead">
          <span className="guide-ear">A practical guide<br />to the research desk</span>
          <h1>The Fieldwork Guide</h1>
          <span className="guide-ear">Read. Verify. Return.<br />The user’s edition</span>
        </header>
        <div className="guide-dateline">
          <span>ABOUT FIELDWORK</span><span>THE WORKFLOW EDITION</span><span>FROM QUESTION TO SAVED RESEARCH</span>
        </div>
        <div className="guide-headline">
          <div className="guide-lead-copy">
            <p className="guide-byline">A FIELDWORK HANDBOOK · SIX STEPS THROUGH THE RESEARCH DESK</p>
            <h2>How a question<br className="guide-desktop-break" /> becomes a brief.</h2>
            <p className="guide-deck">Ask. Follow the reporting. Read the evidence. A practical guide to the pages and tabs behind your next inquiry.</p>
          </div>
          <figure className="guide-desk-figure" aria-label="Workspace layout: Activity and Evidence at left, the answer in the centre, outline at right, and question composer below">
            <div className="guide-desk-drawing" aria-hidden="true">
              <div className="guide-desk-top">FIELDWORK <span>THE RESEARCH DESK</span></div>
              <div className="guide-desk-layout">
                <div className="guide-desk-rail"><b>ACTIVITY</b><span>EVIDENCE</span><i /><i /><i /></div>
                <div className="guide-desk-answer"><b>Your research brief</b><i /><i /><i /><i /><div>Ask a question <ArrowRight size={11} /></div></div>
                <div className="guide-desk-outline"><b>OUTLINE</b><i /><i /><i /></div>
              </div>
            </div>
            <figcaption>The workspace: follow the run, read the brief, inspect the record.</figcaption>
          </figure>
        </div>
        <ol className="guide-route" aria-label="The workflow at a glance">
          {["Start", "Ask", "Follow", "Read", "Verify", "Revisit"].map((step, index) => (
            <li key={step}><span>{step}</span>{index < 5 && <ArrowRight size={13} aria-hidden="true" />}</li>
          ))}
        </ol>
        <div className="guide-stories">
          {stories.map((story, index) => (
            <article key={story.label}>
              <header><p className="guide-story-label"><span>0{index + 1}</span> / {story.label}</p><h3><span className="guide-title">{story.title}</span><span className="guide-short-title">{story.shortTitle}</span></h3></header>
              <p className="guide-full">{story.text}</p>
              <p className="guide-compact">{story.compact}</p>
              <p className="guide-pocket">{pocketStories[index]}</p>
            </article>
          ))}
        </div>
        <aside className="guide-phone-note"><strong>On a phone:</strong> Activity &amp; evidence and the outline button open the side panels.</aside>
        <footer className="guide-footer">
          <span>Citations point to evidence. Check the original before relying on a claim.</span>
          <Link href="/workspace">Open Workspace <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </footer>
      </WorkflowPaper>
    </main>
  );
}
