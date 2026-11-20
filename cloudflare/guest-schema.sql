-- Guest research has its own finite pool. Never delete rows to restore capacity.
CREATE TABLE IF NOT EXISTS guest_research_reservations (
  request_id TEXT PRIMARY KEY,
  visitor_hash TEXT NOT NULL,
  network_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reserved_usd REAL NOT NULL DEFAULT 0 CHECK(reserved_usd >= 0 AND reserved_usd <= 1),
  cost_events TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cost_events))
);
CREATE INDEX IF NOT EXISTS guest_visitor_created ON guest_research_reservations(visitor_hash, created_at);
CREATE INDEX IF NOT EXISTS guest_network_created ON guest_research_reservations(network_hash, created_at);
