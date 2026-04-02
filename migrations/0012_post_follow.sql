-- 帖子关注表
CREATE TABLE IF NOT EXISTS post_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, post_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (post_id) REFERENCES posts(id)
);

-- 帖子通知表（区别于系统通知）
CREATE TABLE IF NOT EXISTS post_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  post_title TEXT,
  comment_id INTEGER,
  comment_preview TEXT,
  actor_id INTEGER,
  actor_username TEXT,
  type TEXT DEFAULT 'post_reply',
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (comment_id) REFERENCES comments(id),
  FOREIGN KEY (actor_id) REFERENCES users(id)
);
