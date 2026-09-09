module.exports = {
  apps: [
    {
      name: 'autosecure-bot',
      script: 'autosecure.js',
      instances: '1',
      exec_mode: 'fork',
      node_args: '--max-old-space-size=4096',
      env: {
        NODE_ENV: 'production',
        PM2_PIDUSAGE_DISABLE: 'true'
      },
      windowsHide: true,
      pmx: false,
      monitoring: false,
      disable_reloader: true,
      log_file: './logs/bot-combined.log',
      out_file: './logs/bot-out.log',
      error_file: './logs/bot-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_restarts: 10,
      min_uptime: '15s',
      max_memory_restart: '1G',
      restart_delay: 3000,
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git', 'db']
    },
    {
      name: 'autosecure-backend',
      script: './servers/backendServer.js',
      instances: '1',
      exec_mode: 'fork',
      node_args: '--max-old-space-size=2048',
      env: {
        NODE_ENV: 'production',
        BACKEND_PORT: 5000,
        PM2_PIDUSAGE_DISABLE: 'true'
      },
      windowsHide: true,
      pmx: false,
      monitoring: false,
      disable_reloader: true,
      log_file: './logs/backend-combined.log',
      out_file: './logs/backend-out.log',
      error_file: './logs/backend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_restarts: 10,
      min_uptime: '15s',
      max_memory_restart: '1G',
      restart_delay: 3000,
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git', 'db']
    },
    {
      name: 'autosecure-frontend',
      script: './servers/frontendServer.js',
      instances: '1',
      exec_mode: 'fork',
      node_args: '--max-old-space-size=2048',
      env: {
        NODE_ENV: 'production',
        FRONTEND_PORT: 3000,
        PM2_PIDUSAGE_DISABLE: 'true'
      },
      windowsHide: true,
      pmx: false,
      monitoring: false,
      disable_reloader: true,
      log_file: './logs/frontend-combined.log',
      out_file: './logs/frontend-out.log',
      error_file: './logs/frontend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_restarts: 10,
      min_uptime: '15s',
      max_memory_restart: '1G',
      restart_delay: 3000,
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git']
    }
  ]
};
