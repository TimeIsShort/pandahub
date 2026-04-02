const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, '../data/forum.db'));

// Performance & concurrency optimizations
db.pragma('journal_mode = WAL');       // Write-Ahead Logging for concurrent reads during writes
db.pragma('busy_timeout = 5000');      // Wait up to 5s when database is locked before failing
db.pragma('synchronous = NORMAL');      // Safer than FULL, faster than OFF
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nickname TEXT,
    avatar TEXT,
    bio TEXT,
    role TEXT DEFAULT 'member',
    approved INTEGER DEFAULT 0,
    ai_quota INTEGER DEFAULT 100,
    ai_reset_date DATE,
    is_banned INTEGER DEFAULT 0,
    banned_reason TEXT,
    banned_at DATETIME,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    points INTEGER DEFAULT 0,
    checkin_streak INTEGER DEFAULT 0,
    email TEXT UNIQUE,
    email_verified INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ai_chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id TEXT,
    role TEXT DEFAULT 'user',
    content TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    post_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    nickname TEXT,
    email TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    processed_by INTEGER
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#666',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tag_id INTEGER,
    views INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    parent_id INTEGER,
    reply_to_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES comments(id),
    FOREIGN KEY (reply_to_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS post_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    vote_type TEXT NOT NULL CHECK(vote_type IN ('like', 'dislike')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(post_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS hobbies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT '🏷️',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_hobbies (
    user_id INTEGER NOT NULL,
    hobby_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, hobby_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (hobby_id) REFERENCES hobbies(id)
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    checkin_date DATE NOT NULL,
    points_earned INTEGER NOT NULL,
    streak_before INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, checkin_date)
  );

  CREATE TABLE IF NOT EXISTS email_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    user_id INTEGER,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'bind',
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Lightweight schema migration for legacy databases
function ensureColumn(tableName, columnName, definitionSql) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some(col => col.name === columnName);
  if (!exists) {
    try {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
    } catch (err) {
      // SQLite may reject CURRENT_TIMESTAMP defaults in legacy ALTER scenarios
      if (/CURRENT_TIMESTAMP/i.test(definitionSql)) {
        const fallbackDefinition = definitionSql.replace(/\s+DEFAULT\s+CURRENT_TIMESTAMP/i, '');
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${fallbackDefinition}`);
      } else {
        throw err;
      }
    }
  }
}

ensureColumn('users', 'nickname', 'TEXT');
ensureColumn('users', 'avatar', 'TEXT');
ensureColumn('users', 'bio', 'TEXT');
ensureColumn('users', 'role', "TEXT DEFAULT 'member'");
ensureColumn('users', 'approved', 'INTEGER DEFAULT 0');
ensureColumn('users', 'ai_quota', 'INTEGER DEFAULT 100');
ensureColumn('users', 'ai_reset_date', 'DATE');
ensureColumn('users', 'is_banned', 'INTEGER DEFAULT 0');
ensureColumn('users', 'banned_reason', 'TEXT');
ensureColumn('users', 'banned_at', 'DATETIME');
ensureColumn('users', 'applied_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
ensureColumn('users', 'last_login', 'DATETIME');
ensureColumn('ai_chats', 'session_id', 'TEXT');
ensureColumn('ai_chats', 'provider', 'TEXT');
ensureColumn('ai_chats', 'model', 'TEXT');
ensureColumn('posts', 'tag_id', 'INTEGER');
ensureColumn('tags', 'icon', "TEXT DEFAULT '🏷️'");
ensureColumn('posts', 'views', 'INTEGER DEFAULT 0');
ensureColumn('posts', 'status', "TEXT DEFAULT 'pending'");
ensureColumn('posts', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
ensureColumn('posts', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
ensureColumn('posts', 'like_count', 'INTEGER DEFAULT 0');
ensureColumn('posts', 'dislike_count', 'INTEGER DEFAULT 0');
ensureColumn('comments', 'parent_id', 'INTEGER');
ensureColumn('comments', 'reply_to_user_id', 'INTEGER');
ensureColumn('users', 'points', 'INTEGER DEFAULT 0');
ensureColumn('users', 'checkin_streak', 'INTEGER DEFAULT 0');
ensureColumn('users', 'email', 'TEXT');
ensureColumn('users', 'email_verified', 'INTEGER DEFAULT 0');

// Seed default tags
const defaultTags = [
  { name: 'AI工具', color: '#10b981' },
  { name: '使用技巧', color: '#6366f1' },
  { name: '问题求助', color: '#f59e0b' },
  { name: '资源分享', color: '#ec4899' },
  { name: '日常闲聊', color: '#8b5cf6' }
];

const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)');
for (const tag of defaultTags) {
  insertTag.run(tag.name, tag.color);
}

const defaultHobbies = [
  { name: 'AI人工智能', icon: '🤖' },
  { name: '编程开发', icon: '💻' },
  { name: '数据分析', icon: '📊' },
  { name: '产品设计', icon: '🎨' },
  { name: '摄影摄像', icon: '📷' },
  { name: '阅读写作', icon: '📚' },
  { name: '音乐娱乐', icon: '🎵' },
  { name: '游戏电竞', icon: '🎮' },
  { name: '旅行探索', icon: '✈️' },
  { name: '健身运动', icon: '🏃' },
  { name: '美食烹饪', icon: '🍳' },
  { name: '影视综艺', icon: '🎬' },
  { name: '科技数码', icon: '📱' },
  { name: '商业创业', icon: '🚀' },
  { name: '学术研究', icon: '🔬' }
];

const insertHobby = db.prepare('INSERT OR IGNORE INTO hobbies (name, icon) VALUES (?, ?)');
for (const hobby of defaultHobbies) {
  insertHobby.run(hobby.name, hobby.icon);
}

// Ensure default admin account exists and is usable.
// This keeps README default credentials consistent in fresh or legacy databases.
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const defaultAdminHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);

const existingAdmin = db.prepare(`
  SELECT id, password, role, approved, is_banned
  FROM users
  WHERE username = ?
`).get(DEFAULT_ADMIN_USERNAME);

if (!existingAdmin) {
  db.prepare(`
    INSERT INTO users (username, password, nickname, role, approved, is_banned)
    VALUES (?, ?, ?, 'admin', 1, 0)
  `).run(DEFAULT_ADMIN_USERNAME, defaultAdminHash, '管理员');
} else {
  const updates = [];
  const params = [];

  if (existingAdmin.role !== 'admin') {
    updates.push('role = ?');
    params.push('admin');
  }

  if (Number(existingAdmin.approved) !== 1) {
    updates.push('approved = ?');
    params.push(1);
  }

  if (Number(existingAdmin.is_banned) === 1) {
    updates.push('is_banned = ?');
    params.push(0);
  }

  const pwd = String(existingAdmin.password || '');
  const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(pwd);
  if (!isBcryptHash) {
    updates.push('password = ?');
    params.push(defaultAdminHash);
  }

  if (updates.length > 0) {
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params, existingAdmin.id);
  }
}

// Moderation log table
db.exec(`
  CREATE TABLE IF NOT EXISTS moderation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER,
    reason TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id)
  )
`);

// Add moderation_result column to posts if not exists
try {
  db.prepare("ALTER TABLE posts ADD COLUMN moderation_result TEXT").run();
} catch (e) {
  // column may already exist, ignore
}

// ============ Full-Text Search (FTS5) ============

// Create FTS5 virtual table for posts full-text search
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
    post_id UNINDEXED,
    title,
    content,
    username,
    tag_name,
    content_rowid=post_id,
    tokenize='unicode61 remove_diacritics 1'
  )
`);

// Rebuild FTS index from existing posts (idempotent)
function rebuildPostsFTS() {
  const posts = db.prepare(`
    SELECT p.id, p.title, p.content, u.username, t.name as tag_name
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN tags t ON p.tag_id = t.id
  `).all();

  db.exec("DELETE FROM posts_fts");
  const insert = db.prepare("INSERT INTO posts_fts (post_id, title, content, username, tag_name) VALUES (?, ?, ?, ?, ?)");
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row.id, row.title || '', row.content || '', row.username || '', row.tag_name || '');
    }
  });
  insertMany(posts);
  console.log(`[FTS] 索引重建完成，共 ${posts.length} 篇帖子`);
}

// Auto-rebuild on startup if FTS is empty
try {
  const count = db.prepare("SELECT COUNT(*) as c FROM posts_fts").get();
  if (count.c === 0) {
    rebuildPostsFTS();
  }
} catch (e) {
  // table might not exist yet on first run
}

// ============ FTS5 Triggers (keep index in sync) ============
db.exec(`
  CREATE TRIGGER IF NOT EXISTS posts_fts_insert AFTER INSERT ON posts BEGIN
    INSERT INTO posts_fts(post_id, title, content, username, tag_name)
    SELECT NEW.id, NEW.title, NEW.content, u.username, t.name
    FROM posts NEW
    LEFT JOIN users u ON NEW.user_id = u.id
    LEFT JOIN tags t ON NEW.tag_id = t.id;
  END
`);

db.exec(`
  CREATE TRIGGER IF NOT EXISTS posts_fts_update AFTER UPDATE ON posts BEGIN
    DELETE FROM posts_fts WHERE post_id = OLD.id;
    INSERT INTO posts_fts(post_id, title, content, username, tag_name)
    SELECT NEW.id, NEW.title, NEW.content, u.username, t.name
    FROM posts NEW
    LEFT JOIN users u ON NEW.user_id = u.id
    LEFT JOIN tags t ON NEW.tag_id = t.id;
  END
`);

db.exec(`
  CREATE TRIGGER IF NOT EXISTS posts_fts_delete AFTER DELETE ON posts BEGIN
    DELETE FROM posts_fts WHERE post_id = OLD.id;
  END
`);

// Search posts via FTS5
function searchPostsFTS(query, options = {}) {
  const { tag_id, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  if (!query || query.trim().length === 0) {
    return { posts: [], total: 0, page, limit, pages: 0 };
  }

  // Sanitize FTS query - escape special chars and add wildcard
  const ftsQuery = query.trim().replace(/['"*]/g, ' ') + '*';

  let sql = `
    SELECT p.*, u.username, u.nickname, u.avatar, t.name as tag_name, t.color as tag_color,
           bm25(posts_fts) as rank,
           (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
           COALESCE(p.like_count, 0) as like_count, COALESCE(p.dislike_count, 0) as dislike_count
    FROM posts_fts
    JOIN posts p ON posts_fts.post_id = p.id
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN tags t ON p.tag_id = t.id
    WHERE posts_fts MATCH ? AND p.status = 'approved'
  `;

  const params = [ftsQuery];

  if (tag_id) {
    sql += ' AND p.tag_id = ?';
    params.push(tag_id);
  }

  sql += ' ORDER BY rank LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const countSql = `
    SELECT COUNT(*) as total FROM posts_fts
    JOIN posts p ON posts_fts.post_id = p.id
    WHERE posts_fts MATCH ? AND p.status = 'approved' ${tag_id ? ' AND p.tag_id = ?' : ''}
  `;
  const countParams = tag_id ? [ftsQuery, tag_id] : [ftsQuery];
  const total = db.prepare(countSql).get(...countParams).total;

  const posts = db.prepare(sql).all(...params);

  return {
    posts,
    total,
    page: Number(page),
    limit: Number(limit),
    pages: Math.ceil(total / limit)
  };
}

// Update FTS index for a single post (call after insert/update/delete)
function updatePostFTS(postId, action = 'upsert') {
  try {
    if (action === 'delete') {
      db.prepare("DELETE FROM posts_fts WHERE post_id = ?").run(postId);
      return;
    }
    const row = db.prepare(`
      SELECT p.id, p.title, p.content, u.username, t.name as tag_name
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE p.id = ?
    `).get(postId);
    if (row) {
      db.prepare("DELETE FROM posts_fts WHERE post_id = ?").run(postId);
      db.prepare("INSERT INTO posts_fts (post_id, title, content, username, tag_name) VALUES (?, ?, ?, ?, ?)")
        .run(row.id, row.title || '', row.content || '', row.username || '', row.tag_name || '');
    }
  } catch (err) {
    console.error('[FTS] 更新索引失败:', err.message);
  }
}

function rebuildPostsFTS() {
  const posts = db.prepare(`
    SELECT p.id, p.title, p.content, u.username, t.name as tag_name
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN tags t ON p.tag_id = t.id
  `).all();
  db.exec("DELETE FROM posts_fts");
  const insert = db.prepare("INSERT INTO posts_fts (post_id, title, content, username, tag_name) VALUES (?, ?, ?, ?, ?)");
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row.id, row.title || '', row.content || '', row.username || '', row.tag_name || '');
    }
  });
  insertMany(posts);
  console.log(`[FTS] 索引重建完成，共 ${posts.length} 篇帖子`);
}

module.exports = db;
module.exports.updatePostFTS = updatePostFTS;
module.exports.rebuildPostsFTS = rebuildPostsFTS;

// ============ Points & Level System ============

const LEVELS = [
  { min: 0,    max: 100,   name: '萌新',   icon: '🌱', color: '#86efac' },
  { min: 101,  max: 500,   name: '入门',   icon: '🌿', color: '#86efac' },
  { min: 501,  max: 1000,  name: '进阶',   icon: '🌳', color: '#fde047' },
  { min: 1001, max: 3000,  name: '老鸟',   icon: '🔥', color: '#fb923c' },
  { min: 3001, max: Infinity, name: '大佬', icon: '⭐', color: '#f472b6' },
];

function getUserLevel(points) {
  const p = Number(points) || 0;
  for (const lv of LEVELS) {
    if (p >= lv.min && p <= lv.max) return lv;
  }
  return LEVELS[0];
}

// Point costs for actions
const POINT_COST = {
  create_post: 5,
  create_comment: 2,
};

const DAILY_TASKS = [
  { id: 'post',    name: '发布帖子',   desc: '今日发布1篇帖子',   target: 1, reward: 5,  icon: '📝' },
  { id: 'comment', name: '发表评论',   desc: '今日评论3次',       target: 3, reward: 3,  icon: '💬' },
  { id: 'checkin', name: '每日签到',  desc: '今日完成签到',      target: 1, reward: 2,  icon: '✅' },
];

ensureColumn('posts', 'is_pinned', 'INTEGER DEFAULT 0');
ensureColumn('posts', 'is_featured', 'INTEGER DEFAULT 0');
ensureColumn('posts', 'rejected_reason', 'TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS comment_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    vote_type TEXT NOT NULL DEFAULT 'like',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (comment_id) REFERENCES comments(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(comment_id, user_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('post', 'comment')),
    target_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'resolved', 'dismissed')),
    admin_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS point_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0),
    status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'pending', 'rejected')),
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
  )
`);


// ============ Favorites ============
db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE(user_id, post_id)
  )
`);

// ============ Reminder Settings ============
db.exec(`
  CREATE TABLE IF NOT EXISTS reminder_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    reminder_enabled INTEGER DEFAULT 1,
    reminder_time TEXT DEFAULT '09:00',
    reminder_days TEXT DEFAULT '1,2,3,4,5,6,0',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

module.exports.getUserLevel = getUserLevel;
module.exports.LEVELS = LEVELS;
module.exports.POINT_COST = POINT_COST;
module.exports.DAILY_TASKS = DAILY_TASKS;

// ============ Post Views Log ============
db.exec(`
  CREATE TABLE IF NOT EXISTS post_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER,
    ip_address TEXT,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// ============ Login Attempts Tracking ============
db.exec(`
  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT,
    user_id INTEGER,
    username TEXT,
    success INTEGER DEFAULT 0,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// ============ User Actions Log ============
db.exec(`
  CREATE TABLE IF NOT EXISTS user_actions_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// ============ Daily Task System ============
ensureColumn('users', 'daily_posts_date', 'TEXT');
ensureColumn('users', 'daily_posts_count', 'INTEGER DEFAULT 0');
ensureColumn('users', 'daily_comments_date', 'TEXT');
ensureColumn('users', 'daily_comments_count', 'INTEGER DEFAULT 0');

ensureColumn('users', 'reward_claimed_date', 'TEXT');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_task_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      claim_date TEXT NOT NULL,
      reward_points INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, claim_date)
    )
  `);
} catch(e) { /* table may already exist */ }

// ============ Comment Reactions ============
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(comment_id, user_id)
    )
  `);
} catch(e) { /* table may already exist */ }

// ============ Post Reactions (replaces old like/dislike) ============
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id)
    )
  `);
} catch(e) { /* table may already exist */ }

// ============ User Badges System ============
ensureColumn('users', 'checkin_streak', 'INTEGER DEFAULT 0');
ensureColumn('users', 'last_checkin_date', 'TEXT');

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      condition_type TEXT,
      condition_value INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch(e) {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      badge_id TEXT NOT NULL,
      earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, badge_id)
    )
  `);
} catch(e) {}

// Seed default badges
const DEFAULT_BADGES = [
  { id: 'first_post',     name: '🌱 初来乍到',    description: '发布第一篇帖子',          icon: '🌱', condition_type: 'posts_count',    condition_value: 1 },
  { id: 'posts_10',       name: '✍️ 笔耕不辍',    description: '累计发布10篇帖子',        icon: '✍️', condition_type: 'posts_count',    condition_value: 10 },
  { id: 'posts_50',      name: '📝 文章等身',    description: '累计发布50篇帖子',         icon: '📝', condition_type: 'posts_count',    condition_value: 50 },
  { id: 'checkin_3',     name: '🔥 三天打鱼',    description: '连续签到3天',             icon: '🔥', condition_type: 'checkin_streak', condition_value: 3 },
  { id: 'checkin_7',     name: '🏆 周冠军',       description: '连续签到7天',             icon: '🏆', condition_type: 'checkin_streak', condition_value: 7 },
  { id: 'checkin_30',    name: '👑 月冠',        description: '连续签到30天',            icon: '👑', condition_type: 'checkin_streak', condition_value: 30 },
  { id: 'comments_10',   name: '💬 评论达人',     description: '累计发布10条评论',          icon: '💬', condition_type: 'comments_count',  condition_value: 10 },
  { id: 'comments_50',  name: '🗣️ 评论大师',    description: '累计发布50条评论',          icon: '🗣️', condition_type: 'comments_count',  condition_value: 50 },
  { id: 'level_1000',   name: '⭐ 四级大佬',    description: '积分达到1000',            icon: '⭐', condition_type: 'points',          condition_value: 1000 },
  { id: 'level_3000',   name: '🌟 五级宗师',    description: '积分达到3000',            icon: '🌟', condition_type: 'points',          condition_value: 3000 },
  { id: 'level_5000',   name: '💎 至尊王者',    description: '积分达到5000',            icon: '💎', condition_type: 'points',          condition_value: 5000 },
  { id: 'reactions_10',  name: '👍 人气博主',    description: '帖子累计获得10个赞',        icon: '👍', condition_type: 'reactions_count', condition_value: 10 },
];
DEFAULT_BADGES.forEach(b => {
  try {
    db.prepare('INSERT OR IGNORE INTO badges (id, name, description, icon, condition_type, condition_value) VALUES (?, ?, ?, ?, ?, ?)').run(b.id, b.name, b.description, b.icon, b.condition_type, b.condition_value);
  } catch(e) {}
});

// ============ AI Chat History ============
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      tokens_used INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_ai_chat_user ON ai_chat_history(user_id, created_at DESC)');
} catch(e) {}
