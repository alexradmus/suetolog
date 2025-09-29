# Деплой Suetolog Backtester

Инструкции по развертыванию приложения Suetolog Backtester на сервере Ubuntu.

## Информация о сервере

- **Сервер**: `ubuntu@qnts.io`
- **Домен**: `https://suetolog.qnts.io`
- **Порт приложения**: 3000 (внутренний)
- **Веб-сервер**: Nginx (80, 443)

## Структура проекта

```
quants.io/
├── server/
│   └── index.js          # Основной сервер Express
├── src/core/
│   ├── backtester.js     # Логика бэктестинга
│   └── bybitClient.js    # Клиент для Bybit API
├── public/
│   ├── index.html        # Фронтенд
│   ├── app.js           # JavaScript клиента
│   └── style.css        # Стили
├── package.json         # Зависимости Node.js
└── deploy/              # Файлы для деплоя
```

## Пошаговый деплой

### 1. Подготовка сервера

Подключитесь к серверу и выполните базовую настройку:

```bash
ssh ubuntu@qnts.io
```

Загрузите и выполните скрипт настройки:

```bash
# Скачайте файл server-setup.sh на сервер
chmod +x server-setup.sh
sudo ./server-setup.sh
```

### 2. Загрузка файлов конфигурации

Загрузите файлы конфигурации на сервер:

```bash
# Nginx конфигурация
scp deploy/nginx-config.conf ubuntu@qnts.io:/tmp/

# PM2 конфигурация  
scp deploy/pm2-ecosystem.config.js ubuntu@qnts.io:/tmp/

# Скрипт деплоя
scp deploy/deploy-commands.sh ubuntu@qnts.io:/tmp/
```

### 3. Загрузка кода приложения

Загрузите код приложения на сервер:

```bash
# Вариант 1: Через SCP
scp -r . ubuntu@qnts.io:/tmp/suetolog-app/

# Вариант 2: Через Git (рекомендуется)
# Сначала создайте репозиторий и загрузите код
# Затем на сервере:
sudo -u suetolog git clone <your-repo-url> /var/www/suetolog
```

### 4. Выполнение деплоя

На сервере выполните:

```bash
chmod +x /tmp/deploy-commands.sh
sudo /tmp/deploy-commands.sh
```

### 5. Проверка

После деплоя проверьте:

- ✅ Сайт: https://suetolog.qnts.io
- ✅ API: https://suetolog.qnts.io/health
- ✅ PM2: `sudo -u suetolog pm2 status`

## Управление приложением

### PM2 команды

```bash
# Статус процессов
sudo -u suetolog pm2 status

# Логи приложения
sudo -u suetolog pm2 logs suetolog-backtester

# Перезапуск приложения
sudo -u suetolog pm2 restart suetolog-backtester

# Мониторинг ресурсов
sudo -u suetolog pm2 monit

# Остановка приложения
sudo -u suetolog pm2 stop suetolog-backtester
```

### Nginx команды

```bash
# Проверка конфигурации
sudo nginx -t

# Перезагрузка конфигурации
sudo systemctl reload nginx

# Статус сервиса
sudo systemctl status nginx

# Логи
sudo tail -f /var/log/nginx/suetolog.access.log
sudo tail -f /var/log/nginx/suetolog.error.log
```

### SSL сертификат

```bash
# Обновление сертификата
sudo certbot renew

# Проверка сертификата
sudo certbot certificates
```

## Обновление приложения

### Через Git

```bash
sudo -u suetolog bash
cd /var/www/suetolog
git pull origin main
npm install --production
pm2 restart suetolog-backtester
```

### Через загрузку файлов

```bash
# Остановить приложение
sudo -u suetolog pm2 stop suetolog-backtester

# Загрузить новые файлы
scp -r . ubuntu@qnts.io:/var/www/suetolog/

# Установить зависимости и запустить
sudo -u suetolog bash
cd /var/www/suetolog
npm install --production
pm2 start suetolog-backtester
```

## Мониторинг

### Логи приложения

```bash
# PM2 логи
sudo -u suetolog pm2 logs suetolog-backtester --lines 100

# Системные логи
sudo journalctl -u nginx -f
sudo journalctl -u pm2-suetolog -f
```

### Ресурсы системы

```bash
# Использование CPU и памяти
htop

# Дисковое пространство
df -h

# PM2 мониторинг
sudo -u suetolog pm2 monit
```

## Безопасность

### Файрвол

```bash
# Проверка статуса
sudo ufw status

# Разрешенные порты: 22 (SSH), 80 (HTTP), 443 (HTTPS)
```

### SSL

- Автоматическое обновление через certbot
- HTTPS редирект настроен в Nginx
- Безопасные SSL настройки

## Troubleshooting

### Приложение не запускается

```bash
# Проверить логи PM2
sudo -u suetolog pm2 logs suetolog-backtester

# Проверить порт
sudo netstat -tlnp | grep :3000

# Проверить процессы
sudo -u suetolog pm2 status
```

### Nginx ошибки

```bash
# Проверить конфигурацию
sudo nginx -t

# Проверить логи
sudo tail -f /var/log/nginx/suetolog.error.log

# Перезапустить Nginx
sudo systemctl restart nginx
```

### SSL проблемы

```bash
# Проверить сертификат
sudo certbot certificates

# Обновить сертификат
sudo certbot renew --dry-run
```

## Контакты

При возникновении проблем проверьте:
1. Логи приложения: `sudo -u suetolog pm2 logs`
2. Логи Nginx: `sudo tail -f /var/log/nginx/suetolog.error.log`
3. Статус сервисов: `sudo systemctl status nginx`
