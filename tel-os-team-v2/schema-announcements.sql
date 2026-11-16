/* In-app announcements. Publishing never queues email, chat or notifications. */
CREATE TABLE IF NOT EXISTS announcements (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 10000),
 audience TEXT NOT NULL CHECK(audience IN ('Company','Leadership','HR','Marketing','Finance','Strategy')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 expires_at TEXT,
 published_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1)
);
CREATE INDEX IF NOT EXISTS idx_announcements_visible ON announcements(status,audience,published_at);
CREATE TABLE IF NOT EXISTS announcement_dismissals (
 announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id),
 revision INTEGER NOT NULL CHECK(revision>=1),
 dismissed_at TEXT NOT NULL,
 PRIMARY KEY(announcement_id,user_id)
);
