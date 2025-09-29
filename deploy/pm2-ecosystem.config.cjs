// PM2 конфигурация для Suetolog Backtester
// Файл: ecosystem.config.js

module.exports = {
  apps: [{
    name: 'suetolog-backtester',
    script: './server/index.js',
    cwd: '/srv/suetolog',
    instances: 1, // Можно увеличить для масштабирования
    exec_mode: 'fork', // или 'cluster' для нескольких инстансов
    
    // Переменные окружения
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },

    // Логи
    log_file: '/var/log/suetolog/combined.log',
    out_file: '/var/log/suetolog/out.log',
    error_file: '/var/log/suetolog/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Автоперезапуск
    watch: false, // В продакшене лучше выключить
    ignore_watch: ['node_modules', 'logs', '*.log'],
    
    // Ресурсы
    max_memory_restart: '500M',
    
    // Перезапуск при сбоях
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Graceful shutdown
    kill_timeout: 5000,
    
    // Дополнительные опции
    merge_logs: true,
    time: true,
  }],

  // Конфигурация для деплоя (опционально)
  deploy: {
    production: {
      user: 'suetolog',
      host: 'qnts.io',
      ref: 'origin/main',
      repo: 'git@github.com:username/suetolog-backtester.git', // Замените на ваш репозиторий
      path: '/var/www/suetolog',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt update && apt install git -y'
    }
  }
};
