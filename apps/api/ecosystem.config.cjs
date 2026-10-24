module.exports = {
  apps: [
    {
      name: 'restorent-api',
      cwd: __dirname,
      // Run the Node entrypoint directly rather than executing `npm` (avoids pm2 trying to run npm.cmd as JS)
      // Use the app's ESM entrypoint under apps/api
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      // Delay between restarts (ms) and minimal uptime to consider process healthy
      restart_delay: 5000,
      min_uptime: 60000,
      // Limit restarts to avoid process-count explosions. Default uses crash-guard env if set.
      max_restarts: Number(process.env.CRASH_GUARD_MAX_RESTARTS || 5),
      // Log files (relative to cwd)
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      env: {
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development'
      }
    }
  ]
};
