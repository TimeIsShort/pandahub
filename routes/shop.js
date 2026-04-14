const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

// Get all shop items
router.get('/items', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT si.*, u.username as creator_name
      FROM shop_items si
      LEFT JOIN users u ON si.created_by = u.id
      WHERE si.active = 1
      ORDER BY si.sort_order ASC, si.id ASC
    `).all();

    res.json({ items });
  } catch (err) {
    console.error('[Shop]', err);
    res.status(500).json({ error: '获取商品列表失败' });
  }
});

// Get single item
router.get('/items/:id', (req, res) => {
  try {
    const item = db.prepare(`
      SELECT si.*, u.username as creator_name
      FROM shop_items si
      LEFT JOIN users u ON si.created_by = u.id
      WHERE si.id = ?
    `).get(req.params.id);

    if (!item) {
      return res.status(404).json({ error: '商品不存在' });
    }

    res.json({ item });
  } catch (err) {
    console.error('[Shop]', err);
    res.status(500).json({ error: '获取商品详情失败' });
  }
});

// Redeem an item
router.post('/redeem', authMiddleware, (req, res) => {
  try {
    const { item_id } = req.body;
    const userId = req.user.id;

    if (!item_id) {
      return res.status(400).json({ error: '请选择要兑换的商品' });
    }

    // Get item
    const item = db.prepare('SELECT * FROM shop_items WHERE id = ? AND active = 1').get(item_id);
    if (!item) {
      return res.status(404).json({ error: '商品不存在或已下架' });
    }

    // Check stock
    if (item.stock !== null && item.stock <= 0) {
      return res.status(400).json({ error: '该商品已售罄' });
    }

    // Get user points
    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
    const userPoints = Number(user.points) || 0;

    if (userPoints < item.price) {
      return res.status(403).json({
        error: `积分不足，需要 ${item.price} 积分，当前 ${userPoints} 积分`,
        need_points: item.price,
        current_points: userPoints
      });
    }

    // Atomic redeem: deduct points, stock, record, apply effect
    const redeemTx = db.transaction(() => {
      // Deduct points
      const deducted = db.prepare('UPDATE users SET points = points - ? WHERE id = ? AND points >= ?').run(item.price, userId, item.price);
      if (deducted.changes === 0) {
        return { error: '积分不足，兑换失败' };
      }

      // Decrease stock
      if (item.stock !== null) {
        const stockUpdated = db.prepare('UPDATE shop_items SET stock = stock - 1 WHERE id = ? AND (stock IS NULL OR stock > 0)').run(item_id);
        if (stockUpdated.changes === 0) {
          return { error: '该商品已售罄' };
        }
      }

      // Record redemption
      db.prepare(`
        INSERT INTO shop_redemptions (user_id, item_id, points_spent, status)
        VALUES (?, ?, ?, 'completed')
      `).run(userId, item_id, item.price);

      // Apply item effect
      applyItemEffect(userId, item);

      return { error: null };
    });

    const txResult = redeemTx();
    if (txResult.error) {
      return res.status(400).json({ error: txResult.error });
    }

    const updatedUser = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);

    res.json({
      success: true,
      message: `恭喜兑换成功！${item.name}`,
      points_spent: item.price,
      remaining_points: updatedUser.points,
      item: item
    });
  } catch (err) {
    console.error('[Shop redeem]', err);
    res.status(500).json({ error: '兑换失败' });
  }
});

// Apply item effect to user
function applyItemEffect(userId, item) {
  try {
    if (item.item_type === 'title') {
      // Set custom title
      db.prepare('UPDATE users SET custom_title = ? WHERE id = ?').run(item.effect_value, userId);
    } else if (item.item_type === 'badge') {
      // Give badge
      const badgeExists = db.prepare(
        'SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?'
      ).get(userId, item.effect_value);

      if (!badgeExists) {
        db.prepare(
          'INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)'
        ).run(userId, item.effect_value);
      }
    } else if (item.item_type === 'avatar_frame') {
      // Set avatar frame
      db.prepare('UPDATE users SET avatar_frame = ? WHERE id = ?').run(item.effect_value, userId);
    } else if (item.item_type === 'points_bonus') {
      // Give bonus points (percentage)
      const multiplier = parseFloat(item.effect_value) || 1;
      const currentUser = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
      const bonus = Math.floor(currentUser.points * multiplier);
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(bonus, userId);
    }
  } catch (err) {
    console.error('[Shop applyItemEffect]', err);
  }
}

// Get user's redemption history
router.get('/my-redemptions', authMiddleware, (req, res) => {
  try {
    const history = db.prepare(`
      SELECT sr.*, si.name as item_name, si.icon as item_icon, si.image_url
      FROM shop_redemptions sr
      JOIN shop_items si ON sr.item_id = si.id
      WHERE sr.user_id = ?
      ORDER BY sr.created_at DESC
      LIMIT 50
    `).all(req.user.id);

    res.json({ history });
  } catch (err) {
    console.error('[Shop history]', err);
    res.status(500).json({ error: '获取兑换记录失败' });
  }
});

// ============ Admin Routes ============

// Get all items (including inactive)
router.get('/admin/items', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const items = db.prepare(`
      SELECT si.*, u.username as creator_name
      FROM shop_items si
      LEFT JOIN users u ON si.created_by = u.id
      ORDER BY si.active DESC, si.sort_order ASC
    `).all();

    res.json({ items });
  } catch (err) {
    console.error('[Shop admin]', err);
    res.status(500).json({ error: '获取商品列表失败' });
  }
});

// Create item
router.post('/admin/items', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const { name, description, icon, image_url, price, stock, item_type, effect_value, sort_order, active } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: '商品名和价格不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO shop_items (name, description, icon, image_url, price, stock, item_type, effect_value, sort_order, active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      description || '',
      icon || '🎁',
      image_url || '',
      parseInt(price) || 0,
      stock !== null ? parseInt(stock) : null,
      item_type || 'title',
      effect_value || '',
      parseInt(sort_order) || 0,
      active !== false ? 1 : 0,
      req.user.id
    );

    const item = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(result.lastInsertRowid);
    res.json({ item });
  } catch (err) {
    console.error('[Shop create]', err);
    res.status(500).json({ error: '创建商品失败' });
  }
});

// Update item
router.put('/admin/items/:id', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const { name, description, icon, image_url, price, stock, item_type, effect_value, sort_order, active } = req.body;

    const existing = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '商品不存在' });
    }

    db.prepare(`
      UPDATE shop_items SET
        name = ?, description = ?, icon = ?, image_url = ?,
        price = ?, stock = ?, item_type = ?, effect_value = ?,
        sort_order = ?, active = ?
      WHERE id = ?
    `).run(
      name ?? existing.name,
      description ?? existing.description,
      icon ?? existing.icon,
      image_url ?? existing.image_url,
      price !== undefined ? parseInt(price) : existing.price,
      stock !== undefined ? (stock === null ? null : parseInt(stock)) : existing.stock,
      item_type ?? existing.item_type,
      effect_value ?? existing.effect_value,
      sort_order !== undefined ? parseInt(sort_order) : existing.sort_order,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      req.params.id
    );

    const item = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id);
    res.json({ item });
  } catch (err) {
    console.error('[Shop update]', err);
    res.status(500).json({ error: '更新商品失败' });
  }
});

// Delete item
router.delete('/admin/items/:id', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const existing = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '商品不存在' });
    }

    // Soft delete (set inactive)
    db.prepare('UPDATE shop_items SET active = 0 WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('[Shop delete]', err);
    res.status(500).json({ error: '删除商品失败' });
  }
});

module.exports = router;
