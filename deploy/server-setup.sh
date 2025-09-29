#!/bin/bash

# Скрипт для подготовки Ubuntu сервера для деплоя Suetolog Backtester
# Домен: suetolog.qnts.io
# Сервер: ubuntu@qnts.io

set -e

echo "🚀 Начинаем настройку сервера для Suetolog Backtester..."

# Обновление системы
echo "📦 Обновляем систему..."
sudo apt update && sudo apt upgrade -y

# Установка необходимых пакетов
echo "📦 Устанавливаем базовые пакеты..."
sudo apt install -y curl wget git unzip software-properties-common

# Установка Node.js (LTS версия)
echo "📦 Устанавливаем Node.js..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка версий
echo "✅ Проверяем версии:"
node --version
npm --version

# Установка PM2 глобально
echo "📦 Устанавливаем PM2..."
sudo npm install -g pm2

# Установка Nginx
echo "📦 Устанавливаем Nginx..."
sudo apt install -y nginx

# Установка Certbot для SSL
echo "📦 Устанавливаем Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# Создание пользователя для приложения (если не существует)
if ! id "suetolog" &>/dev/null; then
    echo "👤 Создаем пользователя suetolog..."
    sudo useradd -m -s /bin/bash suetolog
    sudo usermod -aG sudo suetolog
fi

# Создание директорий для приложения
echo "📁 Создаем директории..."
sudo mkdir -p /var/www/suetolog
sudo mkdir -p /var/log/suetolog
sudo chown -R suetolog:suetolog /var/www/suetolog
sudo chown -R suetolog:suetolog /var/log/suetolog

# Настройка файрвола
echo "🔥 Настраиваем файрвол..."
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# Запуск и включение автозапуска сервисов
echo "🔧 Настраиваем сервисы..."
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl start ufw
sudo systemctl enable ufw

echo "✅ Базовая настройка сервера завершена!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Настроить Nginx конфигурацию для suetolog.qnts.io"
echo "2. Получить SSL сертификат"
echo "3. Загрузить код приложения"
echo "4. Настроить PM2 для автозапуска"
echo ""
echo "🔗 Полезные команды:"
echo "sudo systemctl status nginx"
echo "sudo systemctl status ufw"
echo "pm2 status"
echo "pm2 logs"
