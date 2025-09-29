1) Цель и критерии приёмки

Повторить логику Pine-стратегии “Suetolog high caps” на исторических свечах Bybit (USDT-perp), без лукапа.

На одинаковых данных/ТФ/комиссиях различие итогового PnL с TradingView ≤ ±2%, число сделок ≤ ±1 сделка на 100 сделок.

UI: встроенный график, видны маркеры L/S и TP, таблица сделок, блок метрик, перезапуск без перезагрузки страницы.

2) Область (scope)

Один символ за прогон (BTCUSDT по умолчанию), возможность менять символ и ТФ в UI.

Таймфреймы: 1m, 3m, 5m, 15m, 1h, 4h, 1d.

Диапазон теста: “последние N дней” (число вводится в UI).

Валюта отчётности: USDT. Плечо и funding — выключены в MVP (можно добавить позже).

Пирамидинг в MVP выкл (1 вход — 1 выход). (Флаг на будущее.)

3) Данные

Источник: Bybit REST v5 market/kline, category=linear, symbol=<SYMBOL>, interval=<TF>, start,end в ms.

Формат OHLCV (UTC): { ts, open, high, low, close, volume }.

Валидация свечей: low ≤ min(open,close) ≤ max(open,close) ≤ high, сортировка по ts возрастанию.

Кэширование в памяти (на процесс) не обязательно; можно добавить позже (файл/Redis).

4) Параметры стратегии (UI + API)

length (int, деф. 48)

long (bool, деф. true), short (bool, деф. true)

multiplicator_long (float, деф. 1.0)

profit_multiplicator_long (float, деф. 1.3)

multiplicator_short (float, деф. 2.5)

profit_multiplicator_short (float, деф. 0.8)

Торговые параметры:

initial_capital (USDT, деф. 10000)

qty_pct (процент от текущего equity на вход, деф. 1.0%)

fees_bps (taker bps, деф. 7.5)

slippage_bps (bps, деф. 1.0)

5) Формулы (1:1 с Pine)

bar_vol = (high - low) / close * 100

vol = SMA(bar_vol, length)

red = close < open * 0.99

green = close > open * 1.01

go_long = bar_vol > vol * (1 + multiplicator_long) && long && red

go_short = bar_vol > vol * (1 + multiplicator_short) && short && green

База цены:

base = position_avg_price != 0 ? position_avg_price : close (в MVP позиция одиночная → base = close)

TP:

Long: tp = base + base * (vol + vol*multiplicator_long) * profit_multiplicator_long / 100

Short: tp = base - base * (vol + vol*multiplicator_short) * profit_multiplicator_short / 100

6) Модель исполнения (MVP)

close_on_signal:

Вход по Close бара, на котором выполнено условие (с учётом слиппеджа/комиссии).

TP становится активным со следующего бара.

Выход по TP, если:

для Long: high_next >= tp → исполняем лимит по цене tp;

для Short: low_next <= tp → исполняем лимит по цене tp.

Слиппедж: применяется к входу и к выходу (buy — прибавить bps, sell — вычесть bps).

Комиссия: fees_bps от нотиона сделки (вход/выход).

7) Архитектура

server (Node/Express):

/backtest (GET) — принимает query-параметры, тянет свечи с Bybit, запускает бэктест, возвращает JSON.

Отдаёт статический фронт (/ → index.html).

front (Vanilla JS):

Панель параметров (symbol/TF/days/length/qty%/fees/slippage).

Кнопка Run → fetch /backtest → отрисовать результат.

График: TradingView Lightweight Charts.

Таблица сделок, блок метрик.

8) API контракты
8.1 Запрос

GET /backtest?symbol=BTCUSDT&interval=5&start=1732406400000&end=1732924800000&length=48&qty_pct=1.0&fees_bps=7.5&slippage_bps=1.0&long=true&short=true

interval: Bybit kline (строки 1,3,5,15,60,240,1440).

start/end: unix ms.

Остальные — как в §4.

8.2 Ответ
{
  "candles": [
    {"ts": 1732406400000, "open": 65000, "high": 65100, "low": 64800, "close": 64950, "volume": 1234},
    ...
  ],
  "markers": [
    {"ts": 1732492800000, "position": "belowBar", "color": "green", "text": "L"},
    {"ts": 1732500000000, "position": "aboveBar", "color": "green", "text": "TP"},
    {"ts": 1732586400000, "position": "aboveBar", "color": "red",   "text": "S"},
    {"ts": 1732590000000, "position": "belowBar", "color": "red",   "text": "TP"}
  ],
  "trades": [
    {
      "side": "LONG",
      "ts_entry": 1732492800000,
      "ts_exit": 1732500000000,
      "entry": 64780.12,
      "exit": 65310.00,
      "qty": 0.154321,
      "pnl": 81.45,
      "fee": 2.12
    },
    ...
  ],
  "metrics": {
    "initial_capital": 10000,
    "final_equity": 10123.50,
    "total_pnl": 123.50,
    "return_pct": "1.23",
    "trades_count": 14
  }
}

9) UI требования

Хедер-панель:

Поля: Symbol, TF, Days, length, qty%, fees bps, slip bps.

Кнопка Run.

Главная область:

Слева: график (мин. 560px высота), свечи + маркеры:

L — зелёная стрелка вверх belowBar

S — красная стрелка вниз aboveBar

TP — круг (зелёный для Long, красный для Short) со стороны выхода

Справа: карточка «Metrics» (Initial, Final, Return %, Trades count) и «Trades» (таблица).

Адаптивность: корректная работа на 1440px ширине и выше; на мобильном — по возможности одна колонка.

10) Метрики (MVP)

Initial, Final, Return %, Trades count.

(Optional next) Max Drawdown %, Profit Factor, WinRate, Avg Win/Loss.

11) Нефункциональные требования

Время ответа /backtest на 2 недели 5m-свечей: ≤ 2–3 сек на обычном ноутбуке.

Обработка ошибок Bybit (пустые данные, retCode≠0) — человекочитаемые сообщения в UI.

Ограничение на объём: не грузить более 90 дней 1m за раз (сообщение пользователю).

12) Тест-кейсы приёмки

Сигналы Long/Short: при фиксированных свечах (мок-датасет) проверки:

вход по Close сигнального бара;

TP активен со следующего бара;

выполненный TP фиксируется в ту же точку времени (ts следующего бара) и отражается в таблице/маркерах.

Слиппедж/комиссии: при включенных bps итоговый PnL уменьшается ожидаемо.

Отсутствие сигналов: метрики считаются, сделок 0, интерфейс не ломается.

Смена параметров: изменение length или qty% перерисовывает график и обновляет метрики без перезагрузки страницы.

Крайние случаи: короткая история (менее length баров) — корректное предупреждение/вывод без падения.

13) Будущие расширения (после MVP)

Вариант исполнения next_bar_open и intrabar_tp (переключатель в UI).

Пирамидинг (средняя цена, пересчёт TP при доборе).

Funding по Bybit (начисление каждые 8 часов).

Экспорт CSV (trades/equity), сохранение пресетов.

Мульти-символьный batch-runner (простая очередь по символам).

Отображение equity curve под графиком свечей.



Скрипт стратегии которую тестим:
// This Pine Script® code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
// © Rektify_app

//@version=6
strategy("Suetolog high caps",
     initial_capital = 1000,
     pyramiding = 100,
     default_qty_value = 1,
     default_qty_type = strategy.percent_of_equity,
     overlay = true)

// ===== ПАРАМЕТРЫ =====
length = input.int(48, 'Length')
long   = input.bool(true,  'Enable Long',  group = 'LONG')
short  = input.bool(false, 'Enable Short', group = 'SHORT')

multiplicator_long           = input.int(100, 'Percent multiplier',       group='LONG')  / 100
profit_multiplicator_long    = input.int(130, 'Profit multiplicator',     group='LONG')  / 100
multiplicator_short          = input.int(250, 'Percent multiplier',       group='SHORT') / 100
profit_multiplicator_short   = input.int(80,  'Profit multiplicator',     group='SHORT') / 100

// ===== АЛЕРТЫ =====
sendLongAlert  = input.bool(true,  "Отправлять сигнал LONG",        group="ALERTS")
sendShortAlert = input.bool(true,  "Отправлять сигнал SHORT",       group="ALERTS")
sendTPAlert    = input.bool(false, "Отправлять сигнал TAKE PROFIT", group="ALERTS") // можно включить при необходимости

// ===== РАСЧЁТ =====
var float tp_price = na

vol           = ta.sma((high - low) / close * 100, length)
red_candle    = close <  open * 0.99
green_candle  = close >  open * 1.01

go_long  = (high - low) / close * 100 > vol + vol * multiplicator_long  and long  and red_candle
go_short = (high - low) / close * 100 > vol + vol * multiplicator_short and short and green_candle

plot(strategy.position_avg_price, title='Position avg price', style=plot.style_linebr)
plot(tp_price,                     title='TP price',           style=plot.style_linebr, color=color.green)

// если позиции нет — убираем линию TP
if strategy.position_size == 0
    tp_price := na

// ===== ВХОДЫ и установка TP (всё в одну строку — без переносов на '+') =====
if go_long and barstate.isconfirmed
    strategy.entry('L', strategy.long)
    base = strategy.position_avg_price != 0 ? strategy.position_avg_price : close
    tp_price := base + base * (vol + vol * multiplicator_long) * profit_multiplicator_long / 100
    if sendLongAlert
        alert("LONG " + syminfo.ticker, alert.freq_once_per_bar_close)

if go_short and barstate.isconfirmed
    strategy.entry('S', strategy.short)
    base = strategy.position_avg_price != 0 ? strategy.position_avg_price : close
    tp_price := base - base * (vol + vol * multiplicator_short) * profit_multiplicator_short / 100
    if sendShortAlert
        alert("SHORT " + syminfo.ticker, alert.freq_once_per_bar_close)

// ===== ВЫХОД ПО TP (переименовано) =====
if strategy.position_avg_price != 0
    strategy.exit('TAKE PROFIT', limit=tp_price)

// Необязательный алерт о достижении TP — выключен по умолчанию
longTpHit  = strategy.position_size > 0 and not na(tp_price) and high >= tp_price
shortTpHit = strategy.position_size < 0 and not na(tp_price) and low  <= tp_price
if sendTPAlert and (longTpHit or shortTpHit) and barstate.isconfirmed
    alert("TAKE PROFIT " + syminfo.ticker, alert.freq_once_per_bar_close)