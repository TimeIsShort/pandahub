-- Weekly featured posts
CREATE TABLE IF NOT EXISTS featured_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  period_type TEXT DEFAULT 'weekly',
  period_key TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  UNIQUE(post_id, period_type, period_key)
);
