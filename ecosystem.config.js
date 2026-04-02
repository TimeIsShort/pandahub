module.exports = {
  apps: [{
    name: 'forum',
    script: './index.js',
    cwd: '/root/forum',
    interpreter: 'node',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/root/.pm2/logs/forum-error.log',
    out_file: '/root/.pm2/logs/forum-out.log',
    log_file: '/root/.pm2/logs/forum-combined.log',
    time: true
  }]
};
