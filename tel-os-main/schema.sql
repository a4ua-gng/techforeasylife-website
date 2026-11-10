PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('founder','hr','lead','employee')),
 password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
 is_minor INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1,
 force_reset INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, last_seen INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_failures (
 username TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS work_sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 work_date TEXT NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER,
 break_started_at INTEGER, break_ms INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL CHECK(state IN ('working','break','finished')), updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_sessions_user_date ON work_sessions(user_id,work_date);
CREATE TABLE IF NOT EXISTS clients (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, category TEXT DEFAULT 'Marketing', active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, client_id TEXT REFERENCES clients(id), title TEXT NOT NULL,
 details TEXT DEFAULT '', assignee_id TEXT REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','working','review','done')),
 priority TEXT NOT NULL DEFAULT 'normal', due_date TEXT, estimated_min INTEGER DEFAULT 60,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE TABLE IF NOT EXISTS leave_requests (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), start_date TEXT NOT NULL,
 end_date TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 reviewer_id TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meetings (
 id TEXT PRIMARY KEY, topic TEXT NOT NULL, objective TEXT NOT NULL,
 starts_at TEXT NOT NULL, notes TEXT DEFAULT '', owner_id TEXT REFERENCES users(id),created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS call_logs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), client_id TEXT REFERENCES clients(id),
 status TEXT NOT NULL CHECK(status IN ('answered','missed','returned')),
 notes TEXT DEFAULT '', logged_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
 id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, entity TEXT,
 detail TEXT, created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO clients (id,name,category) VALUES
 ('skgroup','SK Group X','Group marketing'),
 ('montra','Montra Electric','Automotive'),
 ('royalenfield','Royal Enfield','Automotive'),
 ('internal','TEL Internal','Operations');
-- TEL OS 1.0: student-aware HR and operational modules
ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT 'General';
ALTER TABLE users ADD COLUMN designation TEXT NOT NULL DEFAULT 'Team member';
ALTER TABLE users ADD COLUMN reporting_manager TEXT;
ALTER TABLE users ADD COLUMN joining_date TEXT;
ALTER TABLE users ADD COLUMN weekly_plan TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN last_login_at INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN deliverable_url TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN review_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN submitted_at INTEGER;
ALTER TABLE tasks ADD COLUMN approved_by TEXT;
CREATE TABLE IF NOT EXISTS availability (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), day TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('available','school','exam','leave','unavailable')),
 start_time TEXT, end_time TEXT, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
 UNIQUE(user_id,day)
);
CREATE INDEX IF NOT EXISTS idx_availability_day ON availability(day);
CREATE TABLE IF NOT EXISTS handovers (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), from_user_id TEXT NOT NULL REFERENCES users(id),
 to_user_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','approved','declined')) DEFAULT 'pending',
 requested_at INTEGER NOT NULL, reviewed_by TEXT, reviewed_at INTEGER
);
CREATE TABLE IF NOT EXISTS attendance_corrections (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), work_date TEXT NOT NULL,
 reason TEXT NOT NULL, requested_minutes INTEGER,
 status TEXT NOT NULL CHECK(status IN ('pending','approved','declined')) DEFAULT 'pending',
 reviewed_by TEXT, review_note TEXT DEFAULT '', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS grievances (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL,
 detail TEXT NOT NULL, founder_only INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_review','resolved')),
 created_at INTEGER NOT NULL, resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS exit_requests (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), proposed_end TEXT NOT NULL,
 handover_plan TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 reviewed_by TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS official_documents (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
 url TEXT NOT NULL, revision TEXT NOT NULL DEFAULT '1.0', created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS announcements (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, author_id TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oncall_roster (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), starts_at INTEGER NOT NULL,
 ends_at INTEGER NOT NULL, allowance_rupees INTEGER NOT NULL DEFAULT 500, note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'scheduled', created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_events (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), actor_id TEXT NOT NULL REFERENCES users(id),
 event_type TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shift_plans (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), day TEXT NOT NULL,
 start_time TEXT NOT NULL, end_time TEXT NOT NULL, approved_by TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, UNIQUE(user_id,day)
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 message TEXT NOT NULL DEFAULT '', is_read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id,is_read);