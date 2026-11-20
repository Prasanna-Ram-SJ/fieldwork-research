# Fieldwork project report

Team InVis · ODSC × Nebius Research Agent Hackathon · November 21, 2026

Fieldwork is a student research application that connects an answer to the evidence behind it. Its Workspace combines live web research, a readable report, a record of research actions and an Evidence panel. Students can open cited passages and their original pages, examine source limitations and continue with a follow-up question. A separate Projects workflow supports assignments and uploaded papers.

The application uses Nebius Token Factory for model inference and Tavily for real-time web search. It is deployed on Cloudflare Workers, with Supabase for account data and Cloudflare D1 for shared guest and judge quotas.

- [Open Fieldwork](https://fieldwork-research.prasannaramcollege.workers.dev)
- [Public source and setup instructions](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Validation and known limitations](VALIDATION.md)

## Team

Fieldwork was built by Team InVis.

| Member | GitHub |
|---|---|
| Prasanna Ram SJ — Team captain | [Prasanna-Ram-SJ](https://github.com/Prasanna-Ram-SJ) |
| Kamalika M | [kamalika-0412](https://github.com/kamalika-0412) |
| Harishma Muthuram | [harishmamuthuram](https://github.com/harishmamuthuram) |
| Kirthik | [kirutikzz30](https://github.com/kirutikzz30) |

## The student research problem

A research answer is difficult to use responsibly when the reader cannot tell which source supports a statement, whether a source is a complete paper or a short excerpt, and where uncertainty remains. Students also need to carry evidence into an assignment: compare studies, keep notes and produce references without repeatedly reconstructing the research trail.

Fieldwork addresses those tasks through evidence inspection and continuity between questions, papers and notes. The intended value is a workflow that makes checking easier. No comparative user study or performance benchmark against other assistants is claimed.

## The user experience

The public homepage leads to Workspace through **Try without signing in**. Guests can enter their own questions within a shared preview allowance. Their answers stay in the open tab. Signing in enables account-backed conversations, Library and Projects; it does not automatically transfer a guest answer into an account.

Within Workspace, the answer occupies the center, Activity and Evidence share the left panel, and an outline on the right tracks the report's sections. Citations open the associated source material. Activity describes real planning, searches, reading and coverage decisions rather than displaying hidden model reasoning. On phones, side panels open through controls so the answer remains readable.

Library supports searching and reopening saved account conversations. Projects guides students through assignment requirements, paper discovery or PDF upload, and evidence exploration. Its tools include selected-paper comparison, paper Q&A, draft-claim checks, notes and reference exports. These tools supplement the main web research agent rather than replace the required Tavily search workflow.

## From question to report

1. **Authorize and reserve capacity.** The server checks account or guest access and reserves the applicable quota before paid research work.
2. **Plan relevant queries.** Token Factory inference identifies the question's focus, research angles and evidence needs. The pipeline runs up to two initial Tavily basic searches.
3. **Select and read evidence.** Results retain their original URLs and are deduplicated. A bounded reader extracts available public HTML or PDF text. Search excerpts, abstracts, partial documents and original text keep distinct access labels.
4. **Assess coverage.** A model assessment identifies addressed, partial and missing aspects. One targeted refinement may fill a gap, within a maximum of three basic searches per turn. The pipeline stops at its bounds even when the question is not fully resolved.
5. **Draft and check the answer.** Token Factory produces a structured report. Each retained factual statement needs real source references and an exact supporting passage. The existing evidence-review call can locate missing proof in the allowed retrieved passages; a final validator checks the source, passage and quotation.
6. **Present the result with its limits.** The interface shows retained statements, source comparisons where supported, coverage and remaining uncertainty. Account results can be saved and reopened with their evidence and activity.

Implementation: [research pipeline](../src/lib/research/pipeline.ts), [draft preparation](../src/lib/research/report-draft.ts), [report synthesis](../src/lib/research/report-synthesizer.ts) and [final validation](../src/lib/research/validate-report.ts).

## Meaningful use of the required services

**Nebius Token Factory** drives query planning, coverage assessment, report generation and evidence review. The configured model is `moonshotai/Kimi-K3.1-Pro`, accessed through the Token Factory inference API. The model is configurable; changing it also requires reviewing the guest cost-reservation assumptions. See the [Nebius adapter](../src/lib/providers/nebius.ts).

**Tavily** retrieves live web evidence rather than serving as a decorative integration. Search URLs and excerpts enter source selection and reading, then remain associated with the report's citations. See the [Tavily adapter](../src/lib/providers/tavily.ts).

Supabase stores authenticated user data with row-level security and transactional quota protection. OpenNext adapts the Next.js application to Workers. D1 provides shared quota state for hosted guests and optional code-protected judge access. The public source contains sample configuration, not production keys or private usage ledgers.

## Evidence integrity and failure behavior

An existing citation is not enough to approve a statement. Its source and passage must exist, its quotation must match the retrieved text, and the evidence review must approve the complete statement. One malformed item does not discard independently usable items. This prevents a missing proof field from stopping an otherwise usable report while keeping unsupported prose out of the answer.

If no answer statements pass but readable passages exist, Fieldwork shows explicitly labeled source excerpts with the answer marked as not established. It does not present those excerpts as a completed synthesis. If no usable evidence exists, or a provider refuses the request, the application reports the failure. Quota and storage failures are not silently bypassed, and paid provider requests are not automatically retried.

Retrieved content is treated as untrusted data rather than instructions. The source reader bounds URLs, destinations, redirects, response sizes and reading time. Account data is user-scoped. Quota reservations remain counted after failed attempts; refreshing or deleting a conversation does not refill them.

## A prepared evidence example

The included example asks whether open access guarantees more citations. It contrasts a 2006 bibliometric cohort with a 2021 systematic review, allowing readers to inspect study scope and mixed evidence rather than treating a citation advantage as universal.

- [Eysenbach, Citation Advantage of Open Access Articles](https://doi.org/10.1371/journal.pbio.0040157)
- [Langham-Putrow, Bakker and Riegelman, Is the open access citation advantage real?](https://doi.org/10.1371/journal.pone.0253129)

The example is prepared editorial content, not a recorded live model run. Its publisher PDFs retain their attribution and stated Creative Commons terms. [Paper credits](../public/demo/ATTRIBUTION.txt) identify the originals. The prepared example cannot substitute for a real research demonstration in the submission video.

## Validation and remaining limitations

As of November 20, the publication checkout passed **104 offline tests** and TypeScript checks. Coverage includes source and quotation integrity, missing-proof recovery, malformed output, guest-runner completion with mocked model responses, quota concurrency, signed cookies, PDF extraction, citation exports and navigation. The isolated Worker build and deployment secret scan also passed.

Earlier bounded live development checks exercised both required providers. The latest hosted check reached planning, search, reading, synthesis and verification, but the old handler rejected the generated report. Subsequent recovery fixes passed offline regression checks. A newly successful complete live report after those fixes has not been independently recorded or retested by the assistant. No new paid provider calls were made to prepare this report.

Exact matching establishes that a quotation exists in the retrieved material; it does not prove scientific validity or that every inference is correct. Bounded retrieval can miss context, inaccessible pages may remain excerpt-only, and search ranking does not certify peer review or source independence. Scanned PDFs require external OCR. Planning and verification increase latency and provider cost. Guest allowances are shared and can be exhausted by other visitors.

The demo video remains pending. It should show a real question proceeding through the actual providers, the resulting answer, opened citations and an honest failure or insufficient-evidence case. This report accompanies the source and video; it does not itself submit the project to the organizers.

## Source and design provenance

The repository was generated from the organizer's [official template](https://github.com/odsc2015/nebius-research-agent-hackaton-template), and the original scaffold is preserved for provenance. Fieldwork is a Next.js and TypeScript implementation rather than the template's minimal Python application. Its newspaper presentation includes modified Originkit components supplied by the owner, with their underlying license terms retained. Fonts, PDF tools, citation styles and example papers keep their respective notices. See [third-party notices](../THIRD_PARTY_NOTICES.md).
