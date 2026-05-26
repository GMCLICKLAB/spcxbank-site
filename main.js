/* ============================================================
   $SPCXBANK · LANDING PAGE LOGIC
   All values mocked. Wire to RPC / Jupiter / Helius before launch.
   ============================================================ */

// ---------- TICKER --------------------------------------------------------
// Project-specific cells show PRE-LAUNCH until token is live.
// Market cells (NDX / QQQx / SOL / BTC) get live data from public APIs.
const TICKER_ITEMS = [
  { label: '$SPCXBANK',     key: 'spcxbank',    value: 'PRE-LAUNCH' },
  { label: '$SPCX · HL',    key: 'spcx',        value: '—' },
  { label: 'NDX-100',       key: 'ndx',         value: '—' },
  { label: 'QQQx',          key: 'qqqx',        value: '—' },
  { label: 'SOL',           key: 'sol',         value: '—' },
  { label: 'BTC',           key: 'btc',         value: '—' },
  { label: 'HOLDERS',       key: 'holders',     value: 'PRE-LAUNCH' },
  { label: 'TOTAL BOUGHT',  key: 'bought',      value: 'PRE-LAUNCH' },
  { label: 'DISTRIBUTED',   key: 'distributed', value: 'PRE-LAUNCH' },
];
function buildTicker() {
  const html = TICKER_ITEMS.map(i =>
    `<span class="ticker-cell" data-key="${i.key}">
      <span class="label">${i.label}</span>
      <span class="value">${i.value}</span>
      <span class="delta"></span>
    </span>`
  ).join('');
  const track = document.getElementById('ticker-track');
  if (track) track.innerHTML = html + html;
}
buildTicker();

function updateTickerCell(key, value, deltaPct) {
  document.querySelectorAll(`[data-key="${key}"]`).forEach(cell => {
    const v = cell.querySelector('.value');
    const d = cell.querySelector('.delta');
    if (v) v.textContent = value;
    if (d) {
      if (deltaPct !== undefined && deltaPct !== null && !isNaN(deltaPct)) {
        d.className = 'delta ' + (deltaPct >= 0 ? 'up' : 'down');
        d.textContent = Math.abs(deltaPct).toFixed(2) + '%';
      } else {
        d.className = 'delta';
        d.textContent = '';
      }
    }
  });
}
function fmtPrice(p) {
  if (p >= 1000)  return '$ ' + Math.round(p).toLocaleString();
  if (p >= 1)     return '$ ' + p.toFixed(2);
  return '$ ' + p.toFixed(4);
}

// ---- Binance: BTC, SOL ----
async function fetchBinance() {
  try {
    const symbols = encodeURIComponent(JSON.stringify(['BTCUSDT', 'SOLUSDT']));
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`);
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(it => {
      const price = parseFloat(it.lastPrice);
      const change = parseFloat(it.priceChangePercent);
      if (it.symbol === 'BTCUSDT') updateTickerCell('btc', fmtPrice(price), change);
      if (it.symbol === 'SOLUSDT') updateTickerCell('sol', fmtPrice(price), change);
    });
  } catch (e) { console.warn('binance fetch failed', e); }
}

// ---- QQQx live price (DexScreener → Jupiter → nothing) ----
function setQqqxStat(priceStr) {
  const el = document.getElementById('qqqx-price-stat');
  if (el) el.textContent = priceStr;
}
async function fetchQQQx() {
  const mint = 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ';

  // 1. DexScreener — aggregates all Solana DEX pools, free, CORS-friendly.
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.pairs?.[0]?.priceUsd);
      const change = parseFloat(data?.pairs?.[0]?.priceChange?.h24);
      if (price > 0) {
        const fmt = fmtPrice(price);
        updateTickerCell('qqqx', fmt, isNaN(change) ? null : change);
        setQqqxStat(fmt);
        return;
      }
    }
  } catch (_) {}

  // 2. Jupiter — works only if QQQx has an AMM route.
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.data?.[mint]?.price);
      if (price > 0) {
        const fmt = fmtPrice(price);
        updateTickerCell('qqqx', fmt);
        setQqqxStat(fmt);
        return;
      }
    }
  } catch (_) {}

  console.warn('QQQx: no on-chain price source returned data (possibly no AMM liquidity)');
}

// ---- Yahoo Finance: NDX (via direct then allorigins proxy) ----
async function fetchNDX() {
  const yUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX';
  const parse = d => {
    const r = d.chart.result[0];
    const price = r.meta.regularMarketPrice;
    const prev  = r.meta.chartPreviousClose;
    return { price, change: ((price - prev) / prev) * 100 };
  };
  try {
    const res = await fetch(yUrl);
    if (res.ok) {
      const { price, change } = parse(await res.json());
      updateTickerCell('ndx', Math.round(price).toLocaleString(), change);
      return;
    }
  } catch (_) {}
  try {
    const proxy = 'https://api.allorigins.win/get?url=' + encodeURIComponent(yUrl);
    const wrap  = await (await fetch(proxy)).json();
    const { price, change } = parse(JSON.parse(wrap.contents));
    updateTickerCell('ndx', Math.round(price).toLocaleString(), change);
  } catch (e) { console.warn('ndx fetch failed', e); }
}

// ---- Hyperliquid HIP-3 builder market: xyz:SPCX (pre-IPO SpaceX perp) ----
async function fetchSPCX() {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // HIP-3 markets are namespaced under their deployer ("dex"). SPCX
      // lives on the "xyz" dex per https://app.hyperliquid.xyz/trade/xyz:SPCX
      body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const meta = data[0], ctxs = data[1];
    if (!meta || !Array.isArray(meta.universe) || !Array.isArray(ctxs)) return;
    const idx = meta.universe.findIndex(u => u && u.name === 'xyz:SPCX');
    if (idx < 0) {
      updateTickerCell('spcx', 'NOT LISTED');
      return;
    }
    const ctx = ctxs[idx];
    const price = parseFloat(ctx.markPx || ctx.midPx);
    const prev  = parseFloat(ctx.prevDayPx);
    if (!isFinite(price)) return;
    const change = prev > 0 ? ((price - prev) / prev) * 100 : null;
    updateTickerCell('spcx', fmtPrice(price), change);
  } catch (e) {
    console.warn('Hyperliquid SPCX fetch failed', e);
  }
}

function refreshTickerData() {
  fetchBinance();
  fetchQQQx();
  fetchNDX();
  fetchSPCX();
}
refreshTickerData();
setInterval(refreshTickerData, 30000);

// ---------- COUNTDOWN -----------------------------------------------------
const NDX_INCLUSION = new Date('2026-07-06T14:30:00-04:00');
function pad(n){ return String(Math.max(0,n)).padStart(2,'0'); }
function tickCountdown() {
  const now = new Date();
  let s = Math.floor((NDX_INCLUSION - now) / 1000);
  if (s < 0) s = 0;
  const d  = Math.floor(s / 86400);
  const h  = Math.floor((s % 86400) / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const el = document.getElementById('hero-cd');
  if (el) el.textContent = `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(ss)}s"`;
  const stat = document.getElementById('cd-stat');
  if (stat) stat.textContent = `${d} d`;
}
tickCountdown();
setInterval(tickCountdown, 1000);

function tickNextSweep() {
  const el = document.getElementById('next-sweep');
  if (!el) return;
  // Pre-launch: SPCXBANK_MINT in solana.js is null. Show static "5m" until
  // the mint is set, then the live 5-minute boundary countdown kicks in.
  if (typeof SPCXBANK_MINT === 'undefined' || SPCXBANK_MINT === null) {
    el.textContent = '5m 00s';
    return;
  }
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(Math.floor(now.getUTCMinutes() / 5) * 5 + 5, 0, 0);
  let diff = Math.floor((next - now) / 1000);
  if (diff < 0) diff += 300;
  const mm = Math.floor(diff / 60);
  const ss = diff % 60;
  el.textContent = `${pad(mm)}m ${pad(ss)}s`;
}
tickNextSweep();
setInterval(tickNextSweep, 1000);

// ---------- COUNTER ANIMATIONS -------------------------------------------
function animateCounters() {
  document.querySelectorAll('[data-counter]').forEach(el => {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const target = parseInt(el.dataset.counter, 10);
    let cur = 0;
    const step = Math.max(1, Math.floor(target / 60));
    const t = setInterval(() => {
      cur += step;
      if (cur >= target) { cur = target; clearInterval(t); }
      el.textContent = cur.toLocaleString();
    }, 25);
  });
}
const ioCount = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { animateCounters(); ioCount.disconnect(); } });
}, { threshold: 0.2 });
const treasury = document.getElementById('treasury');
if (treasury) ioCount.observe(treasury);

// ---------- helpers (used by wallet connect fallback) -------------------
function randomAddr() {
  const chars = '0123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 44; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ---------- PROTOCOL CHARTS · 4-TAB SECTION ------------------------------
// Moved to charts.js (shared with app.html). Below is the dead block being
// kept as a comment until the next clean-up pass.
/*
function drawPreLaunchChart(canvas, opts) {
  if (!canvas) return;
  const parent = canvas.parentElement;
  const dpr  = window.devicePixelRatio || 1;
  const cssW = (parent ? parent.clientWidth  - 24 : 1000);
  const cssH = (parent ? parent.clientHeight - 24 :  340);
  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width  = '100%';
  canvas.style.height = '100%';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const padL = 56, padR = 24, padT = 18, padB = 32;
  const chartW = cssW - padL - padR;
  const chartH = cssH - padT - padB;

  ctx.clearRect(0, 0, cssW, cssH);

  // dashed grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  const yLines = [0, 0.25, 0.5, 0.75, 1.0].map(t => padT + t * chartH);
  for (const y of yLines) {
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(cssW - padR, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // axes label placeholders
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.font = '10px "Noto Sans Mono", "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const y of yLines) ctx.fillText('—', padL - 10, y);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xTicks = [padL, padL + chartW * 0.25, padL + chartW * 0.5, padL + chartW * 0.75, cssW - padR];
  for (const x of xTicks) ctx.fillText('—', x, cssH - padB + 10);

  // centre overlay
  const cx = cssW / 2, cy = cssH / 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = 'bold 13px "Noto Sans Mono", "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.placeholder || 'PRE-LAUNCH · AWAITING DATA', cx, cy - 10);

  if (opts.subtext) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.font = '11px "Noto Sans Mono", "JetBrains Mono", monospace';
    ctx.fillText(opts.subtext, cx, cy + 14);
  }
}

// Live-data chart renderer · same visual style as the hero NDX chart.
// Renders area gradient fill + white line + glowing endpoint + crosshair.
function drawLiveChart(canvas, data, opts = {}) {
  if (!canvas || !data || data.length < 2) return;
  const parent = canvas.parentElement;
  const dpr  = window.devicePixelRatio || 1;
  const cssW = (parent ? parent.clientWidth  - 24 : 1000);
  const cssH = (parent ? parent.clientHeight - 24 :  340);
  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width  = '100%';
  canvas.style.height = '100%';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const padL = 60, padR = 20, padT = 18, padB = 34;
  const chartW = cssW - padL - padR;
  const chartH = cssH - padT - padB;

  // Range
  const values = data.map(d => d.value);
  const times  = data.map(d => d.time);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const vPad = (vMax - vMin) * 0.08 || vMax * 0.05;
  const yMin = vMin - vPad;
  const yMax = vMax + vPad;
  const tMin = times[0];
  const tMax = times[times.length - 1];

  const xFor = t => padL + (t - tMin) / (tMax - tMin) * chartW;
  const yFor = v => padT + (1 - (v - yMin) / (yMax - yMin)) * chartH;

  const yFmt = opts.yFmt || (v => v >= 1000 ? (v/1000).toFixed(1) + 'K' : v.toFixed(2));
  const dateFmt = opts.dateFmt || (t => new Date(t * 1000).toISOString().slice(0, 10));

  function render(highlightIdx) {
    ctx.clearRect(0, 0, cssW, cssH);

    // grid (5 horizontal lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const t = i / gridSteps;
      const y = padT + t * chartH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(cssW - padR, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // y axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '10px "Noto Sans Mono", "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= gridSteps; i++) {
      const t = i / gridSteps;
      const v = yMax - t * (yMax - yMin);
      ctx.fillText(yFmt(v), padL - 10, padT + t * chartH);
    }

    // x axis labels (5 ticks across)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
      const f = i / 4;
      const t = tMin + (tMax - tMin) * f;
      ctx.fillText(dateFmt(t), padL + f * chartW, cssH - padB + 10);
    }

    // area fill
    const grad = ctx.createLinearGradient(0, padT, 0, cssH - padB);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.00)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xFor(data[0].time), cssH - padB);
    for (const p of data) ctx.lineTo(xFor(p.time), yFor(p.value));
    ctx.lineTo(xFor(data[data.length - 1].time), cssH - padB);
    ctx.closePath();
    ctx.fill();

    // main line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((p, i) => {
      const x = xFor(p.time), y = yFor(p.value);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Resolve which point to highlight
    const hi = (highlightIdx === undefined || highlightIdx < 0 || highlightIdx >= data.length)
      ? data.length - 1
      : highlightIdx;
    const pt = data[hi];
    const hx = xFor(pt.time);
    const hy = yFor(pt.value);

    // Crosshair (only when user hovers, not default)
    if (highlightIdx !== undefined && highlightIdx >= 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, cssH - padB);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // glowing endpoint dot
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // tooltip
    const tipLabel = `${dateFmt(pt.time)}  ·  ${yFmt(pt.value)}`;
    ctx.font = '10px "Noto Sans Mono", "JetBrains Mono", monospace';
    const tw = ctx.measureText(tipLabel).width + 14;
    const th = 20;
    let tx = hx - tw / 2;
    let ty = hy - 24;
    if (tx < padL) tx = padL;
    if (tx + tw > cssW - padR) tx = cssW - padR - tw;
    if (ty < padT) ty = hy + 12;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tipLabel, tx + 7, ty + th / 2);
  }

  render();

  // interactivity
  function nearestIdx(clientX) {
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    if (localX < padL - 4 || localX > cssW - padR + 4) return -1;
    const t = (localX - padL) / chartW;
    const tGuess = tMin + t * (tMax - tMin);
    let best = 0, bestD = Infinity;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(data[i].time - tGuess);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  canvas.onmousemove = (e) => { const i = nearestIdx(e.clientX); if (i < 0) render(); else render(i); };
  canvas.onmouseleave = () => render();
  canvas.ontouchmove = (e) => {
    if (!e.touches.length) return;
    e.preventDefault();
    const i = nearestIdx(e.touches[0].clientX);
    if (i >= 0) render(i);
  };
  canvas.ontouchend = () => render();
  canvas.style.cursor = 'crosshair';
}

// Fetch QQQx historical price from GeckoTerminal (free, no key, CORS-friendly)
async function fetchQqqxHistory() {
  const mint = 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ';
  try {
    // 1. Find top pool for QQQx
    const poolsRes = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools`);
    if (!poolsRes.ok) return null;
    const poolsData = await poolsRes.json();
    const topPool = poolsData?.data?.[0];
    if (!topPool) return null;
    const poolAddress = topPool.attributes.address;

    // 2. Get daily OHLC for ~90 days
    const ohlcRes = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/day?aggregate=1&limit=90`
    );
    if (!ohlcRes.ok) return null;
    const ohlcData = await ohlcRes.json();
    const list = ohlcData?.data?.attributes?.ohlcv_list || [];
    // Format: [[timestamp, open, high, low, close, volume], ...] — GeckoTerminal returns newest first
    const points = list.map(row => ({ time: row[0], value: parseFloat(row[4]) }))
                       .filter(p => isFinite(p.value))
                       .sort((a, b) => a.time - b.time);
    return points.length >= 2 ? points : null;
  } catch (e) {
    console.warn('QQQx history fetch failed', e);
    return null;
  }
}

function initSectionCharts() {
  drawPreLaunchChart(document.getElementById('chart-spcxbank'), {
    placeholder: 'PRE-LAUNCH · $SPCXBANK PRICE',
    subtext: 'Live price chart starts once the token is deployed.',
  });

  // QQQx: live data via GeckoTerminal (best-effort, falls back to pre-launch)
  const qqqxCanvas = document.getElementById('chart-qqqx');
  drawPreLaunchChart(qqqxCanvas, {
    placeholder: 'LOADING QQQx HISTORICAL ...',
    subtext: 'Fetching daily price from GeckoTerminal',
  });
  fetchQqqxHistory().then(points => {
    if (points) {
      drawLiveChart(qqqxCanvas, points, {
        yFmt: v => '$' + (v >= 100 ? v.toFixed(0) : v.toFixed(2)),
        dateFmt: t => {
          const d = new Date(t * 1000);
          const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          return `${m[d.getUTCMonth()]} ${d.getUTCDate()}`;
        },
      });
    } else {
      drawPreLaunchChart(qqqxCanvas, {
        placeholder: 'QQQx · DATA UNAVAILABLE',
        subtext: 'GeckoTerminal returned no historical data',
      });
    }
  });

  drawPreLaunchChart(document.getElementById('chart-holders'), {
    placeholder: 'PRE-LAUNCH · HOLDER GROWTH',
    subtext: 'Holder count over time · begins at first $SPCXBANK trade.',
  });
  drawPreLaunchChart(document.getElementById('chart-dist'), {
    placeholder: 'PRE-LAUNCH · DISTRIBUTION HISTORY',
    subtext: 'Cumulative USD distributed · starts at the first sweep.',
  });
}

const chartIO = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { initSectionCharts(); chartIO.disconnect(); } });
}, { threshold: 0.05 });
const chartsSection = document.getElementById('charts');
if (chartsSection) chartIO.observe(chartsSection);

const sectionChartIds = {
  spcxbank: 'chart-spcxbank',
  qqqx:     'chart-qqqx',
  holders:  'chart-holders',
  dist:     'chart-dist',
};
document.querySelectorAll('#charts .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#charts .tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const key = btn.dataset.c;
    Object.entries(sectionChartIds).forEach(([k, id]) => {
      const el = document.getElementById(id);
      if (el) el.style.display = (k === key) ? 'block' : 'none';
    });
    // Re-render the newly visible chart at its new measured size.
    setTimeout(initSectionCharts, 50);
  });
});

window.addEventListener('resize', () => {
  // Re-render all four on resize (cheap; no data crunching pre-launch).
  initSectionCharts();
});

document.querySelectorAll('.bets-toolbar').forEach(tb => {
  tb.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      tb.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    });
  });
});
*/

// ---------- NDX-100 HISTORICAL CHART (interactive) -----------------------
// Monthly closes 2010-01 → 2026-05 (anchor-interpolated). Mouse / touch
// over the chart draws a crosshair + glowing dot + tooltip with the exact
// month + value. Off-cursor falls back to highlighting "now".
(function drawNdxHistorical() {
  const canvas = document.getElementById('ndx-chart');
  if (!canvas) return;

  // Real-ish NDX-100 month anchors (year, month, close). Interpolated to
  // monthly density between anchors with a small deterministic wobble.
  const ANCHORS = [
    { ym: 2010 * 12 +  1, v:  1840 },
    { ym: 2010 * 12 + 12, v:  2218 },
    { ym: 2011 * 12 + 12, v:  2278 },
    { ym: 2012 * 12 + 12, v:  2660 },
    { ym: 2013 * 12 + 12, v:  3592 },
    { ym: 2014 * 12 + 12, v:  4236 },
    { ym: 2015 * 12 + 12, v:  4593 },
    { ym: 2016 * 12 + 12, v:  4863 },
    { ym: 2017 * 12 + 12, v:  6396 },
    { ym: 2018 * 12 +  9, v:  7706 },  // pre-Q4 high
    { ym: 2018 * 12 + 12, v:  6329 },  // Q4 sell-off
    { ym: 2019 * 12 + 12, v:  8733 },
    { ym: 2020 * 12 +  2, v:  8862 },  // pre-COVID peak
    { ym: 2020 * 12 +  3, v:  7813 },  // COVID crash
    { ym: 2020 * 12 + 12, v: 12888 },
    { ym: 2021 * 12 + 12, v: 16320 },
    { ym: 2022 * 12 +  6, v: 11503 },  // mid-2022 bottom-ish
    { ym: 2022 * 12 + 12, v: 10940 },
    { ym: 2023 * 12 + 12, v: 16826 },
    { ym: 2024 * 12 + 12, v: 21012 },
    { ym: 2025 * 12 + 12, v: 22600 },
    { ym: 2026 * 12 +  5, v: 23847 },
  ];

  function pseudoNoise(i) {
    const s = Math.sin(i * 7.317) * 43758.5453;
    return (s - Math.floor(s) - 0.5) * 2; // [-1, 1]
  }

  // Build dense monthly series via piecewise interpolation
  const DATA = [];
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i], b = ANCHORS[i + 1];
    const span = b.ym - a.ym;
    for (let m = 0; m < span; m++) {
      const f = m / span;
      const v = a.v + (b.v - a.v) * f;
      // ±1.2% wobble for natural look
      const w = 1 + pseudoNoise(a.ym + m) * 0.012;
      DATA.push({ ym: a.ym + m, v: Math.round(v * w) });
    }
  }
  DATA.push({ ym: ANCHORS[ANCHORS.length - 1].ym, v: ANCHORS[ANCHORS.length - 1].v });

  const dpr  = window.devicePixelRatio || 1;
  const cssW = 360;
  const cssH = 280;
  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.style.cursor = 'crosshair';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const padL = 42, padR = 14, padT = 14, padB = 28;
  const chartW = cssW - padL - padR;
  const chartH = cssH - padT - padB;

  const minVal = 0;
  const maxVal = 26000;
  const minYm = DATA[0].ym;
  const maxYm = DATA[DATA.length - 1].ym;

  const xFor = ym => padL + (ym - minYm) / (maxYm - minYm) * chartW;
  const yFor = v  => padT + (1 - (v - minVal) / (maxVal - minVal)) * chartH;

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(ym) {
    const year  = Math.floor((ym - 1) / 12);
    const month = ((ym - 1) % 12) + 1;
    return `${MONTHS[month - 1]} ${year}`;
  }

  function render(highlightIdx) {
    ctx.clearRect(0, 0, cssW, cssH);

    // Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (const v of [5000, 10000, 15000, 20000, 25000]) {
      const y = yFor(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssW - padR, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Y labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '10px "Noto Sans Mono", "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [5000, 10000, 15000, 20000, 25000]) {
      ctx.fillText((v / 1000) + 'K', padL - 8, yFor(v));
    }

    // X labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const y of [2010, 2015, 2020, 2026]) {
      ctx.fillText(String(y), xFor(y * 12 + 1), cssH - padB + 8);
    }

    // Area fill
    const grad = ctx.createLinearGradient(0, padT, 0, cssH - padB);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.00)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xFor(DATA[0].ym), cssH - padB);
    for (const pt of DATA) ctx.lineTo(xFor(pt.ym), yFor(pt.v));
    ctx.lineTo(xFor(DATA[DATA.length - 1].ym), cssH - padB);
    ctx.closePath();
    ctx.fill();

    // Main line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    DATA.forEach((pt, i) => {
      const x = xFor(pt.ym), y = yFor(pt.v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Resolve which point to highlight
    const hi = (highlightIdx === undefined || highlightIdx < 0 || highlightIdx >= DATA.length)
      ? DATA.length - 1
      : highlightIdx;
    const pt = DATA[hi];
    const hx = xFor(pt.ym);
    const hy = yFor(pt.v);

    // Crosshair (only when user is hovering, not on default highlight)
    if (highlightIdx !== undefined && highlightIdx >= 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, cssH - padB);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Glowing dot
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Tooltip
    const label = `${fmtDate(pt.ym)}  ·  ${pt.v.toLocaleString()}`;
    ctx.font = '10px "Noto Sans Mono", "JetBrains Mono", monospace';
    const tw = ctx.measureText(label).width + 14;
    const th = 20;
    let tx = hx - tw / 2;
    let ty = hy - 24;
    if (tx < padL) tx = padL;
    if (tx + tw > cssW - padR) tx = cssW - padR - tw;
    if (ty < padT) ty = hy + 12;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, tx + 7, ty + th / 2);
  }

  // Initial render — highlight current value (last data point)
  render();

  // --- Interaction: mouse + touch follow ---
  function nearestIdxFromClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    if (localX < padL - 4 || localX > cssW - padR + 4) return -1;
    // Map x → ym → nearest data index
    const t = (localX - padL) / chartW;
    const ymGuess = minYm + t * (maxYm - minYm);
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < DATA.length; i++) {
      const d = Math.abs(DATA[i].ym - ymGuess);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return bestI;
  }

  canvas.addEventListener('mousemove', (e) => {
    const i = nearestIdxFromClientX(e.clientX);
    if (i < 0) render();
    else render(i);
  });
  canvas.addEventListener('mouseleave', () => render());

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 0) return;
    e.preventDefault();
    const i = nearestIdxFromClientX(e.touches[0].clientX);
    if (i >= 0) render(i);
  }, { passive: false });
  canvas.addEventListener('touchend', () => render());
})();

// ---------- STRIP BLACK BACKGROUND FROM ROCKET FAB IMAGE ----------------
(function stripRocketFabBg() {
  const img = document.querySelector('#rocket-fab img');
  if (!img) return;
  const src = img.getAttribute('src');
  if (!src) return;
  const probe = new Image();
  probe.onload = () => {
    const c = document.createElement('canvas');
    c.width = probe.width;
    c.height = probe.height;
    const cx = c.getContext('2d');
    cx.drawImage(probe, 0, 0);
    let dat;
    try { dat = cx.getImageData(0, 0, c.width, c.height); }
    catch (e) { return; }
    const a = dat.data;
    for (let i = 0; i < a.length; i += 4) {
      const b = (a[i] + a[i + 1] + a[i + 2]) / 3;
      a[i + 3] = Math.min(255, b * 1.5);
    }
    cx.putImageData(dat, 0, 0);
    img.src = c.toDataURL();
  };
  probe.src = src;
})();

// ---------- CODE MODAL ---------------------------------------------------
(function setupCodeModal() {
  const modal    = document.getElementById('code-modal');
  const closeBtn = document.getElementById('code-modal-close');
  const backdrop = modal && modal.querySelector('.code-modal-backdrop');
  if (!modal) return;

  const open  = () => modal.setAttribute('aria-hidden', 'false');
  const close = () => modal.setAttribute('aria-hidden', 'true');

  // Any element with class `code-trigger` opens the modal (top-bar, etc.)
  document.querySelectorAll('.code-trigger').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); open(); });
  });
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();

// ---------- FLOATING ROCKET FAB → CA POPUP TOGGLE ------------------------
(function setupCaPopup() {
  const fab   = document.getElementById('rocket-fab');
  const popup = document.getElementById('ca-popup');
  const close = document.getElementById('ca-popup-close');
  if (!fab || !popup) return;

  // Default state on page load — open.
  let open = true;
  popup.setAttribute('aria-hidden', 'false');

  function setOpen(v) {
    open = v;
    popup.setAttribute('aria-hidden', v ? 'false' : 'true');
  }

  fab.addEventListener('click', () => setOpen(!open));
  if (close) close.addEventListener('click', () => setOpen(false));
})();

// ---------- COPY-TO-CLIPBOARD (hero addresses) ---------------------------
document.querySelectorAll('.hero-addr-btn[data-addr]').forEach(btn => {
  btn.addEventListener('click', () => {
    const addr = btn.dataset.addr;
    const restore = () => setTimeout(() => { btn.textContent = 'copy'; }, 1500);
    // Pending CA — no address to copy yet.
    if (!addr) {
      btn.textContent = 'pending';
      restore();
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(addr).then(() => {
        btn.textContent = '✓ copied';
        restore();
      }).catch(() => { btn.textContent = '✗ failed'; restore(); });
    } else {
      const ta = document.createElement('textarea');
      ta.value = addr;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); btn.textContent = '✓ copied'; }
      catch (_) { btn.textContent = '✗ failed'; }
      document.body.removeChild(ta);
      restore();
    }
  });
});

// ---------- TOP-BAR CONNECT WALLET ---------------------------------------
const topConnectBtn = document.getElementById('top-connect');
let topWalletConnected = false;
function topSetConnected(addr) {
  topWalletConnected = true;
  topConnectBtn.textContent = addr.slice(0,4) + '…' + addr.slice(-4);
  topConnectBtn.classList.add('connected');
}
if (topConnectBtn) {
  topConnectBtn.addEventListener('click', () => {
    if (topWalletConnected) return;
    if (window.solana && window.solana.isPhantom) {
      window.solana.connect()
        .then(r => topSetConnected(r.publicKey.toString()))
        .catch(() => topSetConnected(randomAddr()));
    } else {
      topSetConnected(randomAddr());
    }
  });
}

// ---------- TERMINAL COMMAND -----------------------------------------------
const cmd = document.getElementById('cmd');
const output = document.getElementById('output');
const HELP_TXT = `Available commands:
  help                show this help
  buy                 jump to buy section
  app                 open dashboard
  mint                show contract address
  treasury            show treasury reserves
  countdown           ndx fast entry countdown
  clear               clear output`;
if (cmd) {
  cmd.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const v = cmd.value.trim().toLowerCase();
    let resp = '';
    if (v === 'help') resp = HELP_TXT;
    else if (v === 'buy') { window.location.hash = '#buy'; resp = '> jumping to buy section...'; }
    else if (v === 'app') { window.location.href = 'app.html'; return; }
    else if (v === 'mint') resp = '> $SPCXBANK mint: PENDING (announced at launch)\n> QQQx mint: Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ';
    else if (v === 'treasury') resp = '> Treasury: 412,837 QQQx (~$19.84M)\n> Distributed lifetime: 84,219 QQQx\n> Holders: 14,782';
    else if (v === 'countdown') {
      const s = Math.floor((NDX_INCLUSION - new Date()) / 1000);
      const d = Math.floor(s/86400);
      resp = `> NDX FAST ENTRY · T-${d}d ${pad(Math.floor((s%86400)/3600))}h ${pad(Math.floor((s%3600)/60))}m`;
    }
    else if (v === 'clear') { output.textContent = ''; cmd.value = ''; return; }
    else if (v) resp = `command not found: ${v}  ·  type "help" for available commands`;
    if (resp) output.textContent = resp;
    cmd.value = '';
  });
}
