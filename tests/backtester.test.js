import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runBacktest } from '../src/core/backtester.js';

const baseTs = Date.UTC(2024, 0, 1);

function candle(offsetMinutes, { open, high, low, close }) {
  return {
    ts: baseTs + offsetMinutes * 60 * 1000,
    open,
    high,
    low,
    close,
    volume: 10_000,
  };
}

function almostEqual(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} ≈ ${expected}`);
}

describe('runBacktest', () => {
  it('executes a long trade and records metrics', () => {
    const candles = [
      candle(0, { open: 100, high: 110, low: 90, close: 105 }),
      candle(5, { open: 105, high: 115, low: 95, close: 100 }),
      candle(10, { open: 100, high: 130, low: 99, close: 120 }),
      candle(15, { open: 120, high: 125, low: 115, close: 122 }),
    ];

    const params = {
      length: 2,
      long: true,
      short: false,
      multiplicator_long: 0,
      profit_multiplicator_long: 1,
      multiplicator_short: 2.5,
      profit_multiplicator_short: 0.8,
      initial_capital: 1_000,
      qty_pct: 10,
      fees_bps: 0,
      slippage_bps: 0,
      interval: '5',
    };

    const result = runBacktest(candles, params);

    assert.equal(result.trades.length, 1, 'expected one trade');
    const [trade] = result.trades;
    assert.equal(trade.side, 'long');
    assert.equal(trade.entry_price, 100);
    almostEqual(trade.exit_price, 119.52380952380952);
    almostEqual(trade.net_pnl, 19.52380952380952);
    almostEqual(result.metrics.final, 1_019.5238095238096);
    assert.equal(result.signals.length, 1);
    assert.equal(result.signals[0].type, 'long');
    assert.equal(result.metrics.trades, 1);
    assert.equal(trade.exit_reason, 'tp');
  });

  it('exits on configured stop loss', () => {
    const candles = [
      candle(0, { open: 100, high: 101, low: 99, close: 100 }),
      candle(5, { open: 105, high: 106, low: 90, close: 94 }),
      candle(10, { open: 94, high: 95, low: 80, close: 90 }),
    ];

    const params = {
      length: 2,
      long: true,
      short: false,
      multiplicator_long: 0,
      profit_multiplicator_long: 1,
      initial_capital: 1_000,
      qty_pct: 10,
      fees_bps: 0,
      slippage_bps: 0,
      interval: '60',
      tp_pct: 100,
      sl_pct: 5,
    };

    const result = runBacktest(candles, params);
    assert.equal(result.trades.length, 1);
    const trade = result.trades[0];
    assert.equal(trade.exit_reason, 'stop');
    almostEqual(trade.exit_price, 89.3);
    almostEqual(trade.net_pnl, -5);
  });

  it('enforces max hold bars timeout', () => {
    const candles = [
      candle(0, { open: 100, high: 101, low: 99, close: 100 }),
      candle(5, { open: 105, high: 110, low: 90, close: 95 }),
      candle(10, { open: 95, high: 98, low: 94, close: 96 }),
      candle(15, { open: 96, high: 97, low: 95, close: 95 }),
      candle(20, { open: 95, high: 96, low: 94, close: 94 }),
    ];

    const params = {
      length: 2,
      long: true,
      short: false,
      multiplicator_long: 0,
      profit_multiplicator_long: 1,
      initial_capital: 1_000,
      qty_pct: 10,
      fees_bps: 0,
      slippage_bps: 0,
      interval: '60',
      tp_pct: 100,
      max_hold_bars: 2,
    };

    const result = runBacktest(candles, params);
    assert.equal(result.trades.length, 1);
    const trade = result.trades[0];
    assert.equal(trade.exit_reason, 'timeout');
    almostEqual(trade.exit_price, 95);
  });
});
