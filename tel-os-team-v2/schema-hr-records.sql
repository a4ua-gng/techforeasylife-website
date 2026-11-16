/* Lead-reported meeting attendance. These are manual records, not call-provider telemetry. */
CREATE TABLE IF NOT EXISTS meeting_attendance (
 meeting_id TEXT NOT NULL REFERENCES meetings(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN ('present','absent','excused')),
 recorded_by TEXT NOT NULL REFERENCES users(id),
 recorded_at TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 PRIMARY KEY(meeting_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_user ON meeting_attendance(user_id,recorded_at);
CREATE TABLE IF NOT EXISTS meeting_attendance_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 meeting_id TEXT NOT NULL REFERENCES meetings(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 previous_status TEXT CHECK(previous_status IN ('present','absent','excused')),
 status TEXT NOT NULL CHECK(status IN ('present','absent','excused')),
 recorded_by TEXT NOT NULL REFERENCES users(id),
 recorded_at TEXT NOT NULL,
 revision INTEGER NOT NULL,
 UNIQUE(meeting_id,user_id,revision)
);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_history ON meeting_attendance_history(meeting_id,id);
CREATE TRIGGER IF NOT EXISTS meeting_attendance_history_insert AFTER INSERT ON meeting_attendance
BEGIN
 INSERT INTO meeting_attendance_history(meeting_id,user_id,previous_status,status,recorded_by,recorded_at,revision)
 VALUES(NEW.meeting_id,NEW.user_id,NULL,NEW.status,NEW.recorded_by,NEW.recorded_at,NEW.revision);
END;
CREATE TRIGGER IF NOT EXISTS meeting_attendance_history_update AFTER UPDATE ON meeting_attendance
WHEN OLD.status<>NEW.status
BEGIN
 INSERT INTO meeting_attendance_history(meeting_id,user_id,previous_status,status,recorded_by,recorded_at,revision)
 VALUES(NEW.meeting_id,NEW.user_id,OLD.status,NEW.status,NEW.recorded_by,NEW.recorded_at,NEW.revision);
END;
