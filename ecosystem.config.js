module.exports = {
  apps: [
    {
      name: 'nextjs',
      script: './server.js',
      instances: '1',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
      },
      time: true,
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', '.next'],
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
} 