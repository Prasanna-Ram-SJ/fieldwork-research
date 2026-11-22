# Validation and known limitations

Checked November 22, 2026. Offline tests, actual provider calls and pending demonstration are distinguished below.

- **148 offline tests pass:** quotation/source integrity, missing-proof recovery, independently malformed items, actual guest-runner completion with mocked model responses, fabricated-proof rejection, durable quota concurrency, cookies, auth/navigation, PDF parsing, citation exports, interrupted background-job handling and incomplete provider-usage disclosure.
- TypeScript and the isolated Worker build passed for the deployed source. Build output was scanned for embedded provider/session secrets. The public status endpoint returned HTTP 200 with runtime configuration present.
- Newly authorized hosted checks recorded four successful signed-in reports with 6–9 substantive paragraphs, methods and limitations. A later generation timeout exposed a failure path; temporary synthesis failures now preserve exact retrieved evidence with a clear service-failure notice and no retry. This recovery was checked both offline and in a subsequent live run. An evidence-only recovery is not a successful full synthesis. The requested twenty-case validation is still in progress.
- These new live checks use a separate, explicitly authorized bounded test budget. Incomplete provider usage reports retain conservative spending reservations. Previous development-test budgets stay sealed.
- Prepared examples are editorial, clearly labeled, and cannot substitute for a real demonstration. The owner supplied a demo-video link and reported completing the organizer submission.

Exact quotes/model review help inspect grounding, but do not prove scientific validity or source quality. Bounded retrieval can miss context. Evidence-only output is not an established answer. Provider refusals, unavailable pages and quota/storage errors remain possible.

Accounts currently have ten attempts/user/day, also subject to monthly capacity and search bounds. Shared guest capacity can be exhausted by other visitors. No silent quota resets or automatic paid retries are provided. Reproduction needs the reader's own Supabase/provider configuration; the sample D1 ID is a placeholder. No production credentials, usage ledger or private invite is included.

## Focused streaming timeout repair — November 21

Workspace inference now uses provider-side streaming with final usage collection, then assembles a complete response before the existing JSON and quotation checks. A finite deadline covers headers and body consumption. Partial streams, refusals and truncated answers are not promoted to verified reports; paid requests remain single-attempt. All 121 offline tests and an offline workerd runtime test passed.

One separately authorized Nebius-only transport diagnostic completed eight structured sections in 51.4 seconds. Headers and first bytes arrived in about 3.8 seconds, and final token usage was retained. This diagnostic was not a Tavily-backed Workspace question and does not complete the remaining thirteen end-to-end cases. No additional research question was submitted for this repair.

## Free hosting execution repair — November 22

A guest browser run exposed Cloudflare runtime resource termination during synthesis. Moving admission and progress polling out of Next's heavy request path was insufficient by itself: a later queue invocation was also terminated. The queue now delegates each job to a SQLite-backed Durable Object, with a separate active-CPU allowance. Its caller records a terminal error if the Object fails, without rerunning inference or refunding uncertain provider exposure. Temporary authorization is cleared. Queue delivery and the durable claim still prevent duplicate paid execution.

Both local workerd protocol tests passed with mocked providers and external requests blocked, including the actual Durable Object boundary and a simulated interruption. A deployed dispatch canary with a nonexistent job ID passed without provider work. These checks do not substitute for the ongoing real guest questions; twenty-case validation remains incomplete.

The first two subsequent guest browser questions completed full reports: AI-text detector reliability (eight paragraphs, 667 words, 124 seconds) and electric/gasoline vehicle life-cycle emissions (nine paragraphs, 843 words, 79 seconds). Both retained qualified conclusions despite limited evidence, passed exact quotation checks and opened a cited passage. All five model stages in each run reported usage. These are specific observed results, not a guarantee that every future question will complete or that every retrieved source is equally strong.

Three more guest questions subsequently completed: microplastics measurement differences (eight paragraphs, 737 words, 48 seconds), online/in-person learning evidence (seven paragraphs, 628 words, 72 seconds), and recycled-packaging migration (nine paragraphs, 859 words, 71 seconds). All completed with reported usage and inspectable matching quotations. Manual review of the packaging report nevertheless found a substantive ambiguity: a toxicity level from one extracted sentence was combined with a nearby PDF table heading into a classification the passage did not clearly establish. Drafting and review instructions now explicitly reject such joins; this is a guardrail, not proof the revised model will never make that error.

All ten planned guest attempts are accounted for, including earlier failures and evidence-only outcomes; they are not all counted as successful reports. Four additional signed-in cases remain pending manual authentication. A successful final synthesis no longer labels billing data complete if planning or coverage lacked a usage report. Unknown failed-call costs retain their conservative reservations.

