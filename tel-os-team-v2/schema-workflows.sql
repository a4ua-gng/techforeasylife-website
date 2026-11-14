PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',assignee_id TEXT NOT NULL REFERENCES users(id),leader_id TEXT NOT NULL REFERENCES users(id),department TEXT NOT NULL,priority TEXT NOT NULL CHECK(priority IN ('normal','high','urgent')),deadline TEXT NOT NULL,expected_deliverable TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','working','review','revision','approved','done')),submission TEXT NOT NULL DEFAULT '',feedback TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id,status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(status,deadline);
CREATE TABLE IF NOT EXISTS task_events (id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leave_requests (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),type TEXT NOT NULL CHECK(type IN ('examination','academic','medical','personal','emergency')),start_date TEXT NOT NULL,end_date TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending_lead' CHECK(status IN ('pending_lead','pending_hr','approved','rejected')),leader_id TEXT REFERENCES users(id),leader_note TEXT NOT NULL DEFAULT '',hr_id TEXT REFERENCES users(id),hr_note TEXT NOT NULL DEFAULT '',handover_to TEXT REFERENCES users(id),handover_notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,CHECK(start_date<=end_date)
);
CREATE INDEX IF NOT EXISTS idx_leaves_user_dates ON leave_requests(user_id,start_date,end_date);
CREATE TABLE IF NOT EXISTS attendance_sessions (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),work_date TEXT NOT NULL,clock_in TEXT NOT NULL,clock_out TEXT,state TEXT NOT NULL CHECK(state IN ('working','break','closed')),active_started_at TEXT,break_started_at TEXT,active_seconds INTEGER NOT NULL DEFAULT 0 CHECK(active_seconds>=0),break_seconds INTEGER NOT NULL DEFAULT 0 CHECK(break_seconds>=0),source TEXT NOT NULL DEFAULT 'clock' CHECK(source IN ('clock','correction')),updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_session_per_user ON attendance_sessions(user_id) WHERE clock_out IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_sessions(user_id,work_date);
CREATE TABLE IF NOT EXISTS attendance_corrections (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),work_date TEXT NOT NULL,requested_seconds INTEGER NOT NULL CHECK(requested_seconds BETWEEN 0 AND 86400),reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),reviewed_by TEXT REFERENCES users(id),review_note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_correction ON attendance_corrections(user_id,work_date) WHERE status='pending';
CREATE TABLE IF NOT EXISTS availability (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('exam','unavailable','available','weekly_schedule')),start_date TEXT NOT NULL,end_date TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,CHECK(start_date<=end_date)
);
CREATE TABLE IF NOT EXISTS handovers (
 id TEXT PRIMARY KEY,leave_id TEXT NOT NULL UNIQUE REFERENCES leave_requests(id),from_user TEXT NOT NULL REFERENCES users(id),to_user TEXT NOT NULL REFERENCES users(id),start_date TEXT NOT NULL,end_date TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,CHECK(from_user<>to_user)
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,body TEXT NOT NULL,link TEXT NOT NULL DEFAULT '',read_at TEXT,created_at TEXT NOT NULL,dedupe_key TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at);
CREATE TABLE IF NOT EXISTS automation_runs (key TEXT PRIMARY KEY,created_at TEXT NOT NULL);
