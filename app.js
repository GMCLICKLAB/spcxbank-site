/* ============================================================
   $SPCXBANK · DASHBOARD LOGIC
   All values mocked. Wire on-chain reads before launch.
   ============================================================ */

// ---------- TICKER --------------------------------------------------------
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
  const t = document.getElementById('ticker-track');
  if (t) t.innerHTML = html + html;
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
  if (p >= 1000) return '$ ' + Math.round(p).toLocaleString();
  if (p >= 1)    return '$ ' + p.toFixed(2);
  return '$ ' + p.toFixed(4);
}

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
function setQqqxStat(priceStr) {
  const el = document.getElementById('qqqx-price-stat');
  if (el) el.textContent = priceStr;
}
async function fetchQQQx() {
  const mint = 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ';
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
  console.warn('QQQx: no on-chain price source returned data');
}
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
    const wrap = await (await fetch(proxy)).json();
    const { price, change } = parse(JSON.parse(wrap.contents));
    updateTickerCell('ndx', Math.round(price).toLocaleString(), change);
  } catch (e) { console.warn('ndx fetch failed', e); }
}

async function fetchSPCX() {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const meta = data[0], ctxs = data[1];
    if (!meta || !Array.isArray(meta.universe) || !Array.isArray(ctxs)) return;
    const idx = meta.universe.findIndex(u => u && u.name === 'xyz:SPCX');
    if (idx < 0) { updateTickerCell('spcx', 'NOT LISTED'); return; }
    const ctx = ctxs[idx];
    const price = parseFloat(ctx.markPx || ctx.midPx);
    const prev  = parseFloat(ctx.prevDayPx);
    if (!isFinite(price)) return;
    const change = prev > 0 ? ((price - prev) / prev) * 100 : null;
    updateTickerCell('spcx', fmtPrice(price), change);
  } catch (e) { console.warn('Hyperliquid SPCX fetch failed', e); }
}

function refreshTickerData() {
  fetchBinance();
  fetchQQQx();
  fetchNDX();
  fetchSPCX();
}
refreshTickerData();
setInterval(refreshTickerData, 30000);

// ---------- HELPERS -------------------------------------------------------
function pad(n){ return String(Math.max(0,n)).padStart(2,'0'); }
function randomAddr() {
  const chars = '0123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 44; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function shortAddr(a) { return a.slice(0, 5) + '…' + a.slice(-5); }
function ago(s) {
  if (s < 60)   return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400)return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

// ---------- SLOT NUMBER & LAST UPDATE ------------------------------------
let slot = 348219471;
setInterval(() => {
  slot += Math.floor(Math.random() * 3) + 1;
  const el = document.getElementById('slot-num');
  if (el) el.textContent = slot.toLocaleString();
  const lu = document.getElementById('last-update');
  if (lu) lu.textContent = new Date().toISOString().slice(11, 19) + ' UTC';
}, 800);

function tickNextSweep() {
  const el = document.getElementById('next-sweep');
  if (!el) return;
  // Pre-launch: token not deployed → static placeholder, no live tick.
  if (typeof SPCXBANK_MINT === 'undefined' || !SPCXBANK_MINT) {
    el.textContent = '5m 00s';
    return;
  }
  const now = new Date();
  // Next 5-minute boundary in UTC (post-launch keeper cadence)
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

// ---------- COUNTERS -------------------------------------------------------
function animateCounters() {
  document.querySelectorAll('[data-counter]').forEach(el => {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const target = parseInt(el.dataset.counter, 10);
    let cur = 0;
    const step = Math.max(1, Math.floor(target / 50));
    const t = setInterval(() => {
      cur += step;
      if (cur >= target) { cur = target; clearInterval(t); }
      el.textContent = cur.toLocaleString();
    }, 25);
  });
}
animateCounters();

// ---------- ON-CHAIN LEDGER (holders / distrib / purchase tabs) ----------
// All three panels show PRE-LAUNCH placeholders until SPCXBANK_MINT is set
// in solana.js. Post-launch, each fetches real data from Solana RPC /
// Helius indexer with 15 rows per page + prev/next pagination.

const TOTAL_SUPPLY = 1_000_000_000; // pump.fun fixed supply (see memory)
const LEDGER_PAGE_SIZE = 15;

(function setupLedgerTabs() {
  const panels = {
    holders:  document.getElementById('ledger-holders'),
    distrib:  document.getElementById('ledger-distrib'),
    purchase: document.getElementById('ledger-purchase'),
  };
  document.querySelectorAll('[data-ledger]').forEach(tab => {
    tab.addEventListener('click', () => {
      const key = tab.dataset.ledger;
      document.querySelectorAll('[data-ledger]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      Object.entries(panels).forEach(([k, el]) => {
        if (el) el.style.display = (k === key) ? '' : 'none';
      });
    });
  });
})();

// Post-launch wiring (called when SPCXBANK_MINT becomes truthy):
//   • renderHoldersPage(page)  — Helius getTokenAccounts(SPCXBANK_MINT)
//   • renderDistribPage(page)  — getSignaturesForAddress(TREASURY) filter QQQx out
//   • renderPurchasePage(page) — getSignaturesForAddress(TREASURY) filter QQQx in
// Each slices the result into 15-row pages and wires data-page-prev / next /
// cur / max / total elements inside the corresponding ledger-panel.

// ============================================================
// LEDGER_DEMO_MODE — preview the populated look pre-launch.
// Flip back to false once preview is approved.
// ============================================================
const LEDGER_DEMO_MODE = false;

function renderEmptyLedgerRows(bodyId, colCount) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const dash = '<span class="bet-deadline">—</span>';
  const dashCells = dash.repeat(colCount - 1);
  const solscan   = '<span class="bet-action disabled">solscan</span>';
  body.innerHTML = Array.from({ length: LEDGER_PAGE_SIZE }, () =>
    `<div class="bet-item">${dashCells}${solscan}</div>`
  ).join('');
}

function makeLedgerPager(panelId, data, rowRender) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const body  = panel.querySelector('.ledger-body');
  const cur   = panel.querySelector('[data-page-cur]');
  const max   = panel.querySelector('[data-page-max]');
  const total = panel.querySelector('[data-page-total]');
  const prev  = panel.querySelector('[data-page-prev]');
  const next  = panel.querySelector('[data-page-next]');
  let page = 1;
  const totalPages = Math.max(1, Math.ceil(data.length / LEDGER_PAGE_SIZE));

  function render() {
    const start = (page - 1) * LEDGER_PAGE_SIZE;
    const slice = data.slice(start, start + LEDGER_PAGE_SIZE);
    body.innerHTML = slice.map(rowRender).join('');
    cur.textContent   = page;
    max.textContent   = totalPages;
    total.textContent = data.length.toLocaleString();
    prev.classList.toggle('disabled', page <= 1);
    next.classList.toggle('disabled', page >= totalPages);
  }
  prev.addEventListener('click', (e) => { e.preventDefault(); if (page > 1) { page--; render(); } });
  next.addEventListener('click', (e) => { e.preventDefault(); if (page < totalPages) { page++; render(); } });
  render();
}

if (!LEDGER_DEMO_MODE) {
  // Pre-launch: render 15 empty skeleton rows in each panel.
  renderEmptyLedgerRows('holders-rows',  7); // # / WALLET / BALANCE / SHARE / QQQx RECEIVED / QQQx USD / solscan
  renderEmptyLedgerRows('distrib-rows',  7); // ROUND / FAN-OUT / RECIPIENT / QQQx / SHARE / WHEN / solscan
  renderEmptyLedgerRows('purchase-rows', 5); // SOURCE / SOL IN / QQQx OUT / WHEN / solscan

  // Post-launch (mint is set): swap empty rows for live data.
  // Distributions + purchases fetchers will be added on CA day (need real
  // tx data to verify Helius enhanced-tx parsing). Holders works today —
  // it only needs getProgramAccounts which is mint-agnostic structurally.
  if (typeof SPCXBANK_MINT !== 'undefined' && SPCXBANK_MINT) {
    loadHoldersLedger();
  }
}

// ============================================================
// HOLDERS LEDGER · real on-chain fetcher (post-launch)
// ============================================================
async function loadHoldersLedger() {
  const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  try {
    // 1. Fetch every $SPCXBANK token account via jsonParsed encoding.
    //    Public RPC will rate-limit hard — Helius highly recommended
    //    (set SOLANA_RPC in solana.js to your Helius mainnet endpoint).
    const accounts = await rpc('getProgramAccounts', [
      TOKEN_PROGRAM,
      {
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: SPCXBANK_MINT } },
        ],
        encoding: 'jsonParsed',
        commitment: 'confirmed',
      },
    ]);

    // 2. Build holder list sorted by balance desc.
    const holders = accounts
      .map(a => {
        const info = a.account.data.parsed.info;
        return {
          owner: info.owner,
          bal:   parseFloat(info.tokenAmount.uiAmountString),
        };
      })
      .filter(h => h.bal > 0)
      .sort((a, b) => b.bal - a.bal)
      .slice(0, 200) // dashboard caps at top 200 holders
      .map((h, i) => ({ rank: i + 1, addr: h.owner, bal: h.bal }));

    // 3. Pull supply + treasury QQQx reserve + QQQx live price in parallel
    //    so we can derive each holder's pro-rata QQQx allocation + USD.
    const [supply, qqqxReserve, qqqxPrice] = await Promise.all([
      getSpcxbankSupply().catch(() => null),
      getTreasuryQQQx().catch(() => 0),
      getQqqxPriceUsd().catch(() => null),
    ]);

    // 4. Wire to makeLedgerPager — 15/page, prev/next handled automatically.
    makeLedgerPager('ledger-holders', holders, h => {
      const share     = supply ? h.bal / supply : 0;
      const qqqxAlloc = qqqxReserve ? share * qqqxReserve : 0;
      const usd       = qqqxPrice ? qqqxAlloc * qqqxPrice : 0;
      return `
        <div class="bet-item">
          <span class="bet-id">${String(h.rank).padStart(2,'0')}</span>
          <span class="bet-claim">${shortAddr(h.addr)}</span>
          <span class="bet-stake">${h.bal.toLocaleString()}</span>
          <span class="bet-deadline">${(share * 100).toFixed(3)}%</span>
          <span class="bet-stake">${qqqxAlloc.toFixed(4)} QQQx</span>
          <span class="bet-stake">$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          <a class="bet-action" href="https://solscan.io/account/${h.addr}" target="_blank" rel="noopener">solscan</a>
        </div>`;
    });
  } catch (e) {
    console.warn('loadHoldersLedger failed (RPC limit? wrong mint?)', e);
    // Empty skeleton rows stay in place on failure — no harm done.
  }
}

if (LEDGER_DEMO_MODE) {
  const QQQX_RES_MOCK   = 8421;
  const QQQX_PRICE_MOCK = 726;

  // ----- HOLDERS mock (45 entries → 3 pages of 15) -----
  const mockHolders = [];
  for (let i = 0; i < 45; i++) {
    const w = Math.pow(0.92, i);
    mockHolders.push({
      rank: i + 1,
      addr: randomAddr(),
      bal: Math.floor(42_000_000 * w),
    });
  }
  makeLedgerPager('ledger-holders', mockHolders, h => {
    const share     = h.bal / TOTAL_SUPPLY;
    const qqqxAlloc = share * QQQX_RES_MOCK;
    const usd       = qqqxAlloc * QQQX_PRICE_MOCK;
    return `
      <div class="bet-item">
        <span class="bet-id">${String(h.rank).padStart(2,'0')}</span>
        <span class="bet-claim">${shortAddr(h.addr)}</span>
        <span class="bet-stake">${h.bal.toLocaleString()}</span>
        <span class="bet-deadline">${(share * 100).toFixed(3)}%</span>
        <span class="bet-stake">${qqqxAlloc.toFixed(2)} QQQx</span>
        <span class="bet-stake">$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        <a class="bet-action" href="https://solscan.io/account/${h.addr}" target="_blank" rel="noopener">solscan</a>
      </div>`;
  });

  // ----- DISTRIBUTIONS mock: each row = ONE transfer (treasury → ONE wallet).
  // A single distribution round fan-outs to all holders, so the same round #
  // (and its fan-out count) repeats across many adjacent rows.
  // 45 rows / 3 recent rounds for demo, round sizes grow over time.
  const mockDistribs = [];
  [
    { roundNum: 1024, fanOut: 14756 },
    { roundNum: 1023, fanOut: 14706 },
    { roundNum: 1022, fanOut: 14650 },
  ].forEach((r, roundIdx) => {
    const baseSecAgo = roundIdx * 300 + 30;
    for (let j = 0; j < 15; j++) {
      const sharePct = 0.001 + Math.random() * 0.6;
      const qqqx     = sharePct * 0.01 * 180;
      mockDistribs.push({
        txSig:     randomAddr(),
        roundNum:  r.roundNum,
        fanOut:    r.fanOut,
        recipient: randomAddr(),
        qqqx,
        sharePct,
        secAgo:    baseSecAgo + j,
      });
    }
  });
  makeLedgerPager('ledger-distrib', mockDistribs, d => `
    <div class="bet-item">
      <span class="bet-deadline">#${d.roundNum.toString().padStart(4,'0')}</span>
      <span class="bet-deadline">${d.fanOut.toLocaleString()}</span>
      <span class="bet-claim">${shortAddr(d.recipient)}</span>
      <span class="bet-stake">${d.qqqx.toFixed(4)} QQQx</span>
      <span class="bet-stake">${d.sharePct.toFixed(3)}%</span>
      <span class="bet-status">${ago(d.secAgo)}</span>
      <a class="bet-action" href="https://solscan.io/tx/${d.txSig}" target="_blank" rel="noopener">solscan</a>
    </div>`);

  // ----- QQQx PURCHASES mock (45 jupiter swaps) -----
  // Fetch live SOL & QQQx prices so rate = SOL_USD / QQQx_USD is honest.
  // Without this the demo math would lie (e.g. 1.9 SOL ≠ 0.46 QQQx).
  (async () => {
    async function getSolPx() {
      try {
        const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
        if (r.ok) return parseFloat((await r.json()).price) || null;
      } catch (_) {}
      return null;
    }
    const [solPx, qqqxPx] = await Promise.all([getSolPx(), getQqqxPriceUsd()]);
    const rate = (solPx && qqqxPx) ? (solPx / qqqxPx) : 0.118; // fallback ≈ Jan 2026 ratio

    const mockPurchases = [];
    for (let i = 0; i < 45; i++) {
      // Small jitter (±2%) around the true rate to look like real slippage.
      const r       = rate * (0.98 + Math.random() * 0.04);
      const solIn   = 0.25 + Math.random() * 2.4;
      const qqqxOut = solIn * r;
      mockPurchases.push({
        txSig: randomAddr(),
        solIn,
        qqqxOut,
        secAgo: (i + 1) * 300,
      });
    }
    makeLedgerPager('ledger-purchase', mockPurchases, p => `
      <div class="bet-item">
        <span class="bet-claim"><span class="bet-tag">SWAP</span>jupiter route · SOL → QQQx</span>
        <span class="bet-stake">${p.solIn.toFixed(3)} SOL</span>
        <span class="bet-deadline">${p.qqqxOut.toFixed(4)} QQQx</span>
        <span class="bet-status">${ago(p.secAgo)}</span>
        <a class="bet-action" href="https://solscan.io/tx/${p.txSig}" target="_blank" rel="noopener">solscan</a>
      </div>`);
  })();

  // Top-right info text
  const info = document.getElementById('ledger-info');
  if (info) info.textContent = '14,782 holders · 1,024 sweeps · 8,421 QQQx reserve';
}


// ---------- CHARTS --------------------------------------------------------
// Moved to shared `charts.js`. Same renderer is loaded on both pages so the
// CHARTS section here mirrors the homepage exactly.

// Tab toggle for non-chart toolbars (TOP 50 / RECENT / etc — no data-c attr).
document.querySelectorAll('.bets-toolbar').forEach(tb => {
  tb.querySelectorAll('.tab:not([data-c])').forEach(t => {
    t.addEventListener('click', () => {
      tb.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    });
  });
});

// ---------- WALLET CONNECT ------------------------------------------------
const btn = document.getElementById('connect-btn');
const walletEl = document.getElementById('wallet-addr');
let connected = false;

const MY_ROW_IDS = ['my-t15','my-share','my-qqqx','my-usd'];

// ============================================================
// DEMO_MODE — preview post-launch UI without a real mint.
// SPCXBANK numbers are mocked (token not yet deployed); QQQx
// balance is mocked but price is fetched live from-chain.
// Flip back to false once we revert to "wait for CA" state.
// ============================================================
const DEMO_MODE = false;
const DEMO_DATA = {
  spcxbankBalance: 4_283_217,
  spcxbankSupply:  1_000_000_000,
  qqqxBalance:     412.8374,
};

function setRows(text) {
  MY_ROW_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

async function loadMyPosition(addr) {
  // DEMO preview — pretend the token is live and the wallet holds some.
  if (DEMO_MODE) {
    const d = DEMO_DATA;
    document.getElementById('my-t15').textContent   = d.spcxbankBalance.toLocaleString() + ' $SPCXBANK';
    document.getElementById('my-share').textContent = ((d.spcxbankBalance / d.spcxbankSupply) * 100).toFixed(4) + '%';
    document.getElementById('my-qqqx').textContent  = d.qqqxBalance.toFixed(4) + ' QQQx';
    // Live QQQx price → real USD value
    try {
      const qqqxPx = await getQqqxPriceUsd();
      if (qqqxPx !== null) {
        const usd = d.qqqxBalance * qqqxPx;
        document.getElementById('my-usd').textContent = '$' + usd.toLocaleString(undefined, { maximumFractionDigits: 2 });
      } else {
        document.getElementById('my-usd').textContent = '—';
      }
    } catch (_) {
      document.getElementById('my-usd').textContent = '—';
    }
    return;
  }

  // Pre-launch: token mint not yet set — be honest, show PRE-LAUNCH.
  if (typeof SPCXBANK_MINT === 'undefined' || !SPCXBANK_MINT) {
    setRows('PRE-LAUNCH');
    return;
  }
  try {
    const [bal, supply, qqqxBal, qqqxPx] = await Promise.all([
      getUserSpcxbankBalance(addr),
      getSpcxbankSupply(),
      getUserQqqxBalance(addr),
      getQqqxPriceUsd(),
    ]);
    if (!connected) return; // user disconnected during fetch
    if (bal !== null) {
      document.getElementById('my-t15').textContent = bal.toLocaleString() + ' $SPCXBANK';
    }
    if (bal !== null && supply && supply > 0) {
      document.getElementById('my-share').textContent = ((bal / supply) * 100).toFixed(4) + '%';
    }
    if (qqqxBal !== null) {
      document.getElementById('my-qqqx').textContent = qqqxBal.toFixed(4) + ' QQQx';
    }
    if (qqqxBal !== null && qqqxPx !== null) {
      const usd = qqqxBal * qqqxPx;
      document.getElementById('my-usd').textContent = '$' + usd.toLocaleString(undefined,{maximumFractionDigits:2});
    }
  } catch (e) { console.warn('loadMyPosition failed', e); }
}

function setConnected(addr) {
  connected = true;
  walletEl.classList.remove('empty');
  walletEl.textContent = addr;
  if (btn) {
    btn.textContent = 'DISCONNECT';
    btn.classList.remove('primary');
    btn.classList.add('secondary');
  }

  const topBtn = document.getElementById('top-connect');
  if (topBtn) {
    topBtn.textContent = shortAddr(addr);
    topBtn.classList.add('connected');
  }

  setRows('…');         // loading state while RPC resolves
  loadMyPosition(addr); // real on-chain reads
}

function setDisconnected() {
  connected = false;
  walletEl.classList.add('empty');
  walletEl.textContent = '> not connected';
  if (btn) {
    btn.textContent = 'CONNECT WALLET';
    btn.classList.remove('secondary');
    btn.classList.add('primary');
  }

  const topBtn = document.getElementById('top-connect');
  if (topBtn) {
    topBtn.textContent = 'CONNECT';
    topBtn.classList.remove('connected');
  }

  setRows('—');

  if (window.solana && window.solana.isPhantom && window.solana.disconnect) {
    window.solana.disconnect().catch(() => {});
  }
}

// ---------- WALLET PICKER (multi-wallet support) -------------------------
const WALLET_PROVIDERS = [
  {
    id: 'phantom',
    name: 'Phantom',
    detect:   () => !!(window.phantom?.solana?.isPhantom || window.solana?.isPhantom),
    provider: () => window.phantom?.solana || window.solana,
    install:  'https://phantom.app/',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    detect:   () => !!window.solflare?.isSolflare,
    provider: () => window.solflare,
    install:  'https://solflare.com/',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    detect:   () => !!(window.backpack?.isBackpack),
    provider: () => window.backpack,
    install:  'https://backpack.app/',
  },
];

const walletPicker     = document.getElementById('wallet-picker');
const walletPickerList = document.getElementById('wallet-picker-list');
const walletPickerCls  = document.getElementById('wallet-picker-close');

function renderWalletPicker() {
  if (!walletPickerList) return;
  walletPickerList.innerHTML = WALLET_PROVIDERS.map(w => {
    const installed = w.detect();
    return `
      <button class="wallet-opt" data-wallet="${w.id}" data-installed="${installed ? '1' : '0'}">
        <span class="wallet-opt-name">${w.name}</span>
        <span class="wallet-opt-tag ${installed ? 'detected' : ''}">${installed ? 'DETECTED →' : 'INSTALL ↗'}</span>
      </button>
    `;
  }).join('');
}

function openWalletPicker()  { if (walletPicker) { renderWalletPicker(); walletPicker.setAttribute('aria-hidden', 'false'); } }
function closeWalletPicker() { if (walletPicker) walletPicker.setAttribute('aria-hidden', 'true'); }

if (walletPickerCls) walletPickerCls.addEventListener('click', closeWalletPicker);
if (walletPicker) {
  const bd = walletPicker.querySelector('.code-modal-backdrop');
  if (bd) bd.addEventListener('click', closeWalletPicker);
}

if (walletPickerList) {
  walletPickerList.addEventListener('click', (e) => {
    const opt = e.target.closest('.wallet-opt');
    if (!opt) return;
    const id = opt.dataset.wallet;
    const w  = WALLET_PROVIDERS.find(p => p.id === id);
    if (!w) return;
    if (!w.detect()) {
      window.open(w.install, '_blank', 'noopener,noreferrer');
      return;
    }
    const prov = w.provider();
    if (!prov || !prov.connect) return;
    prov.connect()
      .then(r => {
        const pk = r?.publicKey?.toString() || prov.publicKey?.toString();
        if (pk) { setConnected(pk); closeWalletPicker(); }
      })
      .catch(() => { /* user cancelled */ });
  });
}

function doConnect() {
  if (connected) { setDisconnected(); return; }
  openWalletPicker();
}

if (btn) btn.addEventListener('click', doConnect);

// ---------- TOP-BAR CONNECT (mirrors sidebar) ---------------------------
(function setupTopConnect() {
  const topBtn = document.getElementById('top-connect');
  if (!topBtn) return;
  topBtn.addEventListener('click', () => {
    if (connected) setDisconnected();
    else doConnect();
  });
})();

// ---------- CODE MODAL --------------------------------------------------
(function setupCodeModal() {
  const modal    = document.getElementById('code-modal');
  const closeBtn = document.getElementById('code-modal-close');
  const backdrop = modal && modal.querySelector('.code-modal-backdrop');
  if (!modal) return;
  const open  = () => modal.setAttribute('aria-hidden', 'false');
  const close = () => modal.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.code-trigger').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); open(); });
  });
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();

// ---------- FLOATING ROCKET FAB → CA POPUP TOGGLE -----------------------
(function setupCaPopup() {
  const fab      = document.getElementById('rocket-fab');
  const popup    = document.getElementById('ca-popup');
  const closeBtn = document.getElementById('ca-popup-close');
  if (!popup) return;

  // Default state at page load → popup OPEN.
  popup.setAttribute('aria-hidden', 'false');
  let isOpen = true;

  function setOpen(v) {
    isOpen = !!v;
    popup.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }

  if (fab) {
    fab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!isOpen);
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    });
  }
})();

// ---------- STRIP BLACK BG FROM ROCKET FAB IMAGE -----------------------
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

// ---------- COPY-TO-CLIPBOARD (CA popup addresses) ----------------------
document.querySelectorAll('.hero-addr-btn[data-addr]').forEach(btn => {
  btn.addEventListener('click', () => {
    const addr = btn.dataset.addr;
    const restore = () => setTimeout(() => { btn.textContent = 'copy'; }, 1500);
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
