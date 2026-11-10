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
