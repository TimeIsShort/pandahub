-- User influence score system
ALTER TABLE users ADD COLUMN influence_score INTEGER DEFAULT 0;

-- Influence history log
CREATE TABLE IF NOT EXISTS influence_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  delta INTEGER NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
