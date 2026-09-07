module.exports = {
  apps: [{
    name: 'autosecure',
    script: 'autosecure.js',
    instances: '1',
    exec_mode: 'fork', // SQLite does not support multi-process writes safely; use single instance
    node_args: '--max-old-space-size=4096',
    env: {
      NODE_ENV: 'production',
      PM2_PIDUSAGE_DISABLE: 'true'
    },
    // Windows-specific configuration to avoid wmic errors
    windowsHide: true,
    pmx: false,
    // Disable monitoring to avoid wmic issues
    monitoring: false,
    // Disable pidusage to prevent WMIC errors
    disable_reloader: true,
    // Log configuration
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Restart configuration - more conservative to prevent crash loops
    max_restarts: 5,
    min_uptime: '30s',
    max_memory_restart: '1G',
    restart_delay: 5000,
    // Prevent immediate restarts
    autorestart: true,
    // Watch for file changes (disable if not needed)
    watch: false,
    // Ignore specific files to prevent restart loops
    ignore_watch: ['node_modules', 'logs', '.git']
  }]
};
