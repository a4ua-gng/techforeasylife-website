PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, employee_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL, designation TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('founder','hr_lead','hr_member','team_lead','employee','finance_head')),
 department TEXT NOT NULL, manager_id TEXT REFERENCES users(id), email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 joined_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','on_leave','suspended','exited')),
 password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 1,
 password_iterations INTEGER NOT NULL DEFAULT 100000, last_seen TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,window_start INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY,actor_id TEXT REFERENCES users(id),action TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
CREATE TABLE IF NOT EXISTS status_requests (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),requested_by TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('active','on_leave','suspended','exited')),reason TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected')),reviewed_by TEXT REFERENCES users(id),review_note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS onboarding (user_id TEXT PRIMARY KEY REFERENCES users(id),stage TEXT NOT NULL DEFAULT 'policy_orientation',policy_acknowledged_at TEXT,completed_at TEXT);
