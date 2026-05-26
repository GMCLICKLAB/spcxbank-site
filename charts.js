/* ============================================================
   $SPCXBANK · Shared chart renderer for ON-CHAIN CHARTS section
   ------------------------------------------------------------
   Loaded by both index.html and app.html so they always render
   the exact same chart UI. All labels are English/numeric — no
   Chinese characters ever appear inside the chart canvas.
   ============================================================ */

// ---- Pre-launch placeholder chart -------------------------------------
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

  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.font = '10px "Noto Sans Mono", "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const y of yLines) ctx.fillText('—', padL - 10, y);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xTicks = [padL, padL + chartW * 0.25, padL + chartW * 0.5, padL + chartW * 0.75, cssW - padR];
  for (const x of xTicks) ctx.fillText('—', x, cssH - padB + 10);

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

// ---- Live data line+area chart with hover crosshair -------------------
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

  const yFmt    = opts.yFmt    || (v => v >= 1000 ? (v/1000).toFixed(1) + 'K' : v.toFixed(2));
  const dateFmt = opts.dateFmt || (t => new Date(t * 1000).toISOString().slice(0, 10));

  function render(highlightIdx) {
    ctx.clearRect(0, 0, cssW, cssH);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padT + (i / gridSteps) * chartH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(cssW - padR, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '10px "Noto Sans Mono", "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= gridSteps; i++) {
      const t = i / gridSteps;
      const v = yMax - t * (yMax - yMin);
      ctx.fillText(yFmt(v), padL - 10, padT + t * chartH);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
      const f = i / 4;
      const t = tMin + (tMax - tMin) * f;
      ctx.fillText(dateFmt(t), padL + f * chartW, cssH - padB + 10);
    }

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

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((p, i) => {
      const x = xFor(p.time), y = yFor(p.value);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const hi = (highlightIdx === undefined || highlightIdx < 0 || highlightIdx >= data.length)
      ? data.length - 1
      : highlightIdx;
    const pt = data[hi];
    const hx = xFor(pt.time);
    const hy = yFor(pt.value);

    if (highlightIdx !== undefined && highlightIdx >= 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, cssH - padB);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

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
  canvas.onmousemove  = (e) => { const i = nearestIdx(e.clientX); if (i < 0) render(); else render(i); };
  canvas.onmouseleave = () => render();
  canvas.ontouchmove  = (e) => {
    if (!e.touches.length) return;
    e.preventDefault();
    const i = nearestIdx(e.touches[0].clientX);
    if (i >= 0) render(i);
  };
  canvas.ontouchend = () => render();
  canvas.style.cursor = 'crosshair';
}

// ---- Fetch wrapper with CORS proxy fallback ---------------------------
// Some regions hit Cloudflare rules that strip CORS headers from
// GeckoTerminal/DexScreener responses. When direct fetch is blocked, retry
// through api.allorigins.win which echoes the body with permissive CORS.
async function corsJson(url) {
  try {
    const r = await fetch(url);
    if (r.ok) return await r.json();
  } catch (_) {}
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    if (r.ok) return await r.json();
  } catch (_) {}
  return null;
}

// ---- Fetch QQQx historical OHLC from GeckoTerminal --------------------
async function fetchQqqxHistory() {
  const mint = 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ';
  try {
    const poolsData = await corsJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools`);
    const topPool = poolsData?.data?.[0];
    if (!topPool) return null;
    const poolAddress = topPool.attributes.address;

    const ohlcData = await corsJson(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/day?aggregate=1&limit=90`
    );
    const list = ohlcData?.data?.attributes?.ohlcv_list || [];
    const points = list.map(row => ({ time: row[0], value: parseFloat(row[4]) }))
                       .filter(p => isFinite(p.value))
                       .sort((a, b) => a.time - b.time);
    return points.length >= 2 ? points : null;
  } catch (e) {
    console.warn('QQQx history fetch failed', e);
    return null;
  }
}

// ---- Fetch SPCXBANK historical OHLC (5-min bars, just-launched tokens) ---
async function fetchSpcxbankHistory(mint) {
  if (!mint) return null;
  try {
    const pools = await corsJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools`);
    const topPool = pools?.data?.[0];
    if (!topPool) return null;
    const poolAddr = topPool.attributes.address;
    // 5-minute bars work well for newly-launched tokens (more granular than daily).
    const ohlc = await corsJson(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddr}/ohlcv/minute?aggregate=5&limit=144`);
    const list = ohlc?.data?.attributes?.ohlcv_list || [];
    const points = list.map(r => ({ time: r[0], value: parseFloat(r[4]) }))
                       .filter(p => isFinite(p.value) && p.value > 0)
                       .sort((a, b) => a.time - b.time);
    return points.length >= 2 ? points : null;
  } catch (e) { console.warn('fetchSpcxbankHistory failed', e); return null; }
}

// ---- Initialize all four charts in the #charts section ----------------
function initSectionCharts() {
  // ---------- $SPCXBANK chart ----------
  const spcxCanvas = document.getElementById('chart-spcxbank');
  drawPreLaunchChart(spcxCanvas, {
    placeholder: 'LOADING $SPCXBANK ...',
    subtext: 'Fetching 5-min OHLC bars from GeckoTerminal',
  });
  // SPCXBANK_MINT is declared in solana.js (loaded before charts.js).
  const spcxMint = typeof SPCXBANK_MINT !== 'undefined' ? SPCXBANK_MINT : null;
  fetchSpcxbankHistory(spcxMint).then(points => {
    if (points && points.length >= 2) {
      drawLiveChart(spcxCanvas, points, {
        yFmt: v => v < 0.01 ? '$' + v.toFixed(8) : v < 1 ? '$' + v.toFixed(6) : '$' + v.toFixed(2),
        dateFmt: t => {
          const d = new Date(t * 1000);
          return d.getUTCHours().toString().padStart(2,'0') + ':' + d.getUTCMinutes().toString().padStart(2,'0');
        },
      });
    } else {
      drawPreLaunchChart(spcxCanvas, {
        placeholder: '$SPCXBANK · INDEXING',
        subtext: 'GeckoTerminal usually takes a few minutes after launch.',
      });
    }
  });

  // ---------- QQQx chart ----------
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

  // ---------- HOLDERS + DISTRIBUTIONS charts ----------
  // These need time-series of on-chain state which is NOT in any indexer
  // we currently call. They will activate once we add a snapshot logger.
  drawPreLaunchChart(document.getElementById('chart-holders'), {
    placeholder: 'HOLDER GROWTH · ACCUMULATING DATA',
    subtext: 'Time-series snapshot logger lands in a future update.',
  });
  drawPreLaunchChart(document.getElementById('chart-dist'), {
    placeholder: 'DISTRIBUTION HISTORY · AWAITING FIRST SWEEP',
    subtext: 'Each sweep adds one bar — chart starts as soon as you run keeper-distribute.js.',
  });
}

// ---- Lazy-init when the section scrolls into view ---------------------
const __chartIO = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { initSectionCharts(); __chartIO.disconnect(); } });
}, { threshold: 0.05 });
const __chartsSection = document.getElementById('charts');
if (__chartsSection) __chartIO.observe(__chartsSection);

// ---- QQQx MCAP + 24H VOL fetcher (DexScreener) ------------------------
function __fmtCompactUsd(n) {
  if (!isFinite(n) || n <= 0) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}
let __qqqxInfo = null;
async function fetchQqqxMcapVol() {
  if (__qqqxInfo) return __qqqxInfo;
  const mint = 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ';
  // GeckoTerminal (with CORS proxy fallback) is the source of truth for
  // QQQx FDV. DexScreener returns a broken fdv (~$726K) and a marketCap
  // that misses Backed Finance's off-DEX holdings, so we prefer
  // GeckoTerminal's fdv_usd (= total supply × price, ~$42M).
  const gtData = await corsJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}`);
  if (gtData) {
    const a = gtData?.data?.attributes || {};
    const mcap   = parseFloat(a.fdv_usd);
    const vol24h = parseFloat(a?.volume_usd?.h24);
    if (isFinite(mcap) && mcap > 0) {
      __qqqxInfo = {
        mcap,
        vol24h: isFinite(vol24h) && vol24h > 0 ? vol24h : null,
      };
      return __qqqxInfo;
    }
  }
  // Fallback to DexScreener marketCap (under-counts vs FDV but still valid).
  const dsData = await corsJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  if (dsData) {
    const pair = dsData?.pairs?.[0];
    __qqqxInfo = {
      mcap:   parseFloat(pair?.marketCap) || null,
      vol24h: parseFloat(pair?.volume?.h24) || null,
    };
    return __qqqxInfo;
  }
  return null;
}
async function updateChartToolbarInfo(activeKey) {
  const mcapEl = document.getElementById('chart-mcap');
  const volEl  = document.getElementById('chart-vol');
  if (!mcapEl || !volEl) return;
  if (activeKey === 'qqqx') {
    const info = await fetchQqqxMcapVol();
    if (info) {
      mcapEl.textContent = info.mcap   ? __fmtCompactUsd(info.mcap)   : '—';
      volEl.textContent  = info.vol24h ? __fmtCompactUsd(info.vol24h) : '—';
    } else {
      mcapEl.textContent = '—';
      volEl.textContent  = '—';
    }
  } else {
    mcapEl.textContent = 'PRE-LAUNCH';
    volEl.textContent  = 'PRE-LAUNCH';
  }
}
// Pre-warm and populate the toolbar with live QQQx data on load (since
// QQQx is now the default active tab).
updateChartToolbarInfo('qqqx');

// ---- Tab switching (chart-to-chart inside #charts) --------------------
const __chartIds = {
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
    Object.entries(__chartIds).forEach(([k, id]) => {
      const el = document.getElementById(id);
      if (el) el.style.display = (k === key) ? 'block' : 'none';
    });
    updateChartToolbarInfo(key);
    setTimeout(initSectionCharts, 50);
  });
});

window.addEventListener('resize', () => {
  initSectionCharts();
});
