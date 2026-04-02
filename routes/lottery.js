const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

// Get lottery status (cost, prizes, today's status)
router.get('/status', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
    const today = new Date().toISOString().split('T')[0];

    // Get today's lottery record
    const todayLottery = db.prepare(
      'SELECT * FROM lottery_records WHERE user_id = ? AND DATE(created_at) = ?'
    ).get(req.user.id, today);

    const prizes = db.prepare(
      'SELECT * FROM lottery_prizes WHERE active = 1 ORDER BY sort_order ASC'
    ).all();

    res.json({
      cost: 10, // 每次抽奖消耗10积分
      canPlay: !todayLottery,
      todayUsed: !!todayLottery,
      prizes: prizes,
      userPoints: user.points
    });
  } catch (err) {
    console.error('[Lottery]', err);
    res.status(500).json({ error: '获取抽奖状态失败' });
  }
});

// Play lottery
router.post('/play', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    const COST = 10;

    // Check if already played today
    const todayLottery = db.prepare(
      'SELECT * FROM lottery_records WHERE user_id = ? AND DATE(created_at) = ?'
    ).get(userId, today);

    if (todayLottery) {
      return res.status(400).json({ error: '今日抽奖次数已用完，明天再来！' });
    }

    // Check points
    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
    if (user.points < COST) {
      return res.status(403).json({ error: `积分不足，需要 ${COST} 积分，当前 ${user.points} 积分` });
    }

    // Get active prizes with weights
    const prizes = db.prepare(
      'SELECT * FROM lottery_prizes WHERE active = 1 ORDER BY sort_order ASC'
    ).all();

    if (prizes.length === 0) {
      return res.status(500).json({ error: '暂无可用奖品' });
    }

    // Weighted random selection
    const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
    let rand = Math.random() * totalWeight;
    let selectedPrize = null;

    for (const prize of prizes) {
      rand -= prize.weight;
      if (rand <= 0) {
        selectedPrize = prize;
        break;
      }
    }
    if (!selectedPrize) selectedPrize = prizes[prizes.length - 1];

    // Deduct points
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(COST, userId);

    // Record lottery
    const recordResult = db.prepare(
      'INSERT INTO lottery_records (user_id, prize_id, points_spent) VALUES (?, ?, ?)'
    ).run(userId, selectedPrize.id, COST);

    // Apply prize effect
    let prizeResult = null;
    if (selectedPrize.prize_type === 'points') {
      // Direct points prize
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(selectedPrize.prize_value, userId);
      prizeResult = { type: 'points', value: selectedPrize.prize_value, message: `恭喜获得 ${selectedPrize.prize_value} 积分！` };
    } else if (selectedPrize.prize_type === 'badge') {
      // Give badge
      const existing = db.prepare(
        'SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?'
      ).get(userId, selectedPrize.prize_value);
      if (!existing) {
        db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)')
          .run(userId, selectedPrize.prize_value);
      }
      const badge = db.prepare('SELECT * FROM badges WHERE id = ?').get(selectedPrize.prize_value);
      prizeResult = { type: 'badge', value: selectedPrize.prize_value, badge: badge, message: `恭喜获得徽章：${badge?.name || '神秘徽章'}！` };
    } else if (selectedPrize.prize_type === 'title') {
      // Set custom title
      db.prepare('UPDATE users SET custom_title = ? WHERE id = ?').run(selectedPrize.prize_value, userId);
      prizeResult = { type: 'title', value: selectedPrize.prize_value, message: `恭喜获得头衔：${selectedPrize.prize_value}！` };
    } else if (selectedPrize.prize_type === 'points_multiplier') {
      // Bonus multiplier on next sign-in
      prizeResult = { type: 'points_multiplier', value: selectedPrize.prize_value, message: `下次签到积分 x${selectedPrize.prize_value}！` };
    }

    const updatedUser = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);

    res.json({
      success: true,
      prize: selectedPrize,
      result: prizeResult,
      remainingPoints: updatedUser.points,
      recordId: recordResult.lastInsertRowid
    });
  } catch (err) {
    console.error('[Lottery play]', err);
    res.status(500).json({ error: '抽奖失败' });
  }
});

// ============ Admin Routes ============

// Get all prizes
router.get('/admin/prizes', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    const prizes = db.prepare(
      'SELECT * FROM lottery_prizes ORDER BY active DESC, sort_order ASC'
    ).all();
    res.json({ prizes });
  } catch (err) {
    res.status(500).json({ error: '获取奖品列表失败' });
  }
});

// Create prize
router.post('/admin/prizes', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const { name, description, icon, prize_type, prize_value, weight, stock, sort_order, active } = req.body;
    if (!name || !prize_type) {
      return res.status(400).json({ error: '奖品名称和类型不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO lottery_prizes (name, description, icon, prize_type, prize_value, weight, stock, sort_order, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, description || '', icon || '🎁',
      prize_type, prize_value || 0,
      parseInt(weight) || 1,
      stock !== undefined ? parseInt(stock) : null,
      parseInt(sort_order) || 0,
      active !== false ? 1 : 0
    );

    const prize = db.prepare('SELECT * FROM lottery_prizes WHERE id = ?').get(result.lastInsertRowid);
    res.json({ prize });
  } catch (err) {
    res.status(500).json({ error: '创建奖品失败' });
  }
});

// Update prize
router.put('/admin/prizes/:id', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const existing = db.prepare('SELECT * FROM lottery_prizes WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '奖品不存在' });
    }

    const { name, description, icon, prize_type, prize_value, weight, stock, sort_order, active } = req.body;

    db.prepare(`
      UPDATE lottery_prizes SET
        name = ?, description = ?, icon = ?, prize_type = ?, prize_value = ?,
        weight = ?, stock = ?, sort_order = ?, active = ?
      WHERE id = ?
    `).run(
      name ?? existing.name,
      description ?? existing.description,
      icon ?? existing.icon,
      prize_type ?? existing.prize_type,
      prize_value !== undefined ? prize_value : existing.prize_value,
      weight !== undefined ? parseInt(weight) : existing.weight,
      stock !== undefined ? (stock === null ? null : parseInt(stock)) : existing.stock,
      sort_order !== undefined ? parseInt(sort_order) : existing.sort_order,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      req.params.id
    );

    const prize = db.prepare('SELECT * FROM lottery_prizes WHERE id = ?').get(req.params.id);
    res.json({ prize });
  } catch (err) {
    res.status(500).json({ error: '更新奖品失败' });
  }
});

// Delete prize
router.delete('/admin/prizes/:id', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    db.prepare('DELETE FROM lottery_prizes WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除奖品失败' });
  }
});

module.exports = router;
