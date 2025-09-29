import { getIntervalMs } from './bybitClient.js';

function simpleMovingAverage(values, length) {
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= length) {
      sum -= values[i - length];
    }
    if (i >= length - 1) {
      result[i] = sum / length;
    }
  }
  return result;
}

function toBpsMultiplier(bps) {
  return Number(bps) / 10_000;
}

function computeBarVol(candle) {
  return ((candle.high - candle.low) / candle.close) * 100;
}

function applySlippage(price, side, slippageBps) {
  const slip = toBpsMultiplier(slippageBps);
  if (side === 'buy') {
    return price * (1 + slip);
  }
  if (side === 'sell') {
    return price * (1 - slip);
  }
  return price;
}

function calcTpPrice({ side, base, vol, params }) {
  if (side === 'long') {
    if (params.tp_pct > 0) {
      return base * (1 + params.tp_pct / 100);
    }
    const volComponent = vol * (1 + params.multiplicator_long);
    return base + (base * volComponent * params.profit_multiplicator_long) / 100;
  }
  if (side === 'short') {
    if (params.tp_pct > 0) {
      return base * (1 - params.tp_pct / 100);
    }
    const volComponent = vol * (1 + params.multiplicator_short);
    return base - (base * volComponent * params.profit_multiplicator_short) / 100;
  }
  return null;
}

function calcStopPrice({ side, base, params }) {
  if (side === 'long' && params.sl_pct > 0) {
    return base * (1 - params.sl_pct / 100);
  }
  if (side === 'short' && params.sl_pct > 0) {
    return base * (1 + params.sl_pct / 100);
  }
  return null;
}

function formatTrade({
  side,
  entryTs,
  exitTs,
  entryPrice,
  exitPrice,
  qty,
  grossPnl,
  fees,
  netPnl,
  equityBefore,
  equityAfter,
  reason,
}) {
  return {
    side,
    entry_ts: entryTs,
    exit_ts: exitTs,
    entry_price: entryPrice,
    exit_price: exitPrice,
    qty,
    gross_pnl: grossPnl,
    fees,
    net_pnl: netPnl,
    equity_before: equityBefore,
    equity_after: equityAfter,
    return_pct: equityBefore > 0 ? (netPnl / equityBefore) * 100 : 0,
    exit_reason: reason,
  };
}

export function runBacktest(candles, rawParams) {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error('No candles to backtest');
  }

  const params = {
    length: Number(rawParams.length ?? 48),
    long: rawParams.long !== false,
    short: rawParams.short !== false,
    multiplicator_long: Number(rawParams.multiplicator_long ?? 1.0),
    profit_multiplicator_long: Number(rawParams.profit_multiplicator_long ?? 1.3),
    multiplicator_short: Number(rawParams.multiplicator_short ?? 2.5),
    profit_multiplicator_short: Number(rawParams.profit_multiplicator_short ?? 0.8),
    initial_capital: Number(rawParams.initial_capital ?? 10_000),
    qty_pct: Number(rawParams.qty_pct ?? 1.0),
    fees_bps: Number(rawParams.fees_bps ?? 7.5),
    slippage_bps: Number(rawParams.slippage_bps ?? 1.0),
    tp_pct: Number(rawParams.tp_pct ?? 0),
    sl_pct: Number(rawParams.sl_pct ?? 0),
    max_hold_bars: Number(rawParams.max_hold_bars ?? 0),
  };

  params.tp_pct = Number.isFinite(params.tp_pct) ? Math.max(0, params.tp_pct) : 0;
  params.sl_pct = Number.isFinite(params.sl_pct) ? Math.max(0, params.sl_pct) : 0;
  params.max_hold_bars = Number.isFinite(params.max_hold_bars)
    ? Math.max(0, Math.floor(params.max_hold_bars))
    : 0;

  if (!Number.isInteger(params.length) || params.length <= 0) {
    throw new Error('Invalid length parameter');
  }
  if (params.initial_capital <= 0) {
    throw new Error('Initial capital must be positive');
  }
  if (params.qty_pct <= 0) {
    throw new Error('qty_pct must be positive');
  }

  const barVols = candles.map(computeBarVol);
  const smaVol = simpleMovingAverage(barVols, params.length);
  const feeRate = toBpsMultiplier(params.fees_bps);

  let equity = params.initial_capital;
  let peakEquity = equity;
  let troughEquity = equity;
  const trades = [];

  let position = null;
  const signals = [];

  const intervalMs = getIntervalMs(rawParams.interval);
  const markers = { entries: [], exits: [] };

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const vol = smaVol[i];
    const barVol = barVols[i];

    if (position && i >= position.tpActiveIndex) {
      let exitReason = null;
      let rawExitPrice = null;

      if (position.stopLoss != null) {
        const hitSl =
          position.side === 'long'
            ? candle.low <= position.stopLoss
            : candle.high >= position.stopLoss;
        if (hitSl) {
          exitReason = 'stop';
          rawExitPrice = position.stopLoss;
        }
      }

      if (!exitReason && position.takeProfit != null) {
        const hitTp =
          position.side === 'long'
            ? candle.high >= position.takeProfit
            : candle.low <= position.takeProfit;
        if (hitTp) {
          exitReason = 'tp';
          rawExitPrice = position.takeProfit;
        }
      }

      if (!exitReason && params.max_hold_bars > 0) {
        const barsHeld = i - position.entryIndex;
        if (barsHeld >= params.max_hold_bars) {
          exitReason = 'timeout';
          rawExitPrice = candle.close;
        }
      }

      if (exitReason) {
        const exitSide = position.side === 'long' ? 'sell' : 'buy';
        const exitPrice = applySlippage(rawExitPrice, exitSide, params.slippage_bps);
        const exitFee = exitPrice * position.qtyBase * feeRate;
        const grossPnl =
          position.side === 'long'
            ? (exitPrice - position.entryPrice) * position.qtyBase
            : (position.entryPrice - exitPrice) * position.qtyBase;
        const netChange = grossPnl - exitFee;
        const netPnl = netChange - position.entryFee;
        const equityBefore = equity;
        equity += netChange;
        peakEquity = Math.max(peakEquity, equity);
        troughEquity = Math.min(troughEquity, equity);
        const totalFees = position.entryFee + exitFee;

        trades.push(
          formatTrade({
            side: position.side,
            entryTs: position.entryTs,
            exitTs: candle.ts,
            entryPrice: position.entryPrice,
            exitPrice,
            qty: position.qtyBase,
            grossPnl,
            fees: totalFees,
            netPnl,
            equityBefore,
            equityAfter: equity,
            reason: exitReason,
          }),
        );
        markers.exits.push({
          ts: candle.ts,
          price: exitPrice,
          side: position.side,
          reason: exitReason,
        });
        position = null;
      }
    }

    if (!vol || vol <= 0 || position) {
      continue;
    }

    const red = candle.close < candle.open * 0.99;
    const green = candle.close > candle.open * 1.01;

    const goLong =
      params.long && red && barVol > vol * (1 + params.multiplicator_long);
    const goShort =
      params.short && green && barVol > vol * (1 + params.multiplicator_short);

    if (!goLong && !goShort) {
      continue;
    }

    const side = goLong ? 'long' : 'short';
    signals.push({ ts: candle.ts, type: side });
    const entrySide = side === 'long' ? 'buy' : 'sell';
    const entryPrice = applySlippage(candle.close, entrySide, params.slippage_bps);
    const notional = (equity * params.qty_pct) / 100;
    if (notional <= 0) {
      continue;
    }
    const qtyBase = notional / entryPrice;
    const entryFee = entryPrice * qtyBase * feeRate;
    equity -= entryFee;
    troughEquity = Math.min(troughEquity, equity);

    const basePrice = candle.close;
    const takeProfit = calcTpPrice({ side, base: basePrice, vol, params });
    const stopLoss = calcStopPrice({ side, base: basePrice, params });

    position = {
      side,
      entryPrice,
      entryTs: candle.ts,
      qtyBase,
      entryFee,
      takeProfit,
      tpActiveIndex: i + 1,
      stopLoss,
      entryIndex: i,
    };

    markers.entries.push({ ts: candle.ts, price: entryPrice, side });
  }

  const metrics = {
    initial: params.initial_capital,
    final: equity,
    return_pct: ((equity - params.initial_capital) / params.initial_capital) * 100,
    trades: trades.length,
    max_drawdown_pct:
      peakEquity > 0 ? ((peakEquity - troughEquity) / peakEquity) * 100 : 0,
  };

  return {
    params,
    candles,
    trades,
    metrics,
    markers,
    open_position: position,
    interval_ms: intervalMs,
    signals,
    stop_loss_pct: params.sl_pct,
    take_profit_pct: params.tp_pct,
    max_hold_bars: params.max_hold_bars,
  };
}
