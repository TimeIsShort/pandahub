/**
 * Leaderboard Cron Scheduler
 * Calculates weekly leaderboard every Monday at 00:05
 * Calculates monthly leaderboard on 1st of each month at 00:10
 */

const { calculateWeeklyLeaderboard, calculateMonthlyLeaderboard } = require('../routes/activityLeaderboard');

let schedulerInterval = null;

function startLeaderboardScheduler() {
  console.log('[LeaderboardScheduler] Starting...');

  function checkAndRun() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday
    const dayOfMonth = now.getDate();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Weekly: every Monday at 00:05
    if (dayOfWeek === 1 && hour === 0 && minute >= 5 && minute < 10) {
      console.log('[LeaderboardScheduler] Running weekly calculation...');
      try {
        const result = { sync: true };
        const weekly = calculateWeeklyLeaderboard();
        const monthly = calculateMonthlyLeaderboard();
        console.log('[LeaderboardScheduler] Weekly done:', JSON.stringify(result));
      } catch(e) {
        console.error('[LeaderboardScheduler] Error:', e.message);
      }
    }

    // Monthly: 1st of month at 00:10
    if (dayOfMonth === 1 && hour === 0 && minute >= 10 && minute < 15) {
      console.log('[LeaderboardScheduler] Running monthly calculation...');
      try {
        const result = { sync: true };
        const monthly = calculateMonthlyLeaderboard();
        console.log('[LeaderboardScheduler] Monthly done:', JSON.stringify(result));
      } catch(e) {
        console.error('[LeaderboardScheduler] Error:', e.message);
      }
    }
  }

  // Run every 5 minutes
  schedulerInterval = setInterval(checkAndRun, 5 * 60 * 1000);
  console.log('[LeaderboardScheduler] Scheduler started (checks every 5 min)');
}

function stopLeaderboardScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

// Run on startup to backfill if needed (can be triggered manually via API)
if (require.main === module) {
  console.log('[LeaderboardScheduler] Running manual calculation...');
  calculateWeeklyLeaderboard().then(r => {
    console.log('Weekly:', JSON.stringify(r));
    return calculateMonthlyLeaderboard();
  }).then(r => {
    console.log('Monthly:', JSON.stringify(r));
    process.exit(0);
  }).catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
}

module.exports = { startLeaderboardScheduler, stopLeaderboardScheduler };
