# Validation and known limitations

Checked November 20, 2026. Offline tests, actual provider calls and pending demonstration are distinguished below.

- **104 offline tests pass:** quotation/source integrity, missing-proof recovery, independently malformed items, actual guest-runner completion with mocked model responses, fabricated-proof rejection, durable quota concurrency, cookies, auth/navigation, PDF parsing and citation exports.
- TypeScript and the isolated Worker build passed for the deployed source. Build output was scanned for embedded provider/session secrets. The public status endpoint returned HTTP 200 with runtime configuration present.
- Earlier bounded live development checks exercised Token Factory and Tavily. The latest hosted check reached planning, search, reading, synthesis and verification, but the old report handler rejected its output. Later recovery fixes were tested offline. **A complete newly successful live report after those fixes has not been independently recorded or retested by the assistant.**
- No new paid provider calls were made while preparing this repository. Further assistant-run paid checks need the owner's authorization; users' own app submissions consume configured credits.
- Prepared examples are editorial, clearly labeled, and cannot substitute for the real demonstration. Demo recording and organizer submission are pending.

Exact quotes/model review help inspect grounding, but do not prove scientific validity or source quality. Bounded retrieval can miss context. Evidence-only output is not an established answer. Provider refusals, unavailable pages and quota/storage errors remain possible.

Accounts currently have ten attempts/user/day, also subject to monthly capacity and search bounds. Shared guest capacity can be exhausted by other visitors. No silent quota resets or automatic paid retries are provided. Reproduction needs the reader's own Supabase/provider configuration; the sample D1 ID is a placeholder. No production credentials, usage ledger or private invite is included.
