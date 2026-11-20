import type { SSETraceEvent } from "@/types/research";
const explanations: Record<string, string> = {
  run_started: "A research run was created for this question.",
  planning_started:
    "Preparing focused web searches from the question and recent conversation.",
  queries_planned:
    "The search plan below was prepared before retrieving web results.",
  search_started: "These queries were sent to the web search service.",
  search_completed:
    "Search results were received. Duplicates and weak evidence are filtered before the brief is written.",
  refinement_started:
    "An additional search was planned to fill an evidence gap.",
  evidence_selected:
    "These source pages and excerpts were selected as evidence for this run.",
  synthesis_started:
    "The model is composing an answer from the selected excerpts.",
  verification_started:
    "Factual paragraphs are checked against their cited excerpts. This is a model review, not a guarantee that every claim is true.",
  answer_completed: "The answer and its source references were saved.",
  insufficient_evidence:
    "The run stopped because the available evidence could not support a reliable answer.",
  provider_error:
    "The run stopped after a service error. Details saved with this step follow.",
  quota_exhausted:
    "The run could not continue within the configured usage allowance.",
};
export function describeActivity(
  event: SSETraceEvent,
  events: SSETraceEvent[] = [],
): string {
  const p = event.payload || {},
    lines: string[] = [
      explanations[event.type] || "Details recorded for this research step.",
    ];
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim())
      lines.push(`${label}\n${value.trim()}`);
    else if (typeof value === "number" && Number.isFinite(value))
      lines.push(`${label}\n${value.toLocaleString()}`);
  };
  add("Question", p.question);
  add("Model", p.model_id);
  if (Array.isArray(p.queries))
    p.queries.forEach((q, i) => add(`Search query ${i + 1}`, q));
  add("Search approach", p.strategy_reason);
  if (Array.isArray(p.aspects)) p.aspects.forEach((a: any, i: number) => add(`Research question ${i + 1}`, a?.question));
  if (Array.isArray(p.coverage)) p.coverage.forEach((c: any) => add(`Coverage ${c?.aspect_id || ''} (${c?.status || 'not assessed'})`, c?.reason));
  add('Source read', p.title);
  add('Available text', p.access);
  add('Reading limit', p.reason);
  add("Time scope", p.temporal_scope);
  add("Geographic scope", p.geographic_scope);
  if (typeof p.is_time_sensitive === "boolean")
    add("Time-sensitive question", p.is_time_sensitive ? "Yes" : "No");
  add("Search depth", p.search_depth);
  add("Search topic", p.topic);
  add("Successful searches", p.searches_count);
  add("Results before filtering", p.raw_results_count);
  add("Refinement query", p.refinement_query);
  add("Reason", p.reason);
  add("Selected sources", p.selected_sources_count);
  add("Evidence excerpts used", p.evidence_count);
  if (Array.isArray(p.sources))
    p.sources.forEach((s, i) => {
      if (!s || typeof s !== "object") return;
      add(`Source ${i + 1}`, s.title);
      add("Website", s.domain);
      add("Original page", s.original_url);
      add("Supporting excerpt", s.snippet_preview);
    });
  const completion =
    event.type === "answer_completed"
      ? event
      : events.find(
          (e) =>
            e.research_run_id === event.research_run_id &&
            e.type === "answer_completed",
        );
  if (
    (event.type === "verification_started" ||
      event.type === "answer_completed") &&
    completion
  ) {
    const a = completion.payload?.answer;
    if (a && Array.isArray(a.blocks)) {
      add("Evidence status", a.evidence_status);
      add("Answer paragraphs", a.blocks.length);
      add(
        "Factual paragraphs",
        a.blocks.filter((b: any) => b.claim_type === "fact").length,
      );
      const refs = new Set(
        a.blocks.flatMap((b: any) =>
          Array.isArray(b.source_refs) ? b.source_refs : [],
        ),
      );
      add("Distinct cited sources", refs.size);
      add("Limits noted in the answer", a.uncertainty_note);
    }
  } else if (event.type === "verification_started")
    lines.push(
      "The trace records the start of this check. No completed review result has been saved for this run yet.",
    );
  if (typeof p.elapsed_ms === "number")
    add("Total elapsed time", `${(p.elapsed_ms / 1000).toFixed(1)} seconds`);
  add("Search credits used", p.tavily_credits);
  add("Model input tokens", p.tokens?.input);
  add("Model output tokens", p.tokens?.output);
  add("Service message", p.message);
  add("Error code", p.error_code);
  if (typeof p.retryable === "boolean")
    add(
      "Retry may help",
      p.retryable
        ? "Yes — try again later."
        : "Check the error before retrying.",
    );
  if (Array.isArray(p.attempted_queries))
    p.attempted_queries.forEach((q, i) => add(`Attempted search ${i + 1}`, q));
  for (const [key, label] of [
    ["daily_used", "Daily runs used"],
    ["daily_limit", "Daily run allowance"],
    ["monthly_used", "Monthly search credits reserved"],
    ["monthly_limit", "Monthly search credit allowance"],
  ] as const)
    add(label, p[key]);
  return lines.join("\n\n");
}
