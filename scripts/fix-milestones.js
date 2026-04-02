const db = require('/root/forum/models/database');

const stats = {
  users: db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt,
  posts: db.prepare("SELECT COUNT(*) as cnt FROM posts WHERE status='approved'").get().cnt,
  comments: db.prepare('SELECT COUNT(*) as cnt FROM comments').get().cnt,
  checkin_streak_max: 0
};
console.log('Current stats:', stats);

// Clear all milestone_events
db.prepare('DELETE FROM milestone_events').run();

// Re-insert only actually achieved milestones
const shouldAchieve = db.prepare(`
  SELECT m.id, m.milestone_type, m.threshold FROM milestones m
  WHERE (
    (m.milestone_type = 'users' AND ? >= m.threshold) OR
    (m.milestone_type = 'posts' AND ? >= m.threshold) OR
    (m.milestone_type = 'comments' AND ? >= m.threshold) OR
    (m.milestone_type = 'checkin_streak' AND ? >= m.threshold)
  )
`).all(stats.users, stats.posts, stats.comments, stats.checkin_streak_max);

console.log('Should achieve:', shouldAchieve.length);
for (const m of shouldAchieve) {
  console.log('  -', m.milestone_type, m.threshold);
  db.prepare('INSERT OR IGNORE INTO milestone_events (milestone_id) VALUES (?)').run(m.id);
}

// Verify
const achieved = db.prepare(`
  SELECT m.icon, m.title, m.milestone_type, m.threshold, me.achieved_at
  FROM milestones m
  JOIN milestone_events me ON m.id = me.milestone_id
  ORDER BY m.milestone_type, m.threshold
`).all();

console.log('\nActually achieved:', achieved.length);
for (const m of achieved) {
  console.log('  ✅', m.icon, m.title, '(' + m.milestone_type + '=' + m.threshold + ')');
}
