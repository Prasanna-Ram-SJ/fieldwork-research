CREATE TABLE IF NOT EXISTS judge_ledger (
  campaign TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (json_valid(state)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
