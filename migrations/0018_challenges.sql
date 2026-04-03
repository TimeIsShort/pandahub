-- Seasons
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  season_number INTEGER NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Challenge definitions
CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL,
  task_target INTEGER NOT NULL DEFAULT 1,
  reward_points INTEGER DEFAULT 0,
  icon TEXT DEFAULT '🎯',
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (season_id) REFERENCES seasons(id)
);

-- User challenge progress
CREATE TABLE IF NOT EXISTS user_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  challenge_id INTEGER NOT NULL,
  progress INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  completed_at DATETIME,
  UNIQUE(user_id, challenge_id),
  FOREIGN KEY (challenge_id) REFERENCES challenges(id)
);

-- Insert current season if not exists
INSERT OR IGNORE INTO seasons (id, name, season_number, start_date, end_date, status)
VALUES (1, '第一赛季 · 春日冲刺', 1, date('now'), date('now', '+7 days'), 'active');

-- Insert weekly challenges for season 1
INSERT OR IGNORE INTO challenges (id, season_id, title, description, task_type, task_target, reward_points, icon, sort_order) VALUES
(1, 1, '本周发帖', '本周发布至少3篇帖子', 'posts_count', 3, 30, '✍️', 1),
(2, 1, '活跃评论', '本周发表至少10条评论', 'comments_count', 10, 20, '💬', 2),
(3, 1, '每日签到', '本周完成7天签到', 'checkin_days', 7, 50, '🔥', 3),
(4, 1, '人气制造者', '本周送出30个赞', 'reactions_given', 30, 25, '👍', 4),
(5, 1, '影响力冲刺', '本周获得50点影响力', 'influence_gained', 50, 40, '⭐', 5);
