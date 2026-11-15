CREATE TABLE IF NOT EXISTS operational_email_jobs (
 id TEXT PRIMARY KEY,
 event_key TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('daily_tasks','meeting_invitation','meeting_reminder','task_transfer_requested','task_transfer_approved')),
 entity_id TEXT NOT NULL,
 source_at TEXT NOT NULL,
 scheduled_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','blocked','sending','sent','skipped','needs_review')),
 recipient TEXT NOT NULL DEFAULT '',
 provider_id TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 claimed_at TEXT,
 sent_at TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL DEFAULT '',
 error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_operational_email_due ON operational_email_jobs(status,next_attempt_at,scheduled_at);
CREATE TABLE IF NOT EXISTS operational_email_delivery_gate (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 lease_token TEXT NOT NULL DEFAULT '',
 lease_expires_at INTEGER NOT NULL DEFAULT 0,
 next_send_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO operational_email_delivery_gate(singleton) VALUES(1);
INSERT OR IGNORE INTO app_settings(key,value) VALUES('operational_email_enabled_at','');
INSERT OR IGNORE INTO app_settings(key,value) VALUES('operational_email_daily_start_date','');
INSERT OR IGNORE INTO app_settings(key,value) VALUES('operational_email_daily_time','09:00');
