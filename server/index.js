import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBybitCandles, getIntervalMs, isIntervalSupported } from '../src/core/bybitClient.js';
import { runBacktest } from '../src/core/backtester.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const MAX_1M_DAYS = 90;

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return fallback;
}

function parseNumber(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function deriveRange(query, interval) {
  const now = Date.now();
  const end = query.end ? Number(query.end) : now;
  if (!Number.isFinite(end)) {
    throw new Error('Invalid end timestamp');
  }

  if (query.start) {
    const start = Number(query.start);
    if (!Number.isFinite(start)) {
      throw new Error('Invalid start timestamp');
    }
    return { start, end };
  }

  const days = parseNumber(query.days, 7);
  const intervalMs = getIntervalMs(interval);
  if (!intervalMs) {
    throw new Error('Unsupported interval');
  }
  if (interval === '1' && days > MAX_1M_DAYS) {
    throw new Error(`1m interval limited to ${MAX_1M_DAYS} days`);
  }

  const start = end - days * 24 * 60 * 60 * 1000;
  return { start, end };
}

function normalizeParams(query) {
  return {
    length: parseNumber(query.length, 48),
    long: parseBoolean(query.long, true),
    short: parseBoolean(query.short, true),
    multiplicator_long: parseNumber(query.multiplicator_long, 1.0),
    profit_multiplicator_long: parseNumber(query.profit_multiplicator_long, 1.3),
    multiplicator_short: parseNumber(query.multiplicator_short, 2.5),
    profit_multiplicator_short: parseNumber(query.profit_multiplicator_short, 0.8),
    initial_capital: parseNumber(query.initial_capital, 10_000),
    qty_pct: parseNumber(query.qty_pct, 1.0),
    fees_bps: parseNumber(query.fees_bps, 7.5),
    slippage_bps: parseNumber(query.slippage_bps, 1.0),
    interval: query.interval,
    tp_pct: parseNumber(query.tp_pct, 0),
    sl_pct: parseNumber(query.sl_pct, 0),
    max_hold_bars: parseNumber(query.max_hold_bars, 0),
  };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/backtest', async (req, res, next) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const interval = String(req.query.interval || '5');

    if (!isIntervalSupported(interval)) {
      return res.status(400).json({ error: 'Unsupported interval' });
    }

    const { start, end } = deriveRange(req.query, interval);

    if (start >= end) {
      return res.status(400).json({ error: 'Start must be earlier than end' });
    }

    const candles = await fetchBybitCandles({ symbol, interval, start, end });

    if (candles.length === 0) {
      return res.status(400).json({ error: 'No candles found for requested range' });
    }

    const params = normalizeParams({ ...req.query, interval });

    if (candles.length < params.length) {
      return res.status(400).json({ error: 'Not enough candles for selected length' });
    }

    const result = runBacktest(candles, params);

    res.json({
      symbol,
      interval,
      start,
      end,
      result,
    });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
