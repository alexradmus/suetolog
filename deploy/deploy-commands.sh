#!/bin/bash

# Команды для деплоя Suetolog Backtester на сервер
# Выполнять на сервере ubuntu@qnts.io

set -e

echo "🚀 Деплой Suetolog Backtester на suetolog.qnts.io"

# 1. Настройка Nginx конфигурации
echo "📝 Настраиваем Nginx..."
sudo cp /tmp/nginx-config.conf /etc/nginx/sites-available/suetolog.qnts.io
sudo ln -sf /etc/nginx/sites-available/suetolog.qnts.io /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 2. Получение SSL сертификата
echo "🔒 Получаем SSL сертификат..."
sudo certbot --nginx -d suetolog.qnts.io --non-interactive --agree-tos --email admin@qnts.io

# 3. Переключение на пользователя suetolog для работы с приложением
echo "👤 Переключаемся на пользователя suetolog..."

# Команды для выполнения от имени пользователя suetolog:
sudo -u suetolog bash << 'EOF'
cd /var/www/suetolog

# Клонирование или обновление кода (замените на ваш репозиторий)
if [ ! -d ".git" ]; then
    echo "📦 Клонируем репозиторий..."
    # git clone https://github.com/username/suetolog-backtester.git .
    echo "⚠️  Необходимо вручную загрузить код приложения в /var/www/suetolog"
else
    echo "🔄 Обновляем код..."
    git pull origin main
fi

# Установка зависимостей
if [ -f "package.json" ]; then
    echo "📦 Устанавливаем зависимости..."
    npm install --production
fi

# Копирование PM2 конфигурации
if [ -f "/tmp/pm2-ecosystem.config.js" ]; then
    cp /tmp/pm2-ecosystem.config.js ./ecosystem.config.js
fi
EOF

# 4. Настройка PM2 и запуск приложения
echo "🔧 Настраиваем PM2..."
sudo -u suetolog bash << 'EOF'
cd /var/www/suetolog

# Остановка существующих процессов (если есть)
pm2 delete suetolog-backtester 2>/dev/null || true

# Запуск приложения через PM2
if [ -f "ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js --env production
else
    pm2 start server/index.js --name suetolog-backtester --env production
fi

# Сохранение конфигурации PM2
pm2 save

# Настройка автозапуска PM2
pm2 startup
EOF

# 5. Настройка автозапуска PM2 (требует sudo)
echo "🔄 Настраиваем автозапуск PM2..."
# Эта команда выведет команду для выполнения с sudo
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u suetolog --hp /home/suetolog

# 6. Проверка статуса
echo "✅ Проверяем статус сервисов..."
sudo systemctl status nginx --no-pager -l
sudo -u suetolog pm2 status

echo ""
echo "🎉 Деплой завершен!"
echo ""
echo "📋 Проверьте:"
echo "1. Сайт доступен: https://suetolog.qnts.io"
echo "2. API работает: https://suetolog.qnts.io/health"
echo "3. PM2 процессы: sudo -u suetolog pm2 status"
echo "4. Nginx логи: sudo tail -f /var/log/nginx/suetolog.error.log"
echo "5. Приложение логи: sudo -u suetolog pm2 logs suetolog-backtester"
echo ""
echo "🔧 Полезные команды:"
echo "sudo -u suetolog pm2 restart suetolog-backtester"
echo "sudo -u suetolog pm2 logs suetolog-backtester"
echo "sudo -u suetolog pm2 monit"
echo "sudo systemctl reload nginx"
