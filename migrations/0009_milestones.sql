-- 社区里程碑表
CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_type TEXT NOT NULL CHECK(milestone_type IN ('users', 'posts', 'comments', 'checkin_streak')),
  threshold INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🎉',
  achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(milestone_type, threshold)
);

-- 里程碑记录表（每个里程碑只记录一次）
CREATE TABLE IF NOT EXISTS milestone_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id INTEGER NOT NULL,
  achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (milestone_id) REFERENCES milestones(id),
  UNIQUE(milestone_id)
);

-- 里程碑初始数据
INSERT OR IGNORE INTO milestones (milestone_type, threshold, title, description, icon) VALUES
-- 用户里程碑
('users', 5, '🎊 小圈子初成', '社区已有5位开发者！', '🎊'),
('users', 10, '🏠 十个伙伴', '10位开发者加入社区！', '🏠'),
('users', 25, '🌱 小型社区', '25位开发者共建社区！', '🌱'),
('users', 50, '🔥 活跃社区', '50位开发者！社区正在壮大！', '🔥'),
('users', 100, '💎 百人社区', '100位开发者！这是我们的家！', '💎'),
('users', 200, '🚀 快速发展', '200位开发者！增长势头强劲！', '🚀'),
('users', 500, '🏆 精英社区', '500位开发者！精英聚集地！', '🏆'),
('users', 1000, '👑 千人社区', '1000位开发者！里程碑达成！', '👑'),
-- 帖子里程碑
('posts', 5, '📝 第一批内容', '社区已发布5篇帖子！', '📝'),
('posts', 10, '📚 内容起步', '10篇优质内容！', '📚'),
('posts', 25, '✨ 内容丰富', '25篇帖子！内容越来越丰富！', '✨'),
('posts', 50, '🔥 热火朝天', '50篇帖子！讨论越来越热闘！', '🔥'),
('posts', 100, '📖 百帖殿堂', '100篇帖子！社区文化形成！', '📖'),
('posts', 200, '🌟 内容宝库', '200篇帖子！宝贵的内容积累！', '🌟'),
('posts', 500, '🏅 内容之城', '500篇帖子！巨型内容库！', '🏅'),
('posts', 1000, '🎖️ 千帖传奇', '1000篇帖子！传奇社区！', '🎖️'),
-- 评论里程碑
('comments', 10, '💬 开始互动', '社区已产生10条评论！', '💬'),
('comments', 50, '🗣️ 活跃讨论', '50条评论！讨论很活跃！', '🗣️'),
('comments', 100, '💡 思维碰撞', '100条评论！碰撞出火花！', '💡'),
('comments', 250, '🌈 精彩对话', '250条评论！对话越来越精彩！', '🌈'),
('comments', 500, '🎨 讨论的艺术', '500条评论！社区文化活跃！', '🎨'),
-- 连续签到里程碑
('checkin_streak', 3, '🔥 连续签到3天', '已连续签到3天！', '🔥'),
('checkin_streak', 7, '📅 连续签到一周', '连续签到7天！坚持真棒！', '📅'),
('checkin_streak', 30, '🏅 连续签到一月', '连续签到30天！太厉害了！', '🏅'),
('checkin_streak', 100, '👑 签到王者', '连续签到100天！无人能敌！', '👑');
