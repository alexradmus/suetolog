import fetch from 'node-fetch';

const BYBIT_API_URL = 'https://api.bybit.com';
const MAX_LIMIT = 1000;
const SUPPORTED_INTERVALS = new Set(['1', '3', '5', '15', '60', '240', '1440']);

const apiIntervalMap = {
  '1': '1',
  '3': '3',
  '5': '5',
  '15': '15',
  '60': '60',
  '240': '240',
  '1440': 'D',
};

const intervalMsMap = {
  '1': 60_000,
  '3': 180_000,
  '5': 300_000,
  '15': 900_000,
  '60': 3_600_000,
  '240': 14_400_000,
  '1440': 86_400_000,
};

export function isIntervalSupported(interval) {
  return SUPPORTED_INTERVALS.has(String(interval));
}

function buildKlineUrl({ symbol, interval, start, end, limit }) {
  const url = new URL('/v5/market/kline', BYBIT_API_URL);
  url.searchParams.set('category', 'linear');
  url.searchParams.set('symbol', symbol);
  const apiInterval = apiIntervalMap[String(interval)] ?? String(interval);
  url.searchParams.set('interval', apiInterval);
  url.searchParams.set('start', String(start));
  url.searchParams.set('end', String(end));
  url.searchParams.set('limit', String(limit));
  return url;
}

function parseCandle(row) {
  const [openTime, open, high, low, close, volume] = row;
  const ts = Number(openTime);
  return {
    ts,
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
  };
}

function validateCandle(candle) {
  const { low, high, open, close } = candle;
  const minOc = Math.min(open, close);
  const maxOc = Math.max(open, close);
  if (!(low <= minOc && maxOc <= high)) {
    throw new Error('Invalid candle data received from Bybit');
  }
}

export async function fetchBybitCandles({ symbol, interval, start, end }) {
  if (!symbol) {
    throw new Error('Symbol is required');
  }
  if (!isIntervalSupported(interval)) {
    throw new Error('Unsupported interval');
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error('Invalid start/end range');
  }

  const step = intervalMsMap[String(interval)];
  const align = (ts) => Math.floor(ts / step) * step;
  const startAligned = align(start);
  let endAligned = align(end);
  if (endAligned <= startAligned) {
    endAligned = startAligned + step;
  }

  const candlesMap = new Map();
  let cursor = startAligned;

  while (cursor <= endAligned) {
    const requestEnd = Math.min(cursor + step * (MAX_LIMIT - 1), endAligned);
    const url = buildKlineUrl({
      symbol,
      interval,
      start: cursor,
      end: requestEnd,
      limit: MAX_LIMIT,
    });

    const response = await fetch(url.href ?? url.toString());
    if (!response.ok) {
      throw new Error(`Bybit request failed with status ${response.status}`);
    }
    const payload = await response.json();
    if (payload.retCode !== 0) {
      const message = payload.retMsg || 'Unknown Bybit error';
      throw new Error(`Bybit error: ${message}`);
    }

    const list = payload.result?.list;
    if (!Array.isArray(list) || list.length === 0) {
      break;
    }

    for (const row of list) {
      const candle = parseCandle(row);
      if (candle.ts < startAligned || candle.ts > endAligned) {
        continue;
      }
      validateCandle(candle);
      candlesMap.set(candle.ts, candle);
    }

    const timestamps = list.map((row) => Number(row[0]));
    const maxTs = Math.max(...timestamps);
    const nextCursor = maxTs + step;
    if (nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
  }

  const candles = Array.from(candlesMap.values())
    .sort((a, b) => a.ts - b.ts)
    .filter((candle) => candle.ts >= startAligned && candle.ts <= endAligned);

  return candles;
}

export function getIntervalMs(interval) {
  return intervalMsMap[String(interval)] ?? null;
}
