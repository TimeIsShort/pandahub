/**
 * Milestone Checker - call after key community actions
 * This triggers milestone detection and recording for gamification.
 */

const db = require('../models/database');

/**
 * Check and record milestones after a community action
 * @param {string} type - 'users' | 'posts' | 'comments' | 'checkin_streak'
 * @param {number} currentValue - current count (optional, will query if not provided)
 */
function checkMilestones(type, currentValue) {
  try {
    // Get current value if not provided
    let value = currentValue;
    if (value === undefined) {
      const stats = {
        users: db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt,
        posts: db.prepare("SELECT COUNT(*) as cnt FROM posts WHERE status='approved'").get().cnt,
        comments: db.prepare("SELECT COUNT(*) as cnt FROM comments").get().cnt
      };
      value = stats[type];
    }

    // Find newly achieved milestones
    const achieved = db.prepare(`
      SELECT m.id, m.title, m.milestone_type, m.threshold
      FROM milestones m
      LEFT JOIN milestone_events e ON m.id = e.milestone_id
      WHERE m.milestone_type = ? AND m.threshold <= ? AND e.id IS NULL
      ORDER BY m.threshold DESC
    `).all(type, value || 0);

    if (achieved.length === 0) return [];

    // Record each new milestone
    const insertEvent = db.prepare('INSERT OR IGNORE INTO milestone_events (milestone_id) VALUES (?)');
    for (const m of achieved) {
      insertEvent.run(m.id);
      // Log the achievement
      try {
        db.prepare(`
          INSERT INTO admin_action_logs (admin_id, action, target_type, target_id, details, created_at)
          VALUES (1, 'milestone_achieved', 'milestone', ?, ?, datetime('now'))
        `).run(m.id, '里程碑达成: ' + m.title);
      } catch (e) {
        // admin_action_logs might not exist in all environments
        console.log('[Milestone] Logged:', m.title);
      }
    }

    return achieved;
  } catch (err) {
    console.error('[Milestone check]', err);
    return [];
  }
}

/**
 * Get the latest achieved milestone (for showing celebration modal)
 */
function getLatestMilestone() {
  try {
    return db.prepare(`
      SELECT m.*, e.achieved_at
      FROM milestones m
      JOIN milestone_events e ON m.id = e.milestone_id
      ORDER BY e.achieved_at DESC
      LIMIT 1
    `).get();
  } catch (err) {
    return null;
  }
}

module.exports = { checkMilestones, getLatestMilestone };
