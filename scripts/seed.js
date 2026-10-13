/**
* pandahub 示例数据
* 用法: node scripts/seed.js
*
* 支持 NODE_ENV=local（默认使用 /root/forum/data/community.db）
* 注意：会清空现有数据！
*
* 安全说明：
* - 仓库中不存放任何默认口令。种子用户的口令来自 SEED_DEMO_PASSWORD
* 环境变量；未设置时随机生成并在终端输出一次（请妥善保存，不要提交到仓库）。
* - 默认不创建管理员账号。需要管理员时，在执行种子前同时设置
* SEED_ADMIN_USERNAME 与 SEED_ADMIN_PASSWORD。
*/

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// DB 路径
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'forum.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ============== 辅助 ==============

function rnd(min, max) {
return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(n) {
const d = new Date();
d.setDate(d.getDate() - n);
return d.toISOString().replace('T', ' ').slice(0, 19);
}

function hoursAgo(n) {
const d = new Date();
d.setHours(d.getHours() - n);
return d.toISOString().replace('T', ' ').slice(0, 19);
}

function randomFrom(arr) {
return arr[Math.floor(Math.random() * arr.length)];
}

// ============== 清空现有数据（可选） ==============

const FORCE_CLEAN = process.argv.includes('--clean');

if (FORCE_CLEAN) {
console.log('🗑️ 清空现有数据...');
const tables = [
'post_reactions','comment_reactions','favorites','follows',
'comments','posts','users',
'checkins','user_login_rewards','point_transfers','influence_history',
'user_badges','post_views','notifications',
'user_actions_log','moderation_log',
];
tables.forEach(t => {
try { db.exec(`DELETE FROM ${t}`);} catch(e) {}
});
console.log('✅ 清空完成');
}

// ============== 创建用户 ==============

console.log('👤 创建示例用户...');

// 种子用户口令：来自环境变量，未设置时随机生成（仅在终端输出一次）
const seedPassword = process.env.SEED_DEMO_PASSWORD || crypto.randomBytes(16).toString('hex');
const passwordHash = bcrypt.hashSync(seedPassword, 10);

const users = [
{ username: 'demo', nickname: '演示用户', role: 'member', points: 520, bio: '我是演示用户 🐼', checkin_streak: 7},
{ username: 'alice', nickname: '爱丽丝', role: 'member', points: 280, bio: 'AI爱好者，喜欢折腾新工具', checkin_streak: 3},
{ username: 'bob', nickname: 'Bob', role: 'member', points: 150, bio: '全栈开发，关注前端技术', checkin_streak: 0},
{ username: 'charlie',nickname: '查理', role: 'member', points: 88, bio: '编程新手，求带', checkin_streak: 1},
{ username: 'diana', nickname: 'Diana', role: 'member', points: 320, bio: '后端开发，Node.js 熟练工', checkin_streak: 5},
{ username: 'mod', nickname: '版主小喵', role: 'moderator', points: 200, bio: '负责日常维护 🐱', checkin_streak: 12},
];

const userIds = {};
const insertUser = db.prepare(`
INSERT OR IGNORE INTO users (username, password, nickname, role, points, bio,
checkin_streak, created_at, approved, is_banned)
VALUES (?,?,?,?,?,?,?,?, 1, 0)
`);

users.forEach(u => {
const now = daysAgo(rnd(1, 60));
const r = insertUser.run(u.username, passwordHash, u.nickname, u.role,
u.points, u.bio, u.checkin_streak, now);
if (r.changes) {
userIds[u.username] = db.prepare('SELECT id FROM users WHERE username=?').get(u.username).id;
console.log(` ✅ 创建用户: ${u.nickname} (${u.role})`);
} else {
userIds[u.username] = db.prepare('SELECT id FROM users WHERE username=?').get(u.username).id;
console.log(` ⚠️ 用户已存在: ${u.nickname}`);
}
});

// ============== 管理员账号（仅当显式提供环境变量时创建） ==============

const adminUsername = process.env.SEED_ADMIN_USERNAME;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (adminUsername && adminPassword) {
const adminHash = bcrypt.hashSync(adminPassword, 10);
const r = insertUser.run(adminUsername, adminHash, '管理员', 'admin', 0, '站点管理员', 0, daysAgo(1));
if (r.changes) {
console.log(` ✅ 创建管理员: ${adminUsername}`);
} else {
console.log(` ⚠️ 管理员已存在: ${adminUsername}`);
}
} else {
console.log(' ⏭️ 未设置 SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD，跳过管理员创建');
}

// ============== 创建帖子 ==============

console.log('\n📝 创建示例帖子...');

const posts = [
{
title: 'pandahub 使用指南',
content: `# 欢迎来到熊猫社区！\n\n这是一个 **AI 驱动** 的技术交流社区，以下是你需要知道的几件事：\n\n## 基本操作\n- 发帖、评论、点赞\n- 每日签到领积分\n- 完成任务获取更多积分\n- 积分可以在商城兑换礼品\n\n## AI 助手\n发布帖子时，系统会自动生成 AI 摘要。\n\n## 社区规则\n-友善交流，尊重他人\n- 技术为主，拒绝水帖\n- 发现 bug 记得反馈 🐼`,
section_id: 1, tags: ['日常闲聊', '使用技巧'], username: 'demo',
likes: 42, views: 520,
},
{
title: 'Claude 4 vs GPT-5 vs Gemini 2.0：谁是代码之王？',
content: `最近三个主流大模型都更新了，这波正面交锋谁能胜出？\n\n## 测试题目\n用 Each 模型实现一个 **React hooks 状态管理库**，限时 30 分钟。\n\n## 测试结果\n| 模型 | 代码质量 | 注释完整性 | 运行通过率 |\n|------|---------|-----------|-----------|\n| Claude 4 | ⭐⭐⭐⭐⭐ | 详细 | 98% |\n| GPT-5 | ⭐⭐⭐⭐ | 简洁 | 95% |\n| Gemini 2.0 | ⭐⭐⭐ | 一般 | 88% |\n\n**结论：Claude 4 在代码完整性上依然领先**，但 GPT-5 的性价比更高。`,
section_id: 2, tags: ['AI工具', '日常闲聊'], username: 'alice',
likes: 28, views: 312,
},
{
title: '分享：我在深圳找到了一家神仙 IT 公司',
content: `背景：3年经验，后端开发，base 深圳\n\n这家公司的特点：\n- 🎯 不打卡，弹性工作\n- 🍜 免费三餐+下午茶\n- 💰 薪资对标一线大厂\n- 🏠 租房补贴 2k/月\n- 📈 半年一次调薪机会\n\n面试难度中等，更看重实际项目经验。有兴趣的同学可以私信我内推～`,
section_id: 3, tags: ['资源分享'], username: 'diana',
likes: 156, views: 2340,
},
{
title: '求助：React 18 useEffect 无限循环怎么破？',
content: `代码如下：\n\n\`\`\`javascript\nuseEffect(() => {\n setData(data.map(...));\n // 这里触发 re-render 导致无限循环\n}, [data]);\n\`\`\`\n\n试过加判断条件，但还是有问题。有遇到过的同学吗？`,
section_id: 4, tags: ['问题求助'], username: 'charlie',
likes: 5, views: 89,
},
{
title: '2026-04-03',
content: '📋 每日来这里签到，连续签到有额外积分奖励！\n\n今天是 4 月 3 日，社区已经运行一段时间啦，大家有什么建议都可以留言～',
section_id: 1, tags: ['日常闲聊'], username: 'mod',
likes: 12, views: 178,
},
{
title: '用 Cloudflare Workers 搭建免费 AI API 代理',
content: `不想付钱买 API？Cloudflare Workers 每天有 10 万次免费请求，配合开源模型也能玩得转。\n\n## 架构\n\`\`\`\n用户 → CF Worker → 第三方 AI API（付费）\n\`\`\`\n\n## 核心代码（Worker）\n\`\`\`javascript\nexport default {\n async fetch(request) {\n const body = await request.json();\n const resp = await fetch('https://api.openai.com/v1/chat/completions', {\n method: 'POST',\n headers: { 'Authorization': \`Bearer \${AI_KEY}\`},\n body: JSON.stringify(body),\n});\n return resp;\n}\n};\n\`\`\`\n\n实测延迟比直连稍高，但免费额度完全够个人使用。`,
section_id: 2, tags: ['AI工具', '资源分享'], username: 'bob',
likes: 67, views: 890,
},
];

const insertPost = db.prepare(`
INSERT OR IGNORE INTO posts (title, content, user_id, section_id, created_at, updated_at, views, status)
VALUES (?,?,?,?,?,?,?, 'published')
`);

const postIds = [];
posts.forEach((p, i) => {
const userId = userIds[p.username];
const createdAt = hoursAgo(rnd(1, 72));
const r = insertPost.run(p.title, p.content, userId, p.section_id, createdAt, createdAt, p.views);
const pid = r.changes? db.prepare('SELECT id FROM posts WHERE title=? ORDER BY id DESC').get(p.title).id: null;
if (pid) {
postIds.push({ id: pid,...p});
console.log(` ✅ 帖子: ${p.title.slice(0, 30)}...`);
}
});

// ============== 创建评论 ==============

console.log('\n💬 创建示例评论...');

const comments = [
{ post_idx: 0, content: '这个指南太有用了！👍 签到积分怎么算的？', username: 'alice', reply_to: null},
{ post_idx: 0, content: '每天签到 5 积分，连续 7 天额外奖励 20 积分', username: 'mod', reply_to: 'alice'},
{ post_idx: 1, content: 'Claude 4 确实强，但中文代码注释还是 GPT 更自然', username: 'bob', reply_to: null},
{ post_idx: 1, content: 'Gemini 的多模态能力是加分项，代码只是其中之一', username: 'diana', reply_to: null},
{ post_idx: 2, content: '请问内推需要准备哪些材料？', username: 'charlie', reply_to: null},
{ post_idx: 2, content: '简历 + 项目作品集即可，我帮你递', username: 'diana', reply_to: 'charlie'},
{ post_idx: 3, content: '试试 useCallback 包裹，或者把依赖拆开', username: 'bob', reply_to: null},
{ post_idx: 4, content: '🐼 连续签到第 12 天！', username: 'alice', reply_to: null},
{ post_idx: 5, content: '这个思路太妙了，配合 CF 的边缘节点延迟很低', username: 'alice', reply_to: null},
];

const insertComment = db.prepare(`
INSERT INTO comments (post_id, user_id, content, created_at, reply_to_user_id)
VALUES (?,?,?,?,?)
`);

const commentMap = {};
comments.forEach((c, i) => {
const post = postIds[c.post_idx];
if (!post) return;
const userId = userIds[c.username];
const replyToUserId = c.reply_to? commentMap[`${c.post_idx}_${c.reply_to}`]: null;
const createdAt = hoursAgo(rnd(1, 48));
const r = insertComment.run(post.id, userId, c.content, createdAt, replyToUserId);
const cid = r.changes? db.prepare('SELECT id FROM comments WHERE post_id=? AND user_id=? ORDER BY id DESC').get(post.id, userId).id: null;
if (cid) {
commentMap[`${c.post_idx}_${c.username}`] = cid;
console.log(` 💬 ${c.username}: ${c.content.slice(0, 25)}...`);
}
});

// ============== 点赞、收藏、关注 ==============

console.log('\n❤️ 创建互动记录...');

const insertVote = db.prepare('INSERT OR IGNORE INTO post_votes (user_id, post_id, vote_type, created_at) VALUES (?,?,?,?)');
const insertFav = db.prepare('INSERT OR IGNORE INTO favorites (user_id, post_id, created_at) VALUES (?,?,?)');
const insertFollow = db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?,?,?)');
const insertCheckin = db.prepare('INSERT OR IGNORE INTO checkins (user_id, checkin_date, points_earned) VALUES (?,?,?)');

// 随机给帖子点赞
const usernames = Object.keys(userIds);
postIds.forEach(p => {
usernames.forEach(uname => {
if (Math.random() > 0.5) {
try { insertVote.run(userIds[uname], p.id, 'like', hoursAgo(rnd(1, 72)));} catch(e) {}
}
if (Math.random() > 0.6) {
try { insertFav.run(userIds[uname], p.id, hoursAgo(rnd(1, 72)));} catch(e) {}
}
});
});

// 关注关系
const followPairs = [['alice','bob'],['alice','diana'],['charlie','alice'],['charlie','diana'],['bob','alice'],['mod','demo'],['demo','mod']];
followPairs.forEach(([a, b]) => {
try { insertFollow.run(userIds[a], userIds[b], daysAgo(rnd(1, 30)));} catch(e) {}
});

// 签到记录（连续签到）
usernames.forEach(uname => {
const u = users.find(x => x.username === uname);
if (!u || u.checkin_streak === 0) return;
for (let d = u.checkin_streak; d >= 0; d--) {
try { insertCheckin.run(userIds[uname], daysAgo(d).slice(0, 10), 5);} catch(e) {}
}
});

console.log(' ✅ 互动数据创建完成');

// ============== 汇总 ==============

const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
const postCount = db.prepare('SELECT COUNT(*) as c FROM posts').get().c;
const commentCount = db.prepare('SELECT COUNT(*) as c FROM comments').get().c;

console.log('\n✅ 示例数据创建完成！');
console.log(` 👥 用户: ${userCount}`);
console.log(` 📝 帖子: ${postCount}`);
console.log(` 💬 评论: ${commentCount}`);
if (process.env.SEED_DEMO_PASSWORD) {
console.log('\n🔑 演示用户口令来自 SEED_DEMO_PASSWORD 环境变量，未在终端输出。');
} else {
console.log('\n🔑 本次种子生成的演示口令（仅显示一次，请妥善保存，不要提交到仓库）：');
console.log(` ${seedPassword}`);
}

db.close();
