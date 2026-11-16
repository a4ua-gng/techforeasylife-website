PRAGMA foreign_keys=ON;
/* Absence of a config row deliberately preserves a legacy ticket's visibility. */
CREATE TABLE IF NOT EXISTS grievance_access (
 ticket_id TEXT PRIMARY KEY REFERENCES grievances(id) ON DELETE CASCADE,
 hr_visible INTEGER NOT NULL CHECK(hr_visible IN (0,1)),
 selected_by TEXT NOT NULL REFERENCES users(id),
 selected_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS grievance_founder_recipients (
 ticket_id TEXT NOT NULL REFERENCES grievance_access(ticket_id) ON DELETE CASCADE,
 founder_id TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(ticket_id,founder_id)
);
CREATE INDEX IF NOT EXISTS idx_grievance_founder_recipient ON grievance_founder_recipients(founder_id,ticket_id);
