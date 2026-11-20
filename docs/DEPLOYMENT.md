# Deploying your own instance

Source publication does not redeploy the live app. Use your own accounts, configuration and resource IDs.

1. Configure Supabase/OAuth as in README; run all migrations in order. Add your production `/auth/callback` URL to Supabase's redirect allowlist.
2. Authenticate Wrangler to your account. Run `npx wrangler d1 create fieldwork-judge-quota`. Replace the all-zero `database_id` in `wrangler.toml` with the returned ID. If renaming the Worker, update its self-reference service name too.
3. Initialize your new database with `npx wrangler d1 execute fieldwork-judge-quota --remote --file cloudflare/judge-schema.sql` and `npx wrangler d1 execute fieldwork-judge-quota --remote --file cloudflare/guest-schema.sql`. `guest-cost-upgrade.sql` is only for an older schema; fresh guest schema already includes its column. Never reset existing quota data.
4. Run `npm run build:worker`. It builds an isolated OpenNext tree using only public browser configuration and scans for embedded secrets. Do not invoke raw OpenNext build from a directory with real server env files.
5. Use `npx wrangler secret put NAME` to configure your own runtime `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEBIUS_API_KEY`, `TAVILY_API_KEY`, `PROVIDER_REQUESTS_ENABLED` and `JUDGE_SESSION_SECRET`. Enter values in CLI prompts, not public files/command arguments. Generate a high-entropy signing secret. Do not reuse another deployment's secrets.
6. Run `npx wrangler deploy --keep-vars`. Follow Wrangler's account-specific first-Worker prompts as needed. Review guest limits before enabling traffic. Provider billing controls remain necessary.

Public guest research needs D1, a signing secret, enabled provider setting and keys. Its current limits are three questions/guest/day, five/network/day, twenty shared launch questions total, plus a conservative per-question cost envelope. These protect this instance; they do not control use of the same key elsewhere.

Optional judge-code access additionally needs code hash, expiry, request limit and an initialized durable ledger row. It is not needed for ordinary public guest Workspace access. `scripts/configure-cloudflare-runtime.cjs` is a historical migration helper requiring private existing local state; do not run it on a fresh clone. Never publish code cards, real env files or ledger rows.

Do not change a shared workers.dev namespace to rename one app, or modify unrelated Workers. Reading `/api/status` checks configuration only; it does not prove a complete live research run.
