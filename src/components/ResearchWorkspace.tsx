"use client";
import './workspace-report.css';
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  ListTree,
  Loader2,
  Mic,
  Square,
  Plus,
  Search,
  X,
} from "lucide-react";
import type {
  AssistantContent,
  AnswerBlock,
  UserContent,
  SourceReading,
  EvidenceSupport,
} from "@/types/database";
import { exampleQuestion, exampleAnswer } from "@/lib/example";
import { useResearch } from "./ResearchProvider";
import { SourceIcon } from "./SourceIcon";
import { useDictation } from "./useDictation";
import { describeActivity } from "@/lib/ui/activity-details";
import { PanelDialog } from "./PanelDialog";
import { accessLabel, ResearchReportScope, ResearchReportComparison, ResearchReportFollowups } from "./ResearchReportDetails";
import {
  ScrollProgressOutline,
  type OutlineSection,
} from "./originkit/ScrollProgressOutline";
const labels: Record<string, string> = {
  run_started: "Research started",
  planning_started: "Planning the search",
  queries_planned: "Search plan ready",
  search_started: "Searching the web",
  search_completed: "Search results received",
  sources_reading_started: "Reading original sources",
  source_read: "Source reading recorded",
  coverage_checked: "Research coverage checked",
  sources_reused: "Earlier evidence reused",
  refinement_started: "Looking for missing evidence",
  evidence_selected: "Evidence selected",
  verification_started: "Checking claims against evidence",
  synthesis_started: "Writing the brief",
  answer_completed: "Brief complete",
  insufficient_evidence: "Insufficient evidence",
  provider_error: "Research stopped",
  quota_exhausted: "Usage limit reached",
};
const groupLabels = {
  fact: "Findings",
  inference: "Interpretation",
  background: "Background",
  research_note: "Research notes",
};
function groups(answer: AssistantContent) {
  const out: { label: string; blocks: AnswerBlock[] }[] = [];
  for (const block of answer.blocks) {
    const label = block.section || groupLabels[block.claim_type || "fact"];
    if (out.at(-1)?.label === label) out.at(-1)!.blocks.push(block);
    else out.push({ label, blocks: [block] });
  }
  return out;
}
const short = (s: string, n = 44) =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;
function textPages(text: string, limit: number) {
  const pages: string[] = [];
  while (text.length > limit) {
    const space = text.lastIndexOf(" ", limit);
    const end = space > limit / 2 ? space : limit;
    pages.push(text.slice(0, end));
    text = text.slice(end).trimStart();
  }
  if (text) pages.push(text);
  return pages.length ? pages : [""];
}
function usePanelCapacity() {
  const [height, setHeight] = useState(900);
  useEffect(() => {
    const resize = () => setHeight(innerHeight);
    resize();
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  return {
    sources: Math.max(1, Math.min(3, Math.floor((height - 350) / 150))),
    events: Math.max(1, Math.min(5, Math.floor((height - 270) / 95))),
    characters: Math.max(
      100,
      Math.min(620, Math.floor((height - 430) / 25) * 26),
    ),
  };
}
function Pager({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="pager">
      <button
        className="icon-button"
        aria-label="Previous page"
        disabled={!page}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} />
      </button>
      <span>
        {page + 1} / {pages}
      </span>
      <button
        className="icon-button"
        aria-label="Next page"
        disabled={page >= pages - 1}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
function CitationReading({ title, domain, reading, statement, relation, proofs, capacity, back }: { title: string; domain: string; reading: SourceReading; statement: string; relation: string; proofs: EvidenceSupport[]; capacity: number; back: () => void }) {
  const [view, setView] = useState<'quote' | 'statement' | 'context'>('quote'), [page, setPage] = useState(0);
  const passage = reading.passages.find(p => p.id === proofs[0]?.passage_id) || reading.passages[0];
  const body = view === 'quote' ? (proofs.map(p => p.quote).join('\n\n') || passage?.text || 'No supporting passage was saved.') : view === 'statement' ? (statement ? statement + '\n\n' + relation : 'Choose a citation in the answer to inspect a specific statement.') : reading.note + '\nReading saved: ' + new Date(reading.read_at).toLocaleString() + (reading.reused ? '\nReused from a recent reading.' : '') + '\n\n' + (passage?.text || 'No surrounding passage available.');
  const chunks = textPages(body, capacity);
  return <div className="evidence-detail citation-reading"><button className="text-button" onClick={back}><ChevronLeft size={14} /> All evidence</button><div className="source-meta">{domain}</div><h3 title={title}>{title}</h3><p className="source-access-label">{accessLabel(reading.access)}{passage?.page ? ' · p. ' + passage.page : ''}</p><nav aria-label="Citation detail view">{(['quote','statement','context'] as const).map(name => <button type="button" key={name} aria-pressed={view === name} onClick={() => { setView(name); setPage(0); }}>{({ quote: 'Quotation', statement: 'Statement', context: 'Context & limits' })[name]}</button>)}</nav><blockquote key={view + ":" + page} tabIndex={0}>{chunks[Math.min(page,chunks.length - 1)]}</blockquote>{chunks.length > 1 && <Pager page={Math.min(page,chunks.length - 1)} pages={chunks.length} onChange={setPage} />}<a className="text-button source-original" href={reading.url + (passage?.page ? '#page=' + passage.page : '')} target="_blank" rel="noopener noreferrer">Open original source <ArrowUpRight size={14} /></a></div>;
}
function EvidencePanel() {
  const r = useResearch(),
    capacity = usePanelCapacity(),
    [page, setPage] = useState(0),
    [excerptPage, setExcerptPage] = useState(0),
    sources = r.activeSources,
    selected = sources.find(
      (s) => `${s.research_run_id}:${s.source_ref}` === r.selected,
    ),
    pages = Math.max(1, Math.ceil(sources.length / capacity.sources));
  useEffect(() => {
    setPage(0);
    setExcerptPage(0);
  }, [r.selected, sources.length, r.selectedClaim?.index]);
  if (selected) {
    const answer = r.example ? exampleAnswer : r.messages.find(m => m.role === 'assistant' && m.research_run_id === selected.research_run_id)?.content as AssistantContent | undefined;
    const reading = answer?.report?.sources.find(s => s.source_ref === selected.source_ref) || (selected as any).reading;
    const claim = r.selectedClaim?.run === selected.research_run_id && r.selectedClaim.index >= 0 ? answer?.blocks[r.selectedClaim.index] : undefined;
    const assessment = !claim ? answer?.report?.source_assessments.find(s => s.source_ref === selected.source_ref) : undefined;
    const proofs = (claim?.support || assessment?.support || []).filter(p => p.source_ref === selected.source_ref);
    const page = reading?.passages?.find((p: any) => p.id === proofs[0]?.passage_id)?.page;
    if (reading) return <CitationReading key={selected.research_run_id + ':' + selected.source_ref + ':' + (r.selectedClaim?.index ?? -1)} title={selected.title} domain={selected.domain} reading={reading} statement={claim?.text || (assessment ? [assessment.contribution,assessment.method,assessment.limitation].join(' ') : '')} relation={claim?.claim_type === 'inference' ? 'Interpretation based on the cited passages; review how the conclusion follows.' : 'Check whether the cited words support the statement in its original context.'} proofs={proofs} capacity={capacity.characters} back={() => r.setSelected(null)} />;
    const excerpt =
        proofs.length ? proofs.map(p => p.quote).join('\n\n') : reading?.passages?.[0]?.text || selected.snippet || "No supporting excerpt was saved for this source.",
      chunks = textPages(excerpt, capacity.characters);
    return (
      <div className="evidence-detail">
        <button className="text-button" onClick={() => r.setSelected(null)}>
          <ChevronLeft size={14} /> All evidence
        </button>
        <div className="source-meta">
          <SourceIcon url={selected.original_url} />
          {selected.domain}
        </div>
        <h3>{selected.title}</h3>
        <p className="source-access-label">{reading ? accessLabel(reading.access) : 'Saved search excerpt'}</p>
        {reading && <p className="panel-note">{reading.note}{reading.reused ? ' Reused from a recent reading.' : ''}{page ? ' PDF page ' + page + '.' : ''}</p>}
        {(claim || assessment) && <details className="citation-statement"><summary>{claim ? 'Statement this citation supports' : 'Source comparison being checked'}</summary><p>{claim?.text || [assessment?.contribution, assessment?.method, assessment?.limitation].join(' ')}</p><p>{claim?.claim_type === 'inference' ? 'Interpretation based on the cited passages. Review how the conclusion follows.' : 'Inspect the quotation and surrounding source context before relying on this statement.'}</p></details>}
        {selected.published_at && (
          <time>
            {new Date(selected.published_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </time>
        )}
        <h4>{proofs.length ? 'Exact supporting quotation' : 'Available source passage'}</h4>
        <blockquote>
          {chunks[Math.min(excerptPage, chunks.length - 1)]}
        </blockquote>
        {chunks.length > 1 && (
          <Pager
            page={excerptPage}
            pages={chunks.length}
            onChange={setExcerptPage}
          />
        )}
        <a
          className="text-button source-original"
          href={(reading?.url || selected.original_url) + (page ? '#page=' + page : '')}
          target="_blank"
          rel="noopener noreferrer"
        >
          Read original page <ArrowUpRight size={15} />
        </a>
        <p className="panel-note">
          {reading ? 'Reading saved ' + new Date(reading.read_at).toLocaleString() + '. ' : ''}Check the original page before relying on a claim.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="panel-intro">
        <h3>Evidence</h3>
        <span>
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      </div>
      {sources.length ? (
        <>
          <ol className="evidence-list panel-list-scroll" key={Math.min(page, pages - 1)} tabIndex={0} aria-label="Sources on this page">
            {sources
              .slice(
                Math.min(page, pages - 1) * capacity.sources,
                Math.min(page, pages - 1) * capacity.sources + capacity.sources,
              )
              .map((s) => (
                <li key={`${s.research_run_id}:${s.source_ref}`}>
                  <button
                    onClick={() =>
                      { r.setSelectedClaim?.(null); r.setSelected(`${s.research_run_id}:${s.source_ref}`); }
                    }
                  >
                    <span className="source-meta">
                      <SourceIcon url={s.original_url} />
                      {s.domain}
                    </span>
                    <strong>{s.title}</strong>
                    <span className="source-preview">
                      {short(s.snippet || "Open supporting excerpt", 105)}
                    </span>
                    <span className="source-open">
                      Inspect evidence <ArrowUpRight size={13} />
                    </span>
                  </button>
                </li>
              ))}
          </ol>
          {pages > 1 && (
            <Pager
              page={Math.min(page, pages - 1)}
              pages={pages}
              onChange={setPage}
            />
          )}
          <p className="panel-note">
            Select a citation to inspect its source here.
          </p>
        </>
      ) : (
        <div className="rail-empty">
          <FileText size={23} strokeWidth={1} />
          <p>Every source, kept with its claim.</p>
          <span>Evidence appears as research runs.</span>
        </div>
      )}
    </>
  );
}
function ActivityPanel() {
  const r = useResearch(),
    capacity = usePanelCapacity(),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<number | null>(null),
    [part, setPart] = useState(0),
    pages = Math.max(1, Math.ceil(r.events.length / capacity.events));
  useEffect(() => {
    setPage(pages - 1);
  }, [pages]);
  const event = selected === null ? null : r.events[selected];
  if (event) {
    const text = describeActivity(event, r.events),
      chunks = textPages(text, capacity.characters);
    return (
      <div className="evidence-detail activity-detail">
        <button className="text-button" onClick={() => setSelected(null)}>
          <ChevronLeft size={14} /> All activity
        </button>
        <div className="source-meta">
          {new Date(event.timestamp).toLocaleTimeString()}
        </div>
        <h3>{labels[event.type] || event.type.replaceAll("_", " ")}</h3>
        <blockquote className="activity-full">
          {chunks[Math.min(part, chunks.length - 1)]}
        </blockquote>
        {chunks.length > 1 && (
          <Pager
            page={Math.min(part, chunks.length - 1)}
            pages={chunks.length}
            onChange={setPart}
          />
        )}
      </div>
    );
  }
  return (
    <>
      <div className="panel-intro">
        <h3>Activity</h3>
        <span>
          {r.busy
            ? "In progress"
            : r.example
              ? "Prepared example"
              : r.events.length
                ? "Research record"
                : "No active run"}
        </span>
      </div>
      {r.events.length ? (
        <>
          <ol className="activity-list panel-list-scroll" key={Math.min(page, pages - 1)} tabIndex={0} aria-label="Activity on this page">
            {r.events
              .slice(
                Math.min(page, pages - 1) * capacity.events,
                Math.min(page, pages - 1) * capacity.events + capacity.events,
              )
              .map((ev, i) => (
                <li key={`${ev.research_run_id}:${ev.sequence}:${i}`}>
                  <span
                    className={
                      "activity-dot " +
                      (ev.type === "answer_completed" ? "is-complete" : "")
                    }
                  />
                  <div>
                    <button
                      className="activity-title"
                      onClick={() => {
                        setSelected(
                          Math.min(page, pages - 1) * capacity.events + i,
                        );
                        setPart(0);
                      }}
                    >
                      {labels[ev.type] || ev.type.replaceAll("_", " ")}
                    </button>
                    {Array.isArray(ev.payload.queries) && (
                      <p>{ev.payload.queries.join(" · ")}</p>
                    )}
                    {ev.payload.message && <p>{String(ev.payload.message)}</p>}
                    <time>
                      {new Date(ev.timestamp).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </li>
              ))}
          </ol>
          {pages > 1 && (
            <Pager
              page={Math.min(page, pages - 1)}
              pages={pages}
              onChange={setPage}
            />
          )}
        </>
      ) : (
        <div className="rail-empty">
          <Search size={23} strokeWidth={1} />
          <p>
            {r.example
              ? "No live search was performed."
              : "Follow the research as it happens."}
          </p>
          <span>
            {r.example
              ? "This example is already written. Its evidence is available in the next tab."
              : "Search plans, evidence selection and the completed brief appear here."}
          </span>
        </div>
      )}
    </>
  );
}
function LeftPanel() {
  const r = useResearch(),
    uid = useId();
  const tabId = (name: string) => uid + "-" + name + "-tab",
    contentId = uid + "-content";
  return (
    <div className="left-panel-content">
      <div
        className="panel-tabs"
        role="tablist"
        aria-label="Research details"
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const next =
              e.key === "Home"
                ? "activity"
                : e.key === "End"
                  ? "sources"
                  : r.panel === "activity"
                    ? "sources"
                    : "activity";
            r.setPanel(next);
            document.getElementById(tabId(next))?.focus();
          }
        }}
      >
        {(["activity", "sources"] as const).map((name) => (
          <button
            key={name}
            id={tabId(name)}
            role="tab"
            tabIndex={r.panel === name ? 0 : -1}
            aria-selected={r.panel === name}
            aria-controls={contentId}
            onClick={() => r.setPanel(name)}
          >
            {name === "activity" ? "Activity" : "Evidence"}
          </button>
        ))}
      </div>
      <section
        className="panel-body"
        id={contentId}
        role="tabpanel"
        aria-labelledby={tabId(r.panel)}
      >
        {r.panel === "activity" ? <ActivityPanel /> : <EvidencePanel />}
      </section>
    </div>
  );
}
export function Workspace({ initialId }: { initialId?: string }) {
  const r = useResearch(),
    scroller = useRef<HTMLDivElement>(null),
    loadedRoute = useRef<string | null>(null),
    [drawer, setDrawer] = useState<"details" | "outline" | null>(null);
  const dictation = useDictation((text) => {
    r.setDraft(text);
    sessionStorage.setItem("fieldwork-draft", text);
  });
  useEffect(() => {
    dictation.cancel();
    dictation.setMessage("");
  }, [r.workspaceEpoch, r.busy, r.loading]);
  useEffect(() => {
    if (!initialId) {
      loadedRoute.current = null;
      return;
    }
    if (r.user && !r.busy && loadedRoute.current !== initialId) {
      loadedRoute.current = initialId;
      if (initialId !== r.id) void r.openSaved(initialId);
    }
  }, [initialId, r.user, r.busy]);
  const turns = useMemo(
    () =>
      r.example
        ? [
            {
              id: "example",
              question: exampleQuestion,
              answer: exampleAnswer,
              run: "example",
            },
          ]
        : r.messages.flatMap((m, i) =>
            m.role === "assistant"
              ? [
                  {
                    id: m.id,
                    question:
                      (
                        r.messages
                          .slice(0, i)
                          .reverse()
                          .find((p) => p.role === "user")
                          ?.content as UserContent
                      )?.text || "Research brief",
                    answer: m.content as AssistantContent,
                    run: m.research_run_id,
                  },
                ]
              : [],
          ),
    [r.example, r.messages],
  );
  const sections = useMemo<OutlineSection[]>(
    () =>
      turns.flatMap((t) => [
        { id: `question-${t.id}`, title: short(t.question), level: 0 },
        ...groups(t.answer).map((g, i) => ({
          id: `section-${t.id}-${i}`,
          title: g.label,
          level: 1,
        })),
        ...(t.answer.report?.source_assessments.length ? [{ id: `comparison-${t.id}`, title: "Evidence comparison", level: 1 }] : []),
        ...(t.answer.uncertainty_note
          ? [
              {
                id: `uncertainty-${t.id}`,
                title: "Limits & uncertainty",
                level: 1,
              },
            ]
          : []),
      ]),
    [turns],
  );
  useEffect(() => {
    if (r.busy)
      scroller.current?.scrollTo({
        top: scroller.current.scrollHeight,
        behavior: "smooth",
      });
  }, [r.busy, r.events.length]);
  const last = r.messages.at(-1),
    pending = last?.role === "user" ? (last.content as UserContent).text : null;
  function cite(run: string | null, ref: string, index = -1) {
    r.setSelectedClaim?.({run, index});
    r.setSelected(`${run}:${ref}`);
    r.setPanel("sources");
    if (window.innerWidth <= 900) setDrawer("details");
  }
  return (
    <main id="main-content" className="workspace-page">
      <h1 className="sr-only">Research workspace</h1>
      <div className="workspace-toolbar">
        <span>The research desk</span>
        <div>
          <button
            className="text-button mobile-details"
            onClick={() => setDrawer("details")}
          >
            <FileText size={15} /> Activity & evidence
          </button>
          <button
            className="text-button mobile-outline"
            onClick={() => setDrawer("outline")}
            aria-label="Open answer outline"
          >
            <ListTree size={17} />
          </button>
          <button className="text-button" onClick={r.reset} disabled={r.busy}>
            <Plus size={16} /> New research
          </button>
        </div>
      </div>
      <div className="workspace-grid">
        <aside className="research-rail">
          <LeftPanel />
        </aside>
        <section className="answer-column" aria-label="Conversation">
          <div className="answer-scroller" ref={scroller}>
            <div className="answer-content">
              {r.loading ? (
                <div className="workspace-empty" role="status">
                  <Loader2 className="spin" size={24} />
                  <h2>Opening your research…</h2>
                </div>
              ) : !r.hasBrief ? (
                <div className="workspace-empty">
                  <span className="empty-rule" />
                  <h2>
                    What would you
                    <br />
                    <em>like to understand?</em>
                  </h2>
                  <p>
                    Ask a question. Follow the evidence.
                    <br />
                    Keep a record of what you find.
                  </p>
                  <button
                    className="text-button example-button"
                    onClick={r.showExample}
                  >
                    Read a prepared example <ArrowUpRight size={15} />
                  </button>
                </div>
              ) : (
                <>
                  {r.example && (
                    <div className="example-banner">
                      <FileText size={14} />
                      <span>Prepared example · no live research</span>
                      <button
                        className="icon-button"
                        onClick={r.reset}
                        aria-label="Close example"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                  {turns.map((t, index) => (
                    <article className="research-turn" key={t.id}>
                      <div className="question-meta">
                        {r.example
                          ? "Example question"
                          : `Question ${index + 1}`}
                      </div>
                      <h2
                        className="research-question"
                        id={`question-${t.id}`}
                        tabIndex={-1}
                      >
                        {t.question}
                      </h2>
                      <div className="brief-meta">
                        <span>Fieldwork brief</span>
                        <span>
                          {t.answer.evidence_status
                            ? `${t.answer.evidence_status} evidence`
                            : "Research answer"}
                        </span>
                      </div>
                      {!t.answer.report && t.answer.summary && (
                        <p className="brief-summary">{t.answer.summary}</p>
                      )}
                      {groups(t.answer).map((g, i) => (
                        <div key={i}><section className="answer-section">
                          <h3 id={`section-${t.id}-${i}`} tabIndex={-1}>
                            {g.label}
                          </h3>
                          {g.blocks.map((b, j) => (
                            <div className="answer-block" key={j}>
                              <p>
                                {b.text}
                                {b.source_refs.length > 0 && (
                                  <span
                                    className="citations"
                                    aria-label="Sources"
                                  >
                                    {b.source_refs.map((ref) => {
                                      const source = r.sources.find(
                                        (s) =>
                                          s.source_ref === ref &&
                                          s.research_run_id === t.run,
                                      );
                                      return (
                                        <button
                                          key={ref}
                                          title={
                                            source
                                              ? `${source.domain} — ${source.title}`
                                              : `Inspect source ${ref}`
                                          }
                                          aria-label={
                                            source
                                              ? `Inspect source: ${source.domain} — ${source.title}`
                                              : `Inspect source ${ref}`
                                          }
                                          data-source-ref={ref}
                                          onClick={() => cite(t.run, ref, t.answer.blocks.indexOf(b))}
                                        >
                                          <SourceIcon
                                            url={source?.original_url}
                                          />
                                        </button>
                                      );
                                    })}
                                  </span>
                                )}
                              </p>
                              {b.caveat && (
                                <p className="claim-caveat">{b.caveat}</p>
                              )}
                            </div>
                          ))}
                        </section>{i === 0 && t.answer.report && <ResearchReportScope report={t.answer.report} prepared={r.example} />}</div>
                      ))}
                      {t.answer.report && <ResearchReportComparison report={t.answer.report} id={t.id} cite={ref => cite(t.run, ref)} />}
                      {t.answer.uncertainty_note && (
                        <section className="uncertainty">
                          <h3 id={`uncertainty-${t.id}`} tabIndex={-1}>
                            Limits & uncertainty
                          </h3>
                          <p>{t.answer.uncertainty_note}</p>
                        </section>
                      )}
                      {t.answer.report && <ResearchReportFollowups report={t.answer.report} prepare={question => { r.setDraft(question); r.input.current?.focus(); }} />}
                      <div className="brief-tools">
                        <button className="text-button" onClick={r.copy}>
                          <Copy size={14} /> Copy brief
                        </button>
                        <button className="text-button" onClick={r.download}>
                          <Download size={14} /> Export
                        </button>
                      </div>
                    </article>
                  ))}
                  {pending && (
                    <div className="pending-question">
                      <span className="question-meta">Your question</span>
                      <h2>{pending}</h2>
                    </div>
                  )}
                  {r.busy && (
                    <div className="researching" role="status">
                      <Loader2 className="spin" size={17} />
                      <span>
                        {labels[r.events.at(-1)?.type || "planning_started"] ||
                          "Researching…"}
                      </span>
                      <span className="researching-note">
                        Follow progress in Activity.
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="composer-dock">
            {r.error && (
              <div className="research-error" role="alert">
                <p>{r.error}</p>
                <button
                  className="icon-button"
                  aria-label="Dismiss error"
                  onClick={() => r.setError("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <form
              className={
                "research-composer " +
                (dictation.listening ? "is-listening" : "")
              }
              onSubmit={(event) => {
                dictation.cancel();
                void r.execute(event);
              }}
            >
              <label htmlFor="question" className="sr-only">
                Your research question
              </label>
              {r.clarification && <div className="research-clarification" role="status"><strong>Focus the research first</strong><p>{r.clarification}</p><p>No search or model request has been made for this question.</p><button type="button" className="text-button" onClick={() => { r.setClarification(null); r.input.current?.focus(); }}>Edit my question below</button><button type="button" className="text-button" onClick={() => void r.execute(undefined, true)}>Research a general overview</button></div>}
              <textarea
                id="question"
                ref={r.input}
                rows={2}
                maxLength={1000}
                value={r.draft}
                disabled={r.busy}
                placeholder={
                  turns.length
                    ? "Ask a follow-up question…"
                    : "Ask a research question…"
                }
                onChange={(e) => {
                  if (dictation.listening) dictation.cancel();
                  r.setDraft(e.target.value);
                  sessionStorage.setItem("fieldwork-draft", e.target.value);
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <div className="composer-bottom">
                <span>
                  {r.busy
                    ? "Research in progress"
                    : r.user
                      ? "Research · up to 3 searches"
                      : !r.guest ? 'Checking guest allowance…' : !r.guest.enabled ? 'Guest access unavailable' : `Guest research · ${r.guest.remaining} questions available`}
                  {r.usage && (
                    <span className="usage-note">
                      {" "}
                      ·{" "}
                      {Math.max(
                        0,
                        r.usage.daily_turns_limit - r.usage.daily_turns_used,
                      )}{" "}
                      runs left today
                    </span>
                  )}
                </span>
                <div className="composer-actions">
                  <button
                    type="button"
                    className={
                      "voice-button icon-button " +
                      (dictation.listening ? "is-active" : "")
                    }
                    aria-label={
                      dictation.listening
                        ? "Stop voice typing"
                        : "Start voice typing"
                    }
                    aria-pressed={dictation.listening}
                    aria-describedby="dictation-info"
                    title="Voice typing uses your browser’s speech service; audio may be processed online."
                    disabled={
                      r.busy || r.loading || dictation.supported === null
                    }
                    onClick={() => dictation.toggle(r.draft)}
                  >
                    {dictation.listening ? (
                      <Square size={14} fill="currentColor" />
                    ) : (
                      <Mic size={18} />
                    )}
                  </button>
                  <button
                    className="submit-question"
                    aria-label={r.busy ? "Researching" : "Research question"}
                    disabled={r.busy || r.loading || !r.authReady || r.status.research_enabled === null || !r.draft.trim()}
                  >
                    {r.busy ? (
                      <Loader2 className="spin" size={19} />
                    ) : (
                      <ArrowUp size={20} />
                    )}
                  </button>
                </div>
              </div>
            </form>
            <div className="composer-note">
              <span>Check original sources. Answers can be incomplete.</span>
              <span id="dictation-info">
                Voice audio may be processed online by your browser.
              </span>
            </div>
            {!r.user && <p className="guest-research-note">Guest answers stay in this open tab. Sign in to save future research to Library. Guest access has a shared preview allowance.</p>}
            {dictation.message && (
              <div className="dictation-status" role="status">
                <span>{dictation.message}</span>
                {!dictation.listening && (
                  <button
                    className="icon-button"
                    aria-label="Dismiss voice typing message"
                    onClick={() => dictation.setMessage("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
        <aside className="outline-rail">
          <ScrollProgressOutline scroller={scroller} sections={sections} />
        </aside>
      </div>
      <PanelDialog
        title={drawer === "outline" ? "Answer outline" : "Research details"}
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
      >
        {drawer === "details" ? (
          <LeftPanel />
        ) : drawer === "outline" ? (
          <ScrollProgressOutline
            scroller={scroller}
            sections={sections}
            onNavigate={() => setDrawer(null)}
          />
        ) : null}
      </PanelDialog>
      {r.notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {r.notice}
        </div>
      )}
    </main>
  );
}
