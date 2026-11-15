CREATE TABLE IF NOT EXISTS channel_reads (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
 last_read_seq INTEGER NOT NULL DEFAULT 0,
 last_read_message_id TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,channel_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_reads_channel ON channel_reads(channel_id,user_id);
INSERT OR IGNORE INTO app_settings(key,value) VALUES('chat_unread_enabled_at',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
