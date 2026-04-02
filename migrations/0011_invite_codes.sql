-- 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  creator_id INTEGER NOT NULL,
  creator_username TEXT NOT NULL,
  uses_remaining INTEGER DEFAULT 1,
  uses_total INTEGER DEFAULT 1,
  reward_points INTEGER DEFAULT 10,
  claimed_by_id INTEGER,
  claimed_by_username TEXT,
  claimed_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- 邀请记录表
CREATE TABLE IF NOT EXISTS invite_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  inviter_id INTEGER NOT NULL,
  inviter_username TEXT NOT NULL,
  invitee_id INTEGER NOT NULL,
  invitee_username TEXT NOT NULL,
  inviter_reward INTEGER DEFAULT 10,
  invitee_reward INTEGER DEFAULT 20,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inviter_id) REFERENCES users(id),
  FOREIGN KEY (invitee_id) REFERENCES users(id)
);

-- 注册时填写的邀请码字段（通过users表已有字段实现，不新增列）
-- 在 auth.js register 时检查 invite_code 参数
