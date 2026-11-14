CREATE TABLE IF NOT EXISTS channels (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL UNIQUE,
 description TEXT NOT NULL DEFAULT '',
 department TEXT NOT NULL DEFAULT 'Company',
 posting_policy TEXT NOT NULL DEFAULT 'members' CHECK (posting_policy IN ('members','announcements')),
 created_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY,
 channel_id TEXT NOT NULL REFERENCES channels(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 body TEXT NOT NULL,
 parent_id TEXT REFERENCES messages(id),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
CREATE TABLE IF NOT EXISTS meetings (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 purpose TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 call_url TEXT NOT NULL DEFAULT '',
 participants_json TEXT NOT NULL DEFAULT '[]',
 attended_json TEXT NOT NULL DEFAULT '[]',
 decisions TEXT NOT NULL DEFAULT '',
 follow_ups TEXT NOT NULL DEFAULT '',
 department TEXT NOT NULL DEFAULT 'Company',
 kind TEXT NOT NULL DEFAULT 'meeting' CHECK (kind IN ('meeting','client_call')),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meetings_starts ON meetings(starts_at);
CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 department TEXT NOT NULL DEFAULT 'Company',
 version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS grievances (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 founder_only INTEGER NOT NULL DEFAULT 0 CHECK (founder_only IN (0,1)),
 status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved')),
 response TEXT NOT NULL DEFAULT '',
 reviewed_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grievances_author ON grievances(user_id,created_at);
CREATE TABLE IF NOT EXISTS performance_reviews (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 reviewer_id TEXT NOT NULL REFERENCES users(id),
 period TEXT NOT NULL,
 quality TEXT NOT NULL,
 timeliness TEXT NOT NULL,
 communication TEXT NOT NULL,
 initiative TEXT NOT NULL,
 reliability TEXT NOT NULL,
 collaboration TEXT NOT NULL,
 summary TEXT NOT NULL,
 next_steps TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(user_id,period,reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_performance_person ON performance_reviews(user_id,period);
CREATE TABLE IF NOT EXISTS exit_requests (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 proposed_end TEXT NOT NULL,
 handover_plan TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 reviewed_by TEXT REFERENCES users(id),
 review_comment TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 reviewed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_exit ON exit_requests(user_id) WHERE status='pending';
INSERT OR IGNORE INTO channels(id,name,description,department,posting_policy,created_at) VALUES
 ('general','general','Shared updates, questions and team coordination.','Company','members','2026-11-14T00:00:00.000Z'),
 ('announcements','announcements','Official company announcements from leadership and HR.','Company','announcements','2026-11-14T00:00:00.000Z'),
 ('hr','hr','People operations and HR coordination.','HR','members','2026-11-14T00:00:00.000Z'),
 ('marketing','marketing','Campaign planning, creative collaboration and delivery.','Marketing','members','2026-11-14T00:00:00.000Z'),
 ('finance','finance','Restricted finance coordination.','Finance','members','2026-11-14T00:00:00.000Z'),
 ('founders','founders','Restricted founder decisions and organisational coordination.','Leadership','members','2026-11-14T00:00:00.000Z');
