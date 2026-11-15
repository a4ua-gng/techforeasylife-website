CREATE TABLE IF NOT EXISTS task_transfer_requests (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES tasks(id),
 from_user_id TEXT NOT NULL REFERENCES users(id),
 to_user_id TEXT NOT NULL REFERENCES users(id),
 reviewer_id TEXT NOT NULL REFERENCES users(id),
 requested_by TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 reason TEXT NOT NULL DEFAULT '',
 decision_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 decided_at TEXT,
 decision_actor_id TEXT REFERENCES users(id),
 CHECK(from_user_id<>to_user_id),
 CHECK(from_user_id<>reviewer_id),
 CHECK(to_user_id<>reviewer_id),
 CHECK(requested_by=from_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_task_transfer_v25 ON task_transfer_requests(task_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS task_transfers_reviewer_v25 ON task_transfer_requests(reviewer_id,status,created_at);
CREATE INDEX IF NOT EXISTS task_transfers_requester_v25 ON task_transfer_requests(requested_by,created_at);
