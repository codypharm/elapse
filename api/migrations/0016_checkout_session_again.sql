-- FR-API-126: a follow-on session copies the ended one; the page preselects the last cap.
ALTER TABLE checkout_sessions ADD COLUMN last_max_duration_seconds integer;
ALTER TABLE checkout_sessions ADD COLUMN again_of text REFERENCES checkout_sessions(id);
