/* Additive outbox: the live operational_email_jobs kind CHECK stays intact. */
CREATE TABLE IF NOT EXISTS urgent_task_email_jobs (
 id TEXT PRIMARY KEY,
 event_key TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind='urgent_task_assigned'),
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
CREATE INDEX IF NOT EXISTS idx_urgent_task_email_due ON urgent_task_email_jobs(status,next_attempt_at,scheduled_at);
/* Enable explicitly only after the additive schema and application are ready. */
INSERT OR IGNORE INTO app_settings(key,value) VALUES('urgent_task_email_enabled_at','');
