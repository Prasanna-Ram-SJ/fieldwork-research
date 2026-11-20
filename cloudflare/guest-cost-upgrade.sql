-- One-time upgrade for the guest table just created, before public guest usage.
ALTER TABLE guest_research_reservations ADD COLUMN reserved_usd REAL NOT NULL DEFAULT 0 CHECK(reserved_usd >= 0 AND reserved_usd <= 1);
ALTER TABLE guest_research_reservations ADD COLUMN cost_events TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cost_events));
