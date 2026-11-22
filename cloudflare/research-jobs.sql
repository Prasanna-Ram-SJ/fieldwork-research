-- Adds durable work without modifying or resetting any existing quota row.
CREATE TABLE IF NOT EXISTS research_jobs (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')),
  sealed_input TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS research_jobs_expiry ON research_jobs(expires_at);
CREATE TABLE IF NOT EXISTS research_job_events (
  job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL, frame TEXT NOT NULL,
  PRIMARY KEY(job_id, sequence)
);
