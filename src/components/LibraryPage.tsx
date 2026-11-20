"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useResearch } from "./ResearchProvider";
import { PanelDialog } from "./PanelDialog";

const searchable = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

export function LibraryPage() {
  const r = useResearch(),
    [page, setPage] = useState(0),
    [size, setSize] = useState(1),
    [pending, setPending] = useState(false);
  const table = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState("newest");
  useEffect(() => {
    const el = table.current;
    if (!el) return;
    const measure = () => {
      const heading = el.querySelector<HTMLElement>(".library-table-heading");
      const available = el.clientHeight - (heading?.offsetHeight || 35);
      const rowHeight = parseFloat(getComputedStyle(el).getPropertyValue("--archive-row-height")) || 58;
      setSize(Math.max(1, Math.floor(available / rowHeight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      removeEventListener("resize", measure);
    };
  }, [r.user]);
  const terms = searchable(r.query).trim().split(/\s+/).filter(Boolean);
  const filtered = r.saved.filter((s) => terms.every((term) => searchable(s.title).includes(term))).sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      const difference = (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);
      return sort === "oldest" ? -difference : difference;
    }),
    pages = Math.max(1, Math.ceil(filtered.length / size)),
    current = Math.min(page, pages - 1);
  return (
    <main id="main-content" className="newspaper-library">
      <div className="archive-paper">
      <header className="archive-masthead">
        <span>Your record of inquiry.<br />Filed for another day.</span>
        <h1>The Fieldwork Library</h1>
        <span>Questions. Findings. Sources.<br />The personal edition.</span>
      </header>
      <div className="archive-dateline">
        <span>THE RESEARCH ARCHIVE</span>
        <span>{r.user ? "YOUR SAVED CONVERSATIONS" : "SIGN IN TO OPEN YOUR ARCHIVE"}</span>
        <span>READ · REVISIT · CONTINUE</span>
      </div>
      <div className="page-heading">
        <div>
          <h2>The record <em>continues.</em></h2>
          <p>Find a conversation by title, then pick up where you left off.</p>
        </div>
        <Link href="/workspace" className="ink-button" onClick={r.reset}>
          <Plus size={16} /> New research
        </Link>
      </div>
      <div className="archive-finder">
      <div className="archive-search-field">
        <label htmlFor="library-search">Find a conversation</label>
        <div className="library-search">
        <Search size={19} aria-hidden="true" />
        <input
          id="library-search"
          type="search"
          placeholder="Search all conversation titles…"
          autoComplete="off"
          value={r.query}
          disabled={!r.user}
          onChange={(e) => {
            r.setQuery(e.target.value);
            setPage(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { r.setQuery(""); setPage(0); }
          }}
        />
        {r.query && <button className="icon-button archive-clear" aria-label="Clear search" onClick={() => { r.setQuery(""); setPage(0); }}><X size={16} /></button>}
        </div>
      </div>
      <label className="archive-sort">Sort by
        <select value={sort} disabled={!r.user} onChange={(e) => { setSort(e.target.value); setPage(0); }}>
          <option value="newest">Latest updated</option>
          <option value="oldest">Oldest updated</option>
          <option value="title">Title A–Z</option>
        </select>
      </label>
      </div>
      {r.user ? (
        <>
          <div className="library-table" ref={table}>
            <div className="library-table-heading">
              <span aria-live="polite" aria-atomic="true">{filtered.length} {terms.length ? "matching" : "saved"} {filtered.length === 1 ? "conversation" : "conversations"}</span>
              <span className="archive-date-heading">LAST UPDATED</span>
            </div>
            {filtered.length ? (
              <ul className="library-conversations" aria-label="Saved conversations">
              {filtered.slice(current * size, current * size + size).map((s) => (
                <li className="library-row" key={s.id}>
                  <Link href={"/chat/" + s.id} title={s.title}>
                    <h3>{s.title}</h3>
                    <time dateTime={s.updated_at}>
                      {new Date(s.updated_at).toLocaleDateString(undefined, {month: "short", day: "numeric", year: "numeric"})}
                    </time>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                  <button
                    className="icon-button"
                    aria-label={"Delete " + s.title}
                    onClick={() => r.setRemove(s.id)}
                    disabled={r.busy}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
              </ul>
            ) : (
              <div className="library-empty">
                <h2>
                  {terms.length
                    ? "No matching research."
                    : "No saved research yet."}
                </h2>
                <p>
                  {terms.length
                    ? "Try a different word or clear your search."
                    : "Start in Workspace. Your saved questions and evidence will appear here."}
                </p>
                {terms.length ? (
                  <button
                    className="text-button"
                    onClick={() => { r.setQuery(""); setPage(0); }}
                  >
                    Clear search
                  </button>
                ) : (
                  <Link className="text-button" href="/workspace">
                    Open workspace <ArrowUpRight size={15} />
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="library-footer">
            <span>
              {filtered.length
                ? `${current * size + 1}–${Math.min(filtered.length, (current + 1) * size)} of ${filtered.length}`
                : "0 conversations"}
            </span>
            <div className="pager">
              <button
                className="text-button"
                aria-label="Previous page"
                disabled={!current}
                onClick={() => setPage(current - 1)}
              >
                <ChevronLeft size={15} /> Previous
              </button>
              <label className="archive-page-picker">Page
                <select aria-label="Go to page" value={current} disabled={pages === 1} onChange={(e) => setPage(Number(e.target.value))}>
                  {Array.from({length: pages}, (_, index) => <option value={index} key={index}>{index + 1}</option>)}
                </select>
                <span>of {pages}</span>
              </label>
              <button
                className="text-button"
                aria-label="Next page"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="library-empty">
          <span className="archive-empty-rule" aria-hidden="true" />
          <h2>Your archive is private.</h2>
          <p>Sign in with Google to reopen your saved conversations and the evidence behind them.</p>
          <Link className="ink-button" href="/login">
            Sign in <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
      {r.error && (
        <p role="alert" className="inline-error">
          {r.error}
        </p>
      )}
      <div className="archive-imprint"><span>FIELDWORK / A RECORD OF INQUIRY</span><span>Keep the evidence close.</span></div>
      </div>
      <PanelDialog
        title="Delete this research?"
        open={Boolean(r.remove)}
        onClose={() => {
          if (!pending) r.setRemove(null);
        }}
      >
        <p>
          The conversation and its saved evidence will be removed from your
          library.
        </p>
        <div className="dialog-actions">
          <button
            className="paper-button"
            disabled={pending}
            onClick={() => r.setRemove(null)}
          >
            Keep research
          </button>
          <button
            className="ink-button"
            disabled={pending}
            onClick={async () => {
              if (!r.remove) return;
              setPending(true);
              await r.deleteSaved(r.remove);
              setPending(false);
            }}
          >
            {pending ? "Deleting…" : "Delete research"}
          </button>
        </div>
      </PanelDialog>
    </main>
  );
}
