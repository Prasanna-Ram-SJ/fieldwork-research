# Deploying your own instance

Source publication does not redeploy the live app. Use your own accounts, configuration and resource IDs.

1. Configure Supabase/OAuth as in README; run all migrations in order. Add your production `/auth/callback` URL to Supabase's redirect allowlist.
2. Authenticate Wrangler to your account. Run `npx wrangler d1 create fieldwork-judge-quota`. Replace the all-zero `database_id` in `wrangler.toml` with the returned ID. If renaming the Worker, update its self-reference service name too.
3. Initialize your new database with `npx wrangler d1 execute fieldwork-judge-quota --remote --file cloudflare/judge-schema.sql` and `npx wrangler d1 execute fieldwork-judge-quota --remote --file cloudflare/guest-schema.sql`. `guest-cost-upgrade.sql` is only for an older schema; fresh guest schema already includes its column. Also apply `cloudflare/research-jobs.sql` for the additive background-job tables. Run `npx wrangler queues create fieldwork-research-jobs` before the first deployment. Never reset existing quota data.
4. Run `npm run build:worker`. It builds an isolated OpenNext tree using only public browser configuration and scans for embedded secrets. Do not invoke raw OpenNext build from a directory with real server env files.
5. Use `npx wrangler secret put NAME` to configure your own runtime `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEBIUS_API_KEY`, `TAVILY_API_KEY`, `PROVIDER_REQUESTS_ENABLED` and `JUDGE_SESSION_SECRET`. Enter values in CLI prompts, not public files/command arguments. Generate a high-entropy signing secret. Do not reuse another deployment's secrets.
6. Run `npx wrangler deploy --keep-vars`. The included migration creates the SQLite-backed `ResearchRunner` Durable Object, supported on Workers Free; no paid plan change is needed. Follow Wrangler's account-specific first-Worker prompts as needed. Review guest limits before enabling traffic. Provider billing controls remain necessary.

Public guest research needs D1, a signing secret, enabled provider setting and keys. Its current limits are ten questions/guest/day, twenty/network/day, one hundred shared launch questions total, plus a conservative per-question cost envelope. These protect this instance; they do not control use of the same key elsewhere.

Optional judge-code access additionally needs code hash, expiry, request limit and an initialized durable ledger row. It is not needed for ordinary public guest Workspace access. `scripts/configure-cloudflare-runtime.cjs` is a historical migration helper requiring private existing local state; do not run it on a fresh clone. Never publish code cards, real env files or ledger rows.

Do not change a shared workers.dev namespace to rename one app, or modify unrelated Workers. Reading `/api/status` checks configuration only; it does not prove a complete live research run.

The custom Worker handles admission and short progress reads. A Free-plan queue delegates research to a SQLite-backed Durable Object in the same Worker, separating its active CPU from the HTTP and queue admission contexts. Workspace renders the same events. Queue retries are disabled and a durable claim prevents repeated paid work. The caller records an error if the Object is interrupted. Job input is encrypted, read access is owner-scoped, and temporary authorization is erased after processing. Successful metered model calls reconcile pessimistic reservations at conservative doubled rates; failed or unmetered calls keep their upper holds. The atomic one-dollar guest envelope remains intact. Free daily hosting limits still apply.

Run `node scripts/test-job-runtime.cjs` to check the guest protocol and cost settlement in local workerd with mock research and outbound networking blocked. This check requires local runtime networking but no provider credentials or credits.

Run `node scripts/test-object-runtime.cjs` to check the real local Durable Object boundary, successful completion and caller-side interruption handling under the same offline restrictions.
