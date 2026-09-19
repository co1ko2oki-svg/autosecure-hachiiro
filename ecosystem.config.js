module.exports = {
  apps: [
    {
      name: 'autosecure-all',
      script: './run_all.js',
      instances: '1',
      exec_mode: 'fork',
      node_args: '--max-old-space-size=4096',
      env: {
        NODE_ENV: 'production',
        BACKEND_PORT: 5000,
        FRONTEND_PORT: 3667,
        PM2_PIDUSAGE_DISABLE: 'true'
      },
      windowsHide: true,
      pmx: false,
      monitoring: false,
      disable_reloader: true,
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_restarts: 10,
      min_uptime: '15s',
      max_memory_restart: '2G',
      restart_delay: 3000,
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git', 'db']
    }
  ]
};
