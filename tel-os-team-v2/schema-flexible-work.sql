/* Flexible attendance is the company default. Existing attendance and schedule rows remain intact. */
INSERT OR IGNORE INTO app_settings(key,value) VALUES('attendance_mode','flexible');
