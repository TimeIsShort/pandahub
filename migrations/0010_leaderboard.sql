-- 排行榜存储表
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_type TEXT NOT NULL CHECK(period_type IN ('weekly', 'monthly')),
  period_key TEXT NOT NULL,  -- e.g. '2026-W14', '2026-04'
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  nickname TEXT,
  avatar TEXT,
  points INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  likes_received INTEGER DEFAULT 0,
  total_score REAL DEFAULT 0,  -- 综合评分
  rank INTEGER DEFAULT 0,
  awarded_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(period_type, period_key, user_id)
);

-- 徽章定义：排行榜奖励（使用现有badges表结构）
INSERT OR IGNORE INTO badges (id, name, description, icon, condition_type, condition_value) VALUES
-- 周榜
('weekly_top1', '🏅 周榜冠军', '周末活跃榜第1名', '🏅', 'leaderboard_weekly', 1),
('weekly_top3', '🥈 周榜前三', '周末活跃榜前3名', '🥈', 'leaderboard_weekly', 3),
('weekly_top10', '📊 周榜前十', '周末活跃榜前10名', '📊', 'leaderboard_weekly', 10),
-- 月榜
('monthly_top1', '👑 月榜冠军', '月度活跃榜第1名', '👑', 'leaderboard_monthly', 1),
('monthly_top3', '🥈 月榜前三', '月度活跃榜前3名', '🥈', 'leaderboard_monthly', 3),
('monthly_top10', '📋 月榜前十', '月度活跃榜前10名', '📋', 'leaderboard_monthly', 10);
