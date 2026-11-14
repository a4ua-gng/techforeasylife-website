CREATE TABLE IF NOT EXISTS attendance_policy (
 id TEXT PRIMARY KEY, timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
 start_time TEXT NOT NULL DEFAULT '17:00', weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), effective_date TEXT NOT NULL,
 reminder_minutes INTEGER NOT NULL DEFAULT 15, grace_minutes INTEGER NOT NULL DEFAULT 10,
 escalation_minutes INTEGER NOT NULL DEFAULT 30, activated_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT REFERENCES users(id)
);
INSERT OR IGNORE INTO attendance_policy(id,effective_date,activated_at,updated_at) VALUES('company','2026-11-16',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS work_schedules (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),start_time TEXT NOT NULL,weekdays_json TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),effective_date TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',
 updated_by TEXT NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL,UNIQUE(user_id,effective_date)
);
CREATE TABLE IF NOT EXISTS work_holidays (
 id TEXT PRIMARY KEY,date TEXT NOT NULL UNIQUE,title TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_holidays_date ON work_holidays(date);
