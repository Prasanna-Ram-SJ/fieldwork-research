# Fieldwork — Research Agent

> ODSC × Nebius Hackathon · Build a research agent that brings its sources

**One-line pitch:** Fieldwork helps students turn research questions into answers they can inspect, with exact source passages, citations, visible limitations and tools for working with papers.

- **Live application:** https://fieldwork-research.prasannaramcollege.workers.dev
- **Repository:** https://github.com/Prasanna-Ram-SJ/fieldwork-research
- **Project report:** [Research workflow, evidence handling, implementation and validation](docs/PROJECT_REPORT.md)
- **Project:** Fieldwork. **Team:** InVis. Repository maintainer: [@Prasanna-Ram-SJ](https://github.com/Prasanna-Ram-SJ). Additional member details have not been supplied.
- **Demo video (2–3 minutes): Pending recording.** No video link has been supplied yet. This repository alone is not a completed submission.
- Generated directly from [ODSC's official template](https://github.com/odsc2015/nebius-research-agent-hackaton-template). This is a working research application, not a reusable starter kit or component library.

## The problem

Students need to compare sources, understand what a study measured and check whether an answer goes beyond its evidence. A convincing paragraph with a list of links makes that checking difficult. Fieldwork puts the report, activity, supporting passages and original links together.

Workspace handles general web questions. Projects adds assignment requirements, Crossref paper discovery, text PDF extraction, paper comparison and Q&A, draft-claim checks, notes and reference exports. Model review does not guarantee truth; students still need to inspect original sources.

## How it works

```text
question → query plan → Tavily search → select & deduplicate sources
         → bounded original-text reading → evidence coverage assessment
         → optional targeted search → Token Factory report synthesis
         → exact quotation validation + evidence review → cited report
```

- **Query planning:** Identify relevant angles and source needs; coverage can request a targeted follow-up within a maximum of three basic searches per run. Research stops at its bounded budget even when gaps remain.
- **Evidence handling:** Keep original URLs and distinguish original text, partial PDFs, abstracts and search excerpts. Claims cite real source/passage IDs; quotations must match retrieved text. The existing review call can locate missing proof in allowed passages. Unsupported items are omitted. Evidence-only results are labeled when an answer cannot be established.
- **Safety:** Source content is untrusted data separated from system instructions. URL/public-destination checks, redirect, byte and time limits bound retrieval. Supabase RLS isolates account data. Durable quotas reserve capacity before provider work. Paid-provider requests have no automatic retries.
- **Trade-offs:** Planning, reading and verification add latency/cost. Bounded reading can miss context. Exact quotation checks do not prove scientific validity; search ranking does not certify peer review, freshness or independent sources.

See [architecture](docs/ARCHITECTURE.md) and [validation](docs/VALIDATION.md).

## Required services

| Service | Use |
|---|---|
| Nebius Token Factory | Default `moonshotai/Kimi-K3.1-Pro`, configurable with `NEBIUS_MODEL`, at `https://api.tokenfactory.nebius.com/v1`. Planning, coverage, synthesis, evidence review and paper analysis use inference. |
| Tavily | Basic real-time searches supply URLs/excerpts to the pipeline; source references survive report generation and citation inspection. |
| Supabase | Google sign-in, saved user-scoped conversations/projects/evidence and transactional account quotas. |
| Cloudflare Workers / D1 | OpenNext hosting and shared transactional guest/judge allowances. Hosting does not replace Nebius/Tavily. |

Code: [Nebius adapter](src/lib/providers/nebius.ts), [Tavily adapter](src/lib/providers/tavily.ts), [pipeline](src/lib/research/pipeline.ts), [report synthesis](src/lib/research/report-synthesizer.ts).

## Setup

Use **Node.js 22.13 or newer** and npm. Fieldwork is Next.js/TypeScript; the original Python starter is archived under `docs/template-starter` for provenance, not used as the entry point.

```sh
git clone https://github.com/Prasanna-Ram-SJ/fieldwork-research.git
cd fieldwork-research
npm ci
```

1. Copy `.env.example` to `.env.local`: `cp .env.example .env.local` in a POSIX shell, or `Copy-Item .env.example .env.local` in PowerShell.
2. Create your own Supabase project. Run all files in `supabase/migrations` in filename order. They create the schema/RLS, budget protection and current ten-attempt daily allowance.
3. Set the public/server Supabase URL and publishable/anon key fields in `.env.local`. **Never place a service-role key in browser configuration.**
4. Enable Google sign-in in Supabase. In Google OAuth, authorize `https://YOUR_PROJECT.supabase.co/auth/v1/callback`. In Supabase URL configuration allow `http://localhost:3011/auth/callback` and your production `/auth/callback` URL.
5. Set your own `NEBIUS_API_KEY`, `TAVILY_API_KEY`, model and base URL. Keep `PROVIDER_REQUESTS_ENABLED=false` for interface review. Set it to `true` only when you intend to submit billable research. Your real provider balance/limits remain authoritative.
6. Run the application:

```sh
npm run preview
```

Open http://localhost:3011. Preview builds pages before serving them. `npm run dev` enables hot reload; initial development route visits may compile on demand. Rebuild/restart after configuration changes.

Sign in for saved history/projects and authenticated live research. The hosted application's **Try without signing in** opens a blank live Workspace with a shared allowance. Guest answers stay in the open tab; sign-in does not migrate them. A fresh local clone does not inherit the hosted D1 store: use authenticated research locally or [configure your own Worker/D1 deployment](docs/DEPLOYMENT.md).

### Checks without paid API use

```sh
npm test
npx tsc --noEmit
npm run build
```

Tests use mocks, synthetic fixtures, in-memory SQLite and attributed bundled papers. Provider credentials are unnecessary. Do not submit research or paper analysis as an unapproved automated smoke test. No real credentials, private invite or account usage ledger is included.

## Example

**Question:** Does open access guarantee more citations?

**Prepared answer excerpt:** These papers do not establish a guarantee that open access increases every article's citations. A cohort reported a citation advantage [S1], while a later systematic review included studies finding no advantage [S2].

**Sources:**

- [S1: Eysenbach (2006), Citation Advantage of Open Access Articles](https://doi.org/10.1371/journal.pbio.0040157).
- [S2: Langham-Putrow, Bakker and Riegelman (2021), Is the open access citation advantage real?](https://doi.org/10.1371/journal.pone.0253129).

This is an explicitly prepared editorial example, not a live model run. Inspect it at `/demo/research`, with a paper example at `/demo/projects`. Unchanged publisher PDFs and author/DOI/license credits are in [public/demo](public/demo/ATTRIBUTION.txt).

## Failure / insufficient-evidence case

If all searches fail and no usable evidence exists, research stops rather than inventing sources. Missing statement proof can be recovered only from actual cited passages and must pass strict quotation/source validation. Invented quotations and unknown IDs fail. When no answer statement passes, the report shows **“Source excerpts — answer not established”**, with exact available excerpts. An evidence-only result is not a successfully established answer.

Partial results explain omitted unsupported content and gaps. Provider refusals, quotas and unavailable storage are not silently bypassed. Failed attempts can consume reserved capacity; no automatic paid retry or capacity refund is added.

## Judging criteria map

| Criterion | Weight | Where to look |
|---|---|---|
| Sourced and verifiable answers | 30% | Workspace Evidence, clickable citations, exact source/passage validators, prepared example. Record citations opening. |
| Works end to end | 25% | Live Workspace, setup, provider adapters and bounded pipeline. A complete representative live recording remains pending. |
| Usefulness | 20% | Student question-to-evidence workflow, paper tools and reference exports. |
| Agent design | 15% | Activity trace, query planning/refinement, deduplication, coverage and architecture. |
| Use of Token Factory and Tavily | 10% | Actual inference/search integrations, configuration and source flow above. |

## Submission status

The repository is public and template-derived. Demo recording and final organizer submission remain pending. Follow [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) and the [official event page](https://hackathon.odsc.ai/event). The deadline is **November 20, 2026, 11:59 PM EST**, or **November 21, 2026, 10:29 AM IST**. The event page directs participants to **Submit your project**. Creating a repository does not submit the entry.

## License

Fieldwork's original application code is MIT; see [LICENSE](LICENSE). Third-party assets and adapted components retain their own terms. Modified Originkit components are included in this real application under Originkit's usage license, not relicensed as standalone MIT components. See [third-party notices](THIRD_PARTY_NOTICES.md). The original template commit remains in history.
