# 🐼 PandaHub 代码审查报告

> 审查日期：2026-04-14  
> 审查范围：全栈核心模块（index.js、auth、posts、admin、websocket、upload、messages）  
> 代码规模：30+ 路由文件，18 个数据库迁移，3 个定时服务

---

## 🔴 严重 Bug（需立即修复）

### Bug #1 — WebSocket 认证永远失败
**文件：** `server/websocket.js`  
**影响范围：** 整个实时通知体系  

**问题描述：**

登录时 JWT Token 签发的 payload：
```js
// routes/auth.js
jwt.sign({ id, username, role }, JWT_SECRET, ...)
//         ↑ claim 名是 "id"
```

WebSocket 连接认证时读取：
```js
// server/websocket.js
const decoded = jwt.verify(msg.token, JWT_SECRET);
userId = decoded.userId;   // ← "userId"，不存在！始终 undefined
```

**后果：**
- `clients.set(userId, ...)` 实际存的是 `undefined`
- `broadcastToUser(userId)` 永远找不到对应的 WS 客户端
- 所有实时通知（评论提醒、私信、@mention）全部失效
- 用户看到页面有通知数字但 WebSocket 层面推送不到

**修复方案：**
```js
// server/websocket.js 第 16 行
userId = decoded.id;   // ← 与签发时的 claim 名保持一致
```

---

### Bug #2 — 投票切换时影响力重复累积
**文件：** `routes/posts.js`（vote 逻辑）  
**影响范围：** 用户影响力排行榜，可被刷分  

**问题描述：**

```js
// routes/posts.js - 投票逻辑
if (existingVote.vote_type === vote_type) {
  // 取消投票 → 正确扣减影响力 ✓
  removeInfluence(post.user_id, 'post_like', 'post', req.params.id);
} else {
  // 切换投票类型（like → dislike）时：
  addInfluence(post.user_id, 'post_like', 'post', req.params.id);
  // ↑ 只加了新投票的影响，忘了扣除旧投票的影响！
}
```

**后果：**
- 用户从 dislike 改成 like：影响力 +3（正常）+3（未扣除 dislike 的 -3）
- 反复横跳：影响力持续膨胀，排行榜可被操控

**修复方案：**
```js
} else {
  // 先扣除旧投票的影响
  removeInfluence(post.user_id, existingVote.vote_type === 'like' ? 'post_like' : 'post_dislike', 'post', req.params.id);
  // 再加上新投票的影响
  addInfluence(post.user_id, vote_type === 'like' ? 'post_like' : 'post_dislike', 'post', req.params.id);
}
```

---

## 🟡 中等 Bug（逻辑错误或安全/体验问题）

### Bug #3 — 帖子被拒积分不退还
**文件：** `routes/admin.js` + `routes/posts.js`  
**影响范围：** 积分体系公平性  

**问题描述：**
- 用户发帖时立即扣积分（`routes/posts.js`：`points - cost`，状态 = `pending`）
- 管理员拒绝帖子时只更新状态，没有退款逻辑
- 用户损失 5 积分，帖子消失

**修复方案：** 在 `admin.js` 的审核拒绝逻辑中加入退款：
```js
db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(postCost, post.user_id);
```

---

### Bug #4 — 蜜罐返回成功响应，削弱检测效果
**文件：** `routes/auth.js`（register 路由）  
**影响范围：** 注册反爬虫机制  

**问题描述：**
```js
if (__hp) {
  return res.status(201).json({ pending: true, message: '注册成功，请验证邮箱...' });
  // ↑ 机器人收到 201，以为注册成功 → 学会了规避
}
```

**修复方案：** 返回与正常情况无区别的响应：
```js
if (__hp) {
  return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
}
```

---

### Bug #5 — 密码正则拒绝非 ASCII 字符
**文件：** `routes/auth.js`  
**影响范围：** 中文用户名用户无法注册  

**问题描述：**
```js
if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
  return res.status(400).json({ error: '密码必须包含大小写字母和数字' });
}
```

`[a-z]` 和 `[A-Z]` 只匹配英文字母。用户用中文输入法打密码时包含中文大写（如"熊大强 A2B3"），会被错误拒绝。

**修复方案：**
```js
// 改用 Unicode 属性匹配，或明确提示只用英文字母
if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{6,}$/.test(password)) {
  return res.status(400).json({ error: '密码必须包含大小写字母和数字，仅支持英文字母' });
}
```

---

## 🟢 低级 / 潜在问题

### Bug #6 — FTS 索引失败静默忽略
**文件：** `models/database.js`（`updatePostFTS`）  
**风险：** 全文搜索数据与实际数据逐渐不一致，用户搜索不到内容却不报错

---

### Bug #7 — 每日登录奖励存在并发竞态
**文件：** `routes/auth.js`（login 路由）  
**风险：** 同一用户多端同时登录，可能触发两次奖励写入（`UNIQUE` 约束会报错）

**修复方案：** 使用 SQLite 事务 + `INSERT OR IGNORE`：
```js
const result = db.prepare(
  'INSERT OR IGNORE INTO user_login_rewards (user_id, reward_date, points_earned) VALUES (?, ?, ?)'
).run(user.id, today, loginReward);
if (result.changes > 0) {
  db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(loginReward, user.id);
}
```

---

### Bug #8 — JWT_SECRET 默认临时密钥
**文件：** `middleware/auth.js`  
**风险：** 重启服务后 JWT_SECRET 变化，所有用户登录态立即失效

当前有 `console.warn` 提示，但生产环境应强制退出而非仅警告。

---

## 📊 问题汇总

| # | 严重度 | 文件 | 问题 | 状态 |
|---|--------|------|------|------|
| 1 | 🔴 | `server/websocket.js` | WS 认证 JWT claim 名不匹配，实时通知全失效 | 待修复 |
| 2 | 🔴 | `routes/posts.js` | 投票切换影响力重复累积，可刷分 | 待修复 |
| 3 | 🟡 | `routes/admin.js` | 帖子被拒积分不退还 | 待修复 |
| 4 | 🟡 | `routes/auth.js` | 蜜罐返回假成功，降低反爬效果 | 待修复 |
| 5 | 🟡 | `routes/auth.js` | 密码正则拒绝非 ASCII 字符 | 待修复 |
| 6 | 🟢 | `models/database.js` | FTS 失败静默忽略 | 低优先级 |
| 7 | 🟢 | `routes/auth.js` | 登录奖励并发竞态 | 低优先级 |
| 8 | 🟢 | `middleware/auth.js` | JWT_SECRET 临时密钥无强退出 | 低优先级 |

---

## 🛠 修复优先级建议

**立即修复：** Bug #1 + Bug #2（影响核心功能，且有安全风险）  
**本周修复：** Bug #3 ~ #5（影响用户体验和反爬效果）  
**后续优化：** Bug #6 ~ #8（低优先级，可排入迭代计划）
