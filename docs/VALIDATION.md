# Validation and known limitations

Checked November 21, 2026. Offline tests, actual provider calls and pending demonstration are distinguished below.

- **121 offline tests pass:** quotation/source integrity, missing-proof recovery, independently malformed items, actual guest-runner completion with mocked model responses, fabricated-proof rejection, durable quota concurrency, cookies, auth/navigation, PDF parsing and citation exports.
- TypeScript and the isolated Worker build passed for the deployed source. Build output was scanned for embedded provider/session secrets. The public status endpoint returned HTTP 200 with runtime configuration present.
- Newly authorized hosted checks recorded four successful signed-in reports with 6–9 substantive paragraphs, methods and limitations. A later generation timeout exposed a failure path; temporary synthesis failures now preserve exact retrieved evidence with a clear service-failure notice and no retry. This recovery was checked both offline and in a subsequent live run. An evidence-only recovery is not a successful full synthesis. The requested twenty-case validation is still in progress.
- These new live checks use a separate, explicitly authorized bounded test budget. Incomplete provider usage reports retain conservative spending reservations. Previous development-test budgets stay sealed.
- Prepared examples are editorial, clearly labeled, and cannot substitute for a real demonstration. The owner supplied a demo-video link and reported completing the organizer submission.

Exact quotes/model review help inspect grounding, but do not prove scientific validity or source quality. Bounded retrieval can miss context. Evidence-only output is not an established answer. Provider refusals, unavailable pages and quota/storage errors remain possible.

Accounts currently have ten attempts/user/day, also subject to monthly capacity and search bounds. Shared guest capacity can be exhausted by other visitors. No silent quota resets or automatic paid retries are provided. Reproduction needs the reader's own Supabase/provider configuration; the sample D1 ID is a placeholder. No production credentials, usage ledger or private invite is included.

## Focused streaming timeout repair — November 21

Workspace inference now uses provider-side streaming with final usage collection, then assembles a complete response before the existing JSON and quotation checks. A finite deadline covers headers and body consumption. Partial streams, refusals and truncated answers are not promoted to verified reports; paid requests remain single-attempt. All 121 offline tests and an offline workerd runtime test passed.

One separately authorized Nebius-only transport diagnostic completed eight structured sections in 51.4 seconds. Headers and first bytes arrived in about 3.8 seconds, and final token usage was retained. This diagnostic was not a Tavily-backed Workspace question and does not complete the remaining thirteen end-to-end cases. No additional research question was submitted for this repair.

