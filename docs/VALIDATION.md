# Validation and known limitations

Checked November 22, 2026. Offline tests, actual provider calls and pending demonstration are distinguished below.

- **150 offline tests pass:** quotation/source integrity, missing-proof recovery, independently malformed items, actual guest-runner completion with mocked model responses, fabricated-proof rejection, durable quota concurrency, cookies, auth/navigation, PDF parsing, citation exports, interrupted background-job handling and incomplete provider-usage disclosure.
- TypeScript and the isolated Worker build passed for the deployed source. Build output was scanned for embedded provider/session secrets. The public status endpoint returned HTTP 200 with runtime configuration present.
- The twenty planned browser attempts are now accounted for: ten guest and ten signed-in. Thirteen returned synthesized reports, three returned labeled evidence-only recoveries, and four earlier attempts failed. This is not twenty passing tests. The nine latest runs on the repaired Object runner returned full reports with matching quotations and opened citations; all four newly completed account reports also restored from saved history.
- These new live checks use a separate, explicitly authorized bounded test budget. Incomplete provider usage reports retain conservative spending reservations. Previous development-test budgets stay sealed.
- Prepared examples are editorial, clearly labeled, and cannot substitute for a real demonstration. The owner supplied a demo-video link and reported completing the organizer submission.

Exact quotes/model review help inspect grounding, but do not prove scientific validity or source quality. Bounded retrieval can miss context. Evidence-only output is not an established answer. Provider refusals, unavailable pages and quota/storage errors remain possible.

Accounts currently have ten attempts/user/day, also subject to monthly capacity and search bounds. Shared guest capacity can be exhausted by other visitors. No silent quota resets or automatic paid retries are provided. Reproduction needs the reader's own Supabase/provider configuration; the sample D1 ID is a placeholder. No production credentials, usage ledger or private invite is included.

## Focused streaming timeout repair — November 21

Workspace inference now uses provider-side streaming with final usage collection, then assembles a complete response before the existing JSON and quotation checks. A finite deadline covers headers and body consumption. Partial streams, refusals and truncated answers are not promoted to verified reports; paid requests remain single-attempt. All 121 offline tests and an offline workerd runtime test passed.

One separately authorized Nebius-only transport diagnostic completed eight structured sections in 51.4 seconds. Headers and first bytes arrived in about 3.8 seconds, and final token usage was retained. This diagnostic was not a Tavily-backed Workspace question and does not complete the remaining thirteen end-to-end cases. No additional research question was submitted for this repair.

## Free hosting execution repair — November 22

A guest browser run exposed Cloudflare runtime resource termination during synthesis. Moving admission and progress polling out of Next's heavy request path was insufficient by itself: a later queue invocation was also terminated. The queue now delegates each job to a SQLite-backed Durable Object, with a separate active-CPU allowance. Its caller records a terminal error if the Object fails, without rerunning inference or refunding uncertain provider exposure. Temporary authorization is cleared. Queue delivery and the durable claim still prevent duplicate paid execution.

Both local workerd protocol tests passed with mocked providers and external requests blocked, including the actual Durable Object boundary and a simulated interruption. A deployed dispatch canary with a nonexistent job ID passed without provider work. Subsequent live browser results are recorded below; offline and canary checks alone do not establish real research success.

The first two subsequent guest browser questions completed full reports: AI-text detector reliability (eight paragraphs, 667 words, 124 seconds) and electric/gasoline vehicle life-cycle emissions (nine paragraphs, 843 words, 79 seconds). Both retained qualified conclusions despite limited evidence, passed exact quotation checks and opened a cited passage. All five model stages in each run reported usage. These are specific observed results, not a guarantee that every future question will complete or that every retrieved source is equally strong.

Three more guest questions subsequently completed: microplastics measurement differences (eight paragraphs, 737 words, 48 seconds), online/in-person learning evidence (seven paragraphs, 628 words, 72 seconds), and recycled-packaging migration (nine paragraphs, 859 words, 71 seconds). All completed with reported usage and inspectable matching quotations. Manual review of the packaging report nevertheless found a substantive ambiguity: a toxicity level from one extracted sentence was combined with a nearby PDF table heading into a classification the passage did not clearly establish. Drafting and review instructions now explicitly reject such joins; this is a guardrail, not proof the revised model will never make that error.

All ten planned guest attempts are accounted for, including earlier failures and evidence-only outcomes; they are not all counted as successful reports. Signed-in testing resumed in a separate manually authenticated profile. A campus food-waste question returned eight supported paragraphs (715 words) and restored correctly from account history. One coverage stage reached its earlier 30-second deadline, so the complete report correctly disclosed incomplete token usage. Coverage now has a finite 90-second single-attempt deadline; there is no retry. The final three signed-in cases subsequently completed and restored from history.

A successful final synthesis no longer labels billing data complete if planning or coverage lacked a usage report. Unknown failed-call costs retain their conservative reservations. Read-only reopens of three earlier account reports restored their paragraphs and opened cited passages without any new research submission.

## Final results on the repaired runner

“Full report” means generated research paragraphs were retained after evidence checks; it is not a guarantee of scientific correctness. Paragraphs lacking acceptable support were omitted, which explains the shorter thermal-storage report. None of the earlier failed questions was replayed to replace its outcome.

| Mode | Topic | Paragraphs | Words | Seconds |
| --- | --- | ---: | ---: | ---: |
| Guest | AI-text detector reliability | 8 | 667 | 124 |
| Guest | Vehicle life-cycle emissions | 9 | 843 | 79 |
| Guest | Microplastics measurement differences | 8 | 737 | 48 |
| Guest | Online and in-person learning | 7 | 628 | 72 |
| Guest | Recycled-packaging migration* | 9 | 859 | 71 |
| Account | Campus food-waste interventions | 8 | 715 | 221 |
| Account | Thermal-energy storage | 5 | 449 | 261 |
| Account | Battery-charging habits | 9 | 806 | 268 |
| Account | ML benchmark reproducibility | 9 | 832 | 391 |

*The packaging report had the PDF-table classification ambiguity described above. Exact quotation matching did not catch that semantic issue. The last benchmark report completed despite an unavailable coverage assessment; its partial usage flag remained false and conservative unknown-cost exposure was retained. These are recorded limitations, not hidden passing results.

Cloudflare's read-only metrics query reported no `exceededResources` invocations from the final runner deployment through the end of this batch. All 148 offline tests passed, along with TypeScript/build checks and deployment secret scans. Research latency remains variable: the longest of these cases took approximately 6.5 minutes. Provider availability, source selection, interpretation errors and shared quotas can still affect future questions. The bounded batch is closed; there is no automatic retest or open-ended paid validation.


## Responsive layout and conversation navigation repair — November 22

The About guide's fixed-height story rows could overflow their grid at intermediate viewport sizes. It now measures the available space, balances row heights and uses the existing compact or pocket copy only when necessary. The full newspaper edition remains at sizes where it fits; all six workflow steps remain on a single screen. Browser checks covered 176 viewport combinations, including short landscape screens, and the original failing tablet/phone sizes were visually inspected.

Workspace previously forced the answer to the bottom on every progress event. Automatic following now respects an outline jump or scrolling back to an older answer. Both an in-progress follow-up and a completed two-answer outline stayed at the selected earlier section in the mocked browser checks.

The navbar previously blocked Workspace during research, while saved-chat loading waited for the running task. Running research now owns its own state snapshot. Workspace returns to that task while it is active; another saved conversation can open immediately and cannot receive its events or answer. When no task is running, Workspace still starts fresh. Submission remains limited to one running task. A delayed conversation-creation response also cannot redirect the user away from a different Library chat.

Two new state-race regression tests bring the Node suite to 150 passing tests. A browser fixture exercised the real React components with mocked authentication, routing and research responses, including background completion while another chat was open. External networking was blocked and no Tavily/Nebius calls were made. The previously sealed paid validation budget and all usage counts were preserved.
