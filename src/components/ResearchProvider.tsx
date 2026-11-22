"use client";
import { researchResponseEvents } from '@/lib/research/response-events';
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { AssistantContent, Message } from "@/types/database";
import type { SSETraceEvent } from "@/types/research";
import { exampleQuestion, exampleAnswer, exampleSources } from "@/lib/example";
import { clarificationFor } from '@/lib/research/clarify';
import { authErrorCode, authErrorMessage } from "@/lib/auth-errors";
type Evidence = (typeof exampleSources)[number];
type Saved = { id: string; title: string; updated_at: string };
type RunningResearch = {
  view: number; id: string | null; messages: Message[]; sources: Evidence[];
  events: SSETraceEvent[]; panel: 'sources' | 'activity'; error: string; draft: string;
};
type Status = {
  supabase: boolean;
  nebius: boolean;
  tavily: boolean;
  model: boolean;
  research_enabled: boolean | null;
};
const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
function useResearchState() {
  const router = useRouter();
  const [user, setUser] = useState<{
    id?: string;
    email?: string;
    user_metadata?: Record<string, string>;
  } | null>(null);
  const [authReady, setAuthReady] = useState(!configured);
  const [status, setStatus] = useState<Status>({
    supabase: false,
    nebius: false,
    tavily: false,
    model: false,
    research_enabled: null,
  });
  const [draft, setDraft] = useState(""),
    [id, setId] = useState<string | null>(null);
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const [clarification, setClarification] = useState<string | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<{run: string | null; index: number} | null>(null);
  const [messages, setMessages] = useState<Message[]>([]),
    [sources, setSources] = useState<Evidence[]>([]),
    [events, setEvents] = useState<SSETraceEvent[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]),
    [query, setQuery] = useState("");
  const [running, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [example, setExample] = useState(false);
  const [panel, setPanel] = useState<"sources" | "activity">("sources"),
    [selected, setSelected] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [remove, setRemove] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    daily_turns_used: number;
    daily_turns_limit: number;
  } | null>(null);
  const [guest, setGuest] = useState<{enabled:boolean;remaining:number;daily_limit:number;pool_remaining:number;error?:string} | null>(null);
  const controller = useRef<AbortController | null>(null),
    activeResearch = useRef<RunningResearch | null>(null),
    conversationLoad = useRef(0),
    accountVersion = useRef(0),
    input = useRef<HTMLTextAreaElement>(null);
  const busy = running && activeResearch.current?.view === conversationLoad.current;
  const ready =
      status.supabase && status.nebius && status.tavily && status.model,
    hasBrief = messages.length > 0 || example || busy;
  function updateRunning(run: RunningResearch, patch: Partial<RunningResearch>) {
    Object.assign(run, patch);
    if (activeResearch.current !== run || run.view !== conversationLoad.current) return;
    if ('id' in patch) setId(run.id);
    if ('messages' in patch) setMessages(run.messages);
    if ('sources' in patch) setSources(run.sources);
    if ('events' in patch) setEvents(run.events);
    if ('panel' in patch) setPanel(run.panel);
    if ('error' in patch) setError(run.error);
    if ('draft' in patch) setDraft(run.draft);
  }
  async function refreshSaved() {
    const version = accountVersion.current;
    const r = await fetch("/api/conversations");
    if (r.ok) {
      const data = await r.json();
      if (version === accountVersion.current) setSaved(data.conversations || []);
    }
  }
  async function refreshUsage() {
    const version = accountVersion.current;
    const r = await fetch("/api/user/usage");
    if (r.ok) {
      const data = await r.json();
      if (version === accountVersion.current) setUsage(data.usage);
    }
  }
  async function refreshGuest() {
    try {
      const response=await fetch('/api/guest/session');
      const data=await response.json();
      setGuest({...data,remaining:data.remaining || 0});
      return data;
    } catch { setGuest({enabled:false,remaining:0,daily_limit:3,pool_remaining:0,error:'Guest access could not connect. Refresh or sign in to try again.'}); return null; }
  }
  useEffect(() => {
    let active = true;
    let authVersion = 0;
    let unsubscribe = () => {};
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() =>
        setError("Could not check connection status. Refresh to try again."),
      );
    if (configured) {
      const client = createClient();
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        authVersion++;
        setUser(session?.user || null);
        setAuthReady(true);
        if (event === 'SIGNED_OUT') {
          accountVersion.current++;
          conversationLoad.current++;
          controller.current?.abort();
          controller.current = null;
          activeResearch.current = null;
          setBusy(false);
          setLoading(false);
          setSaved([]);
          setUsage(null);
          setMessages([]);
          setSources([]);
          setEvents([]);
          setId(null);
          setExample(false);
          setDraft('');
          setSelected(null);
    setSelectedClaim(null);
    setClarification(null);
          sessionStorage.removeItem('fieldwork-draft');
        }
      });
      unsubscribe = () => subscription.unsubscribe();
      const version = authVersion;
      client.auth.getUser().then(({ data }) => {
        if (!active || version !== authVersion) return;
        setUser(data.user);
        setAuthReady(true);
      }).catch(() => {
        if (!active || version !== authVersion) return;
        setAuthReady(true);
        setError('Could not restore your sign-in. Please sign in again.');
      });
    }
    const d = sessionStorage.getItem("fieldwork-draft");
    if (d) setDraft(d);
    return () => {
      active = false;
      unsubscribe();
      controller.current?.abort();
    };
  }, []);

  // Keep async account requests outside Supabase's auth event callback.
  useEffect(() => {
    if (!user?.id) { void refreshGuest(); return; }
    void Promise.allSettled([refreshSaved(), refreshUsage()]);
  }, [user?.id]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);
  function reset() {
    const run = activeResearch.current;
    if (controller.current && run) {
      run.view = ++conversationLoad.current;
      setId(run.id); setMessages(run.messages); setSources(run.sources);
      setEvents(run.events); setPanel(run.panel); setError(run.error); setDraft(run.draft);
      setExample(false); setLoading(false); setSelected(null); setSelectedClaim(null); setClarification(null);
      router.push(run.id ? '/chat/' + run.id : '/workspace');
      return;
    }
    setWorkspaceEpoch((value) => value + 1);
    conversationLoad.current++;
    setLoading(false);
    setId(null);
    setMessages([]);
    setSources([]);
    setEvents([]);
    setExample(false);
    setError("");
    setSelected(null);
    setSelectedClaim(null);
    setClarification(null);
    setDraft("");
    sessionStorage.removeItem("fieldwork-draft");
    router.push("/workspace");
    input.current?.focus();
  }
  function showExample() {
    if (running) return;
    conversationLoad.current++;
    setWorkspaceEpoch((value) => value + 1);
    setLoading(false);
    setExample(true);
    setMessages([]);
    setSources(exampleSources);
    setEvents([]);
    setSelected(null);
    setSelectedClaim(null);
    setClarification(null);
    setPanel("sources");
    setError("");
    setId(null);
    router.push("/workspace");
  }
  async function openSaved(key: string) {
    if (controller.current && activeResearch.current?.id === key) { reset(); return; }
    const request = ++conversationLoad.current;
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/conversations/" + key),
        d = await r.json();
      if (request !== conversationLoad.current) return;
      if (!r.ok) throw Error(d.error || "Could not open research.");
      setId(key);
      setMessages(d.messages);
      setSources(d.sources);
      setSelected(null);
      setSelectedClaim(null);
      setDraft('');
      setClarification(null);
      setEvents(
        (d.events || []).map((e: any) => ({
          ...e,
          type: e.event_type,
          sequence: e.sequence_no,
          timestamp: e.created_at,
        })),
      );
      setExample(false);
      router.push("/chat/" + key);
    } catch (e) {
      if (request === conversationLoad.current) setError((e as Error).message);
    } finally {
      if (request === conversationLoad.current) setLoading(false);
    }
  }
  async function signIn() {
    setError("");
    if (!configured) {
      router.push("/setup");
      return;
    }
    sessionStorage.setItem("fieldwork-draft", draft);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: location.origin + "/auth/callback",
      },
    });
    if (error) throw error;
  }
  useEffect(() => { if (clarification && !clarificationFor(draft)) setClarification(null); }, [draft, clarification]);
  async function execute(e?: React.FormEvent, scopeConfirmed = false) {
    e?.preventDefault();
    if (controller.current || !draft.trim()) return;
    if (!authReady) {
      setError('Your account is still loading. Please try again in a moment.');
      return;
    }
    if (status.research_enabled === null) {
      setError('The connection check is still loading. Please wait a moment.');
      return;
    }
    if (!status.research_enabled) {
      setError(
        "Live research is paused to protect your credits. No provider request was made. You can still explore the example brief.",
      );
      return;
    }
    if (!ready) {
      setError(
        "Connect the research services in Setup to run this question. You can explore the example in the meantime.",
      );
      return;
    }
    const isGuest=!user;
    let question = draft.trim();
    const scopePrompt = clarificationFor(question);
    if (scopePrompt && !scopeConfirmed) { setClarification(scopePrompt); return; }
    if (scopePrompt && scopeConfirmed) question = 'Give a research overview of ' + question + ', explaining key definitions, major findings and limits of the available evidence.';
    setClarification(null);
    const run: RunningResearch = {view: ++conversationLoad.current, id, messages, sources, events: [], panel: 'activity', error: '', draft: ''};
    activeResearch.current = run;
    setBusy(true);
    setError("");
    setExample(false);
    setEvents([]);
    setPanel("activity");
    setSelected(null);
    let conversationId = id,
      terminal = false;
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (isGuest) {
        const allowance=await refreshGuest();
        if(!allowance?.enabled || allowance.remaining<=0)throw Error(allowance?.error || 'Guest allowance reached. Sign in for your account allowance.');
      }
      if (!conversationId && !isGuest) {
        const r = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: question.slice(0, 60) }),
          }),
          d = await r.json();
        if (!r.ok) throw Error(d.error || "Could not save conversation.");
        conversationId = d.conversation.id;
        updateRunning(run, {id: conversationId});
        if (run.view === conversationLoad.current) router.replace("/chat/" + conversationId);
      }
      if (isGuest) conversationId='guest-session';
      if (abort.signal.aborted || activeResearch.current !== run) return;
      updateRunning(run, {messages: [
        ...run.messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: { text: question },
          conversation_id: conversationId!,
          user_id: "",
          research_run_id: null,
          created_at: new Date().toISOString(),
        },
      ], draft: ''});
      sessionStorage.removeItem("fieldwork-draft");
      const recentContext=isGuest?messages.slice(-4).map(m=>`${m.role.toUpperCase()}: ${m.role==='user'?(m.content as {text?:string}).text:(m.content as AssistantContent).blocks?.map(b=>b.text).join(' ')}`).join('\n').slice(-6500):'';
      const r = await fetch(isGuest?"/api/guest/research":"/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, question, scope_confirmed: scopeConfirmed, request_id:crypto.randomUUID(), ...(isGuest?{recent_context:recentContext}:{}) }),
        signal: abort.signal,
      });
      if (!r.ok) {
        let d:{error?:string};
        try { d=await r.json(); }
        catch { throw Error(`The research service is temporarily unavailable (HTTP ${r.status}). No automatic retry was made.`); }
        throw Error(d.error || "Research could not start.");
      }
      for await (const ev of researchResponseEvents(r, abort.signal)) {
          if (abort.signal.aborted || activeResearch.current !== run) return;
          updateRunning(run, {events: [...run.events, ev]});
          if (ev.type === "evidence_selected")
            updateRunning(run, {sources: [
              ...run.sources,
              ...(ev.payload.sources || []).map((s: any) => ({
                ...s,
                snippet: s.snippet_preview,
                research_run_id: ev.research_run_id,
              })),
            ]});
          if (ev.type === "answer_completed") {
            terminal = true;
            updateRunning(run, {panel: 'sources', messages: [
              ...run.messages,
              {
                id: ev.payload.assistant_message_id,
                role: "assistant",
                content: ev.payload.answer,
                conversation_id: conversationId!,
                user_id: "",
                research_run_id: ev.research_run_id,
                created_at: ev.timestamp,
              },
            ]});
          }
          if (
            [
              "provider_error",
              "quota_exhausted",
              "insufficient_evidence",
            ].includes(ev.type)
          ) {
            terminal = true;
            updateRunning(run, {error: ev.payload.message || 'There was not enough evidence to finish.', draft: question});
          }
      }
      if (!terminal)
        throw Error(
          "The connection ended before the brief completed. Open this research again to recover saved progress.",
        );
      if (!isGuest) { await refreshSaved(); await refreshUsage(); }
    } catch (e) {
      updateRunning(run, {error: (e as Error).name === "AbortError"
          ? "The live stream ended. Reopen this research to recover its saved progress."
          : (e as Error).message, draft: question});
    } finally {
      if (controller.current === abort) {
        setBusy(false);
        controller.current = null;
        activeResearch.current = null;
      }
      if(isGuest)void refreshGuest();
    }
  }
  async function deleteSaved(key: string) {
    try {
      const r = await fetch("/api/conversations/" + key, { method: "DELETE" });
      if (!r.ok) throw Error("Could not delete research. Try again.");
      setSaved((p) => p.filter((s) => s.id !== key));
      setRemove(null);
      if (id === key) reset();
      setNotice("Research deleted");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const answers = example
    ? [{ id: "example", content: exampleAnswer, research_run_id: "example" }]
    : messages.filter((m) => m.role === "assistant");
  const title = example
    ? exampleQuestion
    : (messages.find((m) => m.role === "user")?.content as any)?.text;
  function markdown() {
    return (
      "# " +
      (title || "Research brief") +
      "\n\n" +
      (example ? "Prepared example, not a live research run.\n\n" : "") +
      answers
        .map((m) => {
          const a = m.content as AssistantContent;
          return (
            a.blocks
              .map(
                (b) =>
                  (b.section ? '## ' + b.section + '\n\n' : '') + b.text +
                  " " +
                  b.source_refs
                    .map((ref) => {
                      const s = sources.find(
                        (s) =>
                          s.source_ref === ref &&
                          s.research_run_id === m.research_run_id,
                      );
                      return s ? `[${ref}](${s.original_url})` : "";
                    })
                    .join(" "),
              )
              .join("\n\n") +
            (a.uncertainty_note ? "\n\nUncertainty: " + a.uncertainty_note : "") +
            (a.report ? "\n\n## Research scope\n" + a.report.scope + "\n\n## Evidence comparison\n" + a.report.source_assessments.map(row => {
              const source = a.report?.sources.find(s => s.source_ref === row.source_ref);
              return "### " + (source?.title || row.source_ref) + "\n" + row.contribution + "\nMethod: " + row.method + "\nLimit: " + row.limitation + "\nAccess: " + (source?.access || 'unknown') + "\n" + row.support.map(p => '“' + p.quote + '”').join('\n');
            }).join('\n\n') + "\n\nResearch limits: " + a.report.stop_reason : "")
          );
        })
        .join("\n\n") +
      "\n\n## Sources\n" +
      sources
        .map((s) => `- [${s.source_ref}: ${s.title}](${s.original_url})`)
        .join("\n")
    );
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown());
      setNotice("Brief copied with citations");
    } catch {
      setNotice("Copy is unavailable. Use Export instead.");
    }
  }
  function download() {
    const u = URL.createObjectURL(
        new Blob([markdown()], { type: "text/markdown" }),
      ),
      a = document.createElement("a");
    a.href = u;
    a.download = "fieldwork-research.md";
    a.click();
    URL.revokeObjectURL(u);
    setNotice("Brief exported");
  }
  const activeRun =
    selected?.split(":")[0] ||
    messages.filter((m) => m.role === "assistant").at(-1)?.research_run_id ||
    events.at(-1)?.research_run_id;
  const activeSources = example
    ? sources
    : sources.filter((s) => s.research_run_id === activeRun);
  async function signOut() {
    if (running) return;
    const { error } = await createClient().auth.signOut();
    if (error) {
      setError(
        "Sign-out could not finish. Check your connection and try again.",
      );
      router.push("/workspace");
      return;
    }
    setUser(null);
    setSaved([]);
    setMessages([]);
    setSources([]);
    setEvents([]);
    setId(null);
    setExample(false);
    setUsage(null);
    setDraft("");
    setSelected(null);
    sessionStorage.removeItem("fieldwork-draft");
    router.push("/");
  }
  return {
    user,
    authReady,
    status,
    draft,
    workspaceEpoch,
    setDraft,
    id,
    messages,
    sources,
    events,
    saved,
    query,
    setQuery,
    busy,
    running,
    loading,
    error,
    setError,
    example,
    panel,
    setPanel,
    selected,
    setSelected,
    notice,
    remove,
    setRemove,
    usage,
    guest,
    input,
    ready,
    hasBrief,
    reset,
    showExample,
    openSaved,
    signIn,
    signOut,
    execute,
    clarification,
    setClarification,
    selectedClaim,
    setSelectedClaim,
    deleteSaved,
    answers,
    title,
    copy,
    download,
    activeSources,
    refreshSaved,
  };
}
const ResearchContext = createContext<ReturnType<
  typeof useResearchState
> | null>(null);
export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const state = useResearchState();
  return (
    <ResearchContext.Provider value={state}>
      {children}
    </ResearchContext.Provider>
  );
}
export function useResearch() {
  const state = useContext(ResearchContext);
  if (!state) throw new Error("ResearchProvider is missing");
  return state;
}
