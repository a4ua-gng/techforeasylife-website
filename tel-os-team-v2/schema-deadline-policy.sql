/* One automatic calendar day per task. Original deadlines remain inspectable. */
CREATE TABLE IF NOT EXISTS deadline_extension_records (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),
 assignee_id TEXT NOT NULL REFERENCES users(id),
 leader_id TEXT NOT NULL REFERENCES users(id),
 original_deadline TEXT NOT NULL,
 extended_deadline TEXT NOT NULL,
 extra_days INTEGER NOT NULL DEFAULT 1 CHECK(extra_days=1),
 created_at TEXT NOT NULL,
 escalated_at TEXT,
 CHECK(length(original_deadline)=10 AND length(extended_deadline)=10),
 CHECK(date(original_deadline,'+1 day')=extended_deadline)
);
CREATE INDEX IF NOT EXISTS idx_deadline_extension_escalation ON deadline_extension_records(escalated_at,extended_deadline);
/* Additive outbox; existing operational and urgent kind checks remain intact. */
CREATE TABLE IF NOT EXISTS deadline_email_jobs (
 id TEXT PRIMARY KEY,
 event_key TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('deadline_grace_granted','deadline_grace_missed')),
 entity_id TEXT NOT NULL REFERENCES deadline_extension_records(id),
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
CREATE INDEX IF NOT EXISTS idx_deadline_email_due ON deadline_email_jobs(status,next_attempt_at,scheduled_at);
/* Explicit activation avoids applying this policy to historical overdue work. */
INSERT OR IGNORE INTO app_settings(key,value) VALUES('deadline_policy_enabled_at','');
