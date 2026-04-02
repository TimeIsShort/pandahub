-- User notification preferences
ALTER TABLE users ADD COLUMN notification_quiet_hours INTEGER DEFAULT 0; -- 0=off, 1=on
ALTER TABLE users ADD COLUMN notification_quiet_start TEXT DEFAULT '22:00'; -- HH:MM
ALTER TABLE users ADD COLUMN notification_quiet_end TEXT DEFAULT '08:00'; -- HH:MM
ALTER TABLE users ADD COLUMN notify_email INTEGER DEFAULT 1; -- email notifications on/off
ALTER TABLE users ADD COLUMN notify_push INTEGER DEFAULT 1; -- push notifications on/off
