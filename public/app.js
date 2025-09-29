const form = document.getElementById('control-form');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const metricsEl = document.getElementById('metrics');
const tradesTableBody = document.querySelector('#trades-table tbody');
const chartContainer = document.getElementById('chart');
const intervalSelect = document.getElementById('interval');
const timeframeSwitch = document.getElementById('timeframe-switch');
const candleInfoEl = document.getElementById('candle-info');

let chart;
let candleSeries;
let volumeSeries;
let candleTimeMap = new Map();
let initialLoadTriggered = false;
let customRange = null;
let customRangeLocked = false;

function initChart() {
  if (chart) {
    return;
  }
  chart = LightweightCharts.createChart(chartContainer, {
    layout: {
      background: { color: 'transparent' },
      textColor: '#dce1ff',
    },
    grid: {
      vertLines: { color: 'rgba(70, 99, 143, 0.2)' },
      horzLines: { color: 'rgba(70, 99, 143, 0.2)' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
    timeScale: {
      timeVisible: true,
      secondsVisible: false,
    },
  });
  candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderUpColor: '#26a69a',
    borderDownColor: '#ef5350',
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
  });
  volumeSeries = chart.addHistogramSeries({
    priceScaleId: 'volume',
    priceFormat: { type: 'volume' },
    color: '#4b8bff',
  });
  chart.priceScale('volume').applyOptions({
    scaleMargins: {
      top: 0.8,
      bottom: 0,
    },
  });

  chart.subscribeCrosshairMove((param) => {
    if (!candleInfoEl) {
      return;
    }
    const timeValue = param?.time;
    if (!timeValue) {
      candleInfoEl.textContent = '—';
      return;
    }
    const timestamp =
      typeof timeValue === 'object' && timeValue !== null
        ? timeValue.timestamp
        : timeValue;
    const candle = candleTimeMap.get(timestamp);
    if (!candle) {
      candleInfoEl.textContent = '—';
      return;
    }
    const date = new Date(candle.ts).toLocaleString();
    const priceDigits = candle.close >= 100 ? 2 : 4;
    const info = `🕒 ${date}  O:${formatNumber(candle.open, priceDigits)}  H:${formatNumber(
      candle.high,
      priceDigits,
    )}  L:${formatNumber(candle.low, priceDigits)}  C:${formatNumber(candle.close, priceDigits)}  V:${formatNumber(
      candle.volume,
      0,
    )}`;
    candleInfoEl.textContent = info;
  });
}

function formatNumber(value, digits = 2) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function resetTable() {
  tradesTableBody.innerHTML = '';
}

function updateMetrics(metrics) {
  metricsEl.innerHTML = '';
  const entries = [
    { label: 'Initial (USDT)', value: formatNumber(metrics.initial, 2) },
    { label: 'Final (USDT)', value: formatNumber(metrics.final, 2) },
    { label: 'Return %', value: formatNumber(metrics.return_pct, 2) },
    { label: 'Trades', value: metrics.trades },
    { label: 'Max Drawdown %', value: formatNumber(metrics.max_drawdown_pct, 2) },
  ];

  entries.forEach(({ label, value }) => {
    const item = document.createElement('div');
    item.className = 'metric-item';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.textContent = value;
    item.append(labelEl, valueEl);
    metricsEl.appendChild(item);
  });
}

function updateTrades(trades) {
  resetTable();
  trades.forEach((trade, idx) => {
    const tr = document.createElement('tr');
    let reasonText = '';
    if (trade.exit_reason === 'tp') {
      reasonText = 'TP';
    } else if (trade.exit_reason === 'stop') {
      reasonText = 'SL';
    } else if (trade.exit_reason === 'timeout') {
      reasonText = 'Timeout';
    }
    const cells = [
      idx + 1,
      trade.side,
      new Date(trade.entry_ts).toLocaleString(),
      new Date(trade.exit_ts).toLocaleString(),
      formatNumber(trade.entry_price, 2),
      formatNumber(trade.exit_price, 2),
      formatNumber(trade.qty, 6),
      formatNumber(trade.net_pnl, 2),
      reasonText,
    ];
    cells.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });
    if (trade.net_pnl > 0) {
      tr.style.color = '#4caf50';
    } else if (trade.net_pnl < 0) {
      tr.style.color = '#ef5350';
    }
    tradesTableBody.appendChild(tr);
  });
}

function prepareMarkers(result) {
  const markers = [];
  (result.markers?.entries || []).forEach((marker) => {
    markers.push({
      time: Math.floor(marker.ts / 1000),
      position: marker.side === 'long' ? 'belowBar' : 'aboveBar',
      color: marker.side === 'long' ? '#26a69a' : '#ef5350',
      shape: marker.side === 'long' ? 'arrowUp' : 'arrowDown',
      text: marker.side === 'long' ? 'L' : 'S',
    });
  });
  (result.markers?.exits || []).forEach((marker) => {
    let color = '#f1c40f';
    let text = 'TP';
    if (marker.reason === 'stop') {
      color = '#ff6b6b';
      text = 'SL';
    } else if (marker.reason === 'timeout') {
      color = '#5c7cfa';
      text = 'TO';
    }
    markers.push({
      time: Math.floor(marker.ts / 1000),
      position: marker.side === 'long' ? 'aboveBar' : 'belowBar',
      color,
      shape: 'circle',
      text,
    });
  });
  return markers.sort((a, b) => a.time - b.time);
}

function updateChart(candles, result) {
  initChart();
  candleTimeMap = new Map();
  const signalMap = new Map();
  (result.signals || []).forEach((signal) => {
    signalMap.set(signal.ts, signal.type);
  });
  const data = candles.map((candle) => ({
    time: Math.floor(candle.ts / 1000),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  }));
  data.forEach((bar, idx) => {
    candleTimeMap.set(bar.time, candles[idx]);
  });
  data.forEach((bar, idx) => {
    const candle = candles[idx];
    const signal = signalMap.get(candle.ts);
    if (signal === 'long') {
      bar.color = '#63e6be';
      bar.borderColor = '#63e6be';
      bar.wickColor = '#63e6be';
    } else if (signal === 'short') {
      bar.color = '#ff8787';
      bar.borderColor = '#ff8787';
      bar.wickColor = '#ff8787';
    }
  });
  candleSeries.setData(data);
  const markers = prepareMarkers(result);
  if (markers.length) {
    candleSeries.setMarkers(markers);
  } else {
    candleSeries.setMarkers([]);
  }
  const volumeData = candles.map((candle) => ({
    time: Math.floor(candle.ts / 1000),
    value: Number(candle.volume),
    color: candle.close >= candle.open ? '#26a69a' : '#ef5350',
  }));
  volumeSeries.setData(volumeData);

  if (candleInfoEl) {
    const last = candles.at(-1);
    if (last) {
      const timestamp = Math.floor(last.ts / 1000);
      const priceDigits = last.close >= 100 ? 2 : 4;
      candleInfoEl.textContent = `🕒 ${new Date(last.ts).toLocaleString()}  O:${formatNumber(
        last.open,
        priceDigits,
      )}  H:${formatNumber(last.high, priceDigits)}  L:${formatNumber(last.low, priceDigits)}  C:${formatNumber(
        last.close,
        priceDigits,
      )}  V:${formatNumber(last.volume, 0)}`;
      candleTimeMap.set(timestamp, last);
    } else {
      candleInfoEl.textContent = '—';
    }
  }
}

function buildQueryParams(formData) {
  const params = new URLSearchParams();
  const symbol = formData.get('symbol')?.trim().toUpperCase() || 'BTCUSDT';
  const interval = formData.get('interval') || '60';
  const days = Number(formData.get('days')) || 7;
  const msInDay = 24 * 60 * 60 * 1000;
  let start;
  let end;
  let effectiveDays = days;
  const useCustomRange = customRangeLocked && customRange;
  if (useCustomRange) {
    start = Number(customRange.start);
    end = Number(customRange.end);
    effectiveDays = Math.max(1, Math.round((end - start) / msInDay));
  } else {
    end = Date.now();
    start = end - days * msInDay;
    customRange = { start: Math.floor(start), end: Math.floor(end) };
  }

  params.set('symbol', symbol);
  params.set('interval', interval);
  params.set('start', Math.floor(start));
  params.set('end', Math.floor(end));
  params.set('days', String(effectiveDays));
  params.set('length', formData.get('length') || '48');
  params.set('qty_pct', formData.get('qty_pct') || '1');
  const feesPercent = Number(formData.get('fees_percent') || 0);
  const slippagePercent = Number(formData.get('slippage_percent') || 0);
  const feesBps = Number.isFinite(feesPercent) ? (feesPercent * 100).toString() : '0';
  const slippageBps = Number.isFinite(slippagePercent)
    ? (slippagePercent * 100).toString()
    : '0';
  params.set('fees_bps', feesBps);
  params.set('slippage_bps', slippageBps);
  params.set('fees_percent', formData.get('fees_percent') || '0');
  params.set('slippage_percent', formData.get('slippage_percent') || '0');
  params.set('multiplicator_long', formData.get('multiplicator_long') || '1');
  params.set('profit_multiplicator_long', formData.get('profit_multiplicator_long') || '1.3');
  params.set('multiplicator_short', formData.get('multiplicator_short') || '2.5');
  params.set('profit_multiplicator_short', formData.get('profit_multiplicator_short') || '0.8');
  params.set('tp_pct', formData.get('tp_pct') || '0');
  params.set('sl_pct', formData.get('sl_pct') || '0');
  params.set('max_hold_bars', formData.get('max_hold_bars') || '0');
  params.set('long', formData.get('long') ? 'true' : 'false');
  params.set('short', formData.get('short') ? 'true' : 'false');

  if (!useCustomRange) {
    customRangeLocked = false;
  }

  return params;
}

function updateBrowserUrl(params) {
  const url = new URL(window.location.href);
  url.search = params.toString();
  window.history.replaceState({}, '', url);
}

async function handleSubmit(event) {
  event.preventDefault();
  errorEl.textContent = '';
  statusEl.textContent = 'Запрос...';
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const formData = new FormData(form);
    const params = buildQueryParams(formData);
    const response = await fetch(`/backtest?${params.toString()}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Ошибка запроса');
    }

    const payload = await response.json();
    const { result } = payload;
    if (!result) {
      throw new Error('Пустой ответ сервера');
    }

    updateChart(result.candles, result);
    updateMetrics(result.metrics);
    updateTrades(result.trades);
    statusEl.textContent = `Готово: ${payload.symbol} ${payload.interval}`;
    setActiveTimeframe(payload.interval);
    updateBrowserUrl(params);
  } catch (err) {
    errorEl.textContent = err.message;
    statusEl.textContent = 'Ошибка';
    resetTable();
    metricsEl.innerHTML = '';
    if (candleSeries) {
      candleSeries.setData([]);
      candleSeries.setMarkers([]);
    }
    if (volumeSeries) {
      volumeSeries.setData([]);
    }
  } finally {
    submitButton.disabled = false;
  }
}

form.addEventListener('submit', handleSubmit);

window.addEventListener('load', () => {
  initChart();
  applyQueryToForm();
  if (intervalSelect) {
    setActiveTimeframe(intervalSelect.value);
  }
  if (!initialLoadTriggered) {
    initialLoadTriggered = true;
    form.requestSubmit();
  }
  // reset custom range if user edits days manually after load
  const daysInput = form.elements.days;
  if (daysInput) {
    daysInput.addEventListener('input', () => {
      customRange = null;
      customRangeLocked = false;
    });
  }
});

function setActiveTimeframe(interval) {
  if (!timeframeSwitch) {
    return;
  }
  const buttons = timeframeSwitch.querySelectorAll('button');
  buttons.forEach((btn) => {
    if (btn.dataset.interval === String(interval)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  if (intervalSelect) {
    intervalSelect.value = String(interval);
  }
}

if (timeframeSwitch) {
  timeframeSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-interval]');
    if (!button) {
      return;
    }
    const nextInterval = button.dataset.interval;
    if (intervalSelect.value !== nextInterval) {
      customRange = null;
      customRangeLocked = false;
      setActiveTimeframe(nextInterval);
      form.requestSubmit();
    }
  });
}

function applyQueryToForm() {
  const searchParams = new URLSearchParams(window.location.search);
  if (!searchParams.size) {
    return;
  }

  const setIfDefined = (name, transform = (v) => v) => {
    const value = searchParams.get(name);
    if (value !== null && form.elements[name]) {
      form.elements[name].value = transform(value);
    }
  };

  setIfDefined('symbol', (v) => v.toUpperCase());
  setIfDefined('days');
  setIfDefined('length');
  setIfDefined('qty_pct');
  setIfDefined('multiplicator_long');
  setIfDefined('profit_multiplicator_long');
  setIfDefined('multiplicator_short');
  setIfDefined('profit_multiplicator_short');
  setIfDefined('tp_pct');
  setIfDefined('sl_pct');
  setIfDefined('max_hold_bars');

  const interval = searchParams.get('interval');
  if (interval && intervalSelect) {
    intervalSelect.value = interval;
  }

  if (searchParams.has('start') && searchParams.has('end')) {
    customRange = {
      start: Number(searchParams.get('start')),
      end: Number(searchParams.get('end')),
    };
    customRangeLocked = true;
  }

  const feesPercent = searchParams.has('fees_percent')
    ? Number(searchParams.get('fees_percent'))
    : searchParams.has('fees_bps')
    ? Number(searchParams.get('fees_bps')) / 100
    : null;
  if (feesPercent !== null && form.elements.fees_percent) {
    form.elements.fees_percent.value = feesPercent.toString();
  }

  const slippagePercent = searchParams.has('slippage_percent')
    ? Number(searchParams.get('slippage_percent'))
    : searchParams.has('slippage_bps')
    ? Number(searchParams.get('slippage_bps')) / 100
    : null;
  if (slippagePercent !== null && form.elements.slippage_percent) {
    form.elements.slippage_percent.value = slippagePercent.toString();
  }

  if (form.elements.long) {
    const longValue = searchParams.get('long');
    form.elements.long.checked = longValue !== 'false';
  }
  if (form.elements.short) {
    const shortValue = searchParams.get('short');
    form.elements.short.checked = shortValue !== 'false';
  }
}

// hidden interval input is controlled via timeframe buttons only
