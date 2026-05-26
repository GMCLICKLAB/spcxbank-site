/* ============================================================
   $SPCXBANK · Solana RPC layer
   ------------------------------------------------------------
   ONE switch to flip at launch: set SPCXBANK_MINT to the real
   mint address. Everything else (treasury balance / holders /
   distributions / activity feed) will flow from this file.
   ============================================================ */

// ===== CONFIG ============================================================
// Treasury wallet — deployer, fee receiver, QQQx buyer, distributor.
const TREASURY_WALLET = 'GRefsnCKo9QELRL7L2bQnkKM6u1Y16VgmkX8U4HDAcFT';

// $SPCXBANK token mint — null until launch. Set this to enable holder /
// supply / per-holder allocation reads.
const SPCXBANK_MINT   = 'FEaM9Pj1T95BqficUrZm9EaXx7fR8sbgBMLgggR4pump'; // ⟵ LIVE 2026-05-26

// QQQx (Backed Finance · Nasdaq-100 tokenized ETF) on Solana.
const QQQX_MINT       = 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ';

// Both $SPCXBANK (pump.fun) and QQQx (Backed) are deployed on the new
// Token-2022 program, NOT the classic SPL Token program. All token-account
// queries below must pass this program ID explicitly — otherwise the RPC
// only searches classic SPL Token and returns nothing.
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// Solana RPC — Helius mainnet endpoint (user's project key).
// NOTE: This key is exposed to anyone who inspects the served JS. That is
// the standard pattern for browser-side Solana apps. Lock down usage by
// configuring "Allowed origins" in the Helius dashboard once the site has
// a real domain (e.g. spcxbank.com) so other origins can't burn the quota.
const SOLANA_RPC = 'https://mainnet.helius-rpc.com/?api-key=c6972c14-f9a2-49cd-8faf-a3cea0b949cf';

// Refresh cadence for on-chain reads.
const ONCHAIN_REFRESH_MS = 60000;


// ===== RPC HELPER ========================================================
async function rpc(method, params) {
  const res = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error('RPC ' + res.status + ' on ' + method);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}


// ===== TREASURY READS (work pre-launch — wallet already exists) ==========

// SOL balance currently sitting in treasury (= fees waiting for next sweep).
async function getTreasurySol() {
  const r = await rpc('getBalance', [TREASURY_WALLET]);
  return r.value / 1e9; // lamports → SOL
}

// QQQx balance currently held by treasury (= "bank" balance).
async function getTreasuryQQQx() {
  const r = await rpc('getTokenAccountsByOwner', [
    TREASURY_WALLET,
    { programId: TOKEN_2022_PROGRAM },
    { encoding: 'jsonParsed' },
  ]);
  const match = (r.value || []).find(a => a.account.data.parsed.info.mint === QQQX_MINT);
  if (!match) return 0;
  return parseFloat(match.account.data.parsed.info.tokenAmount.uiAmountString);
}

// Recent signatures FROM the treasury wallet (powers distribution ledger
// and activity feed). Each entry is { signature, blockTime, ... }.
// Parsing the tx to know whether it's a sweep / distribute / etc requires
// fetching each with getTransaction — heavy. Helius webhooks are the
// production-grade alternative.
async function getTreasuryActivity(limit = 50) {
  return await rpc('getSignaturesForAddress', [TREASURY_WALLET, { limit }]);
}


// ===== $SPCXBANK TOKEN READS (only work after SPCXBANK_MINT is set) ======

async function getSpcxbankSupply() {
  if (!SPCXBANK_MINT) return null;
  const r = await rpc('getTokenSupply', [SPCXBANK_MINT]);
  return parseFloat(r.value.uiAmountString);
}

// Top 20 holders via standard RPC. For the full 14k+ holder count you
// will need Helius DAS `getTokenAccounts` or an indexer — RPC will not
// return all holders in a single call.
async function getSpcxbankTopHolders() {
  if (!SPCXBANK_MINT) return null;
  const r = await rpc('getTokenLargestAccounts', [SPCXBANK_MINT]);
  return r.value; // [{ address, amount, decimals, uiAmount, uiAmountString }, ...]
}

// $SPCXBANK price — RPC can't give you this. At launch wire to one of:
//   • Jupiter price API: https://api.jup.ag/price/v2?ids=<MINT>
//   • DexScreener: https://api.dexscreener.com/latest/dex/tokens/<MINT>
//   • Birdeye (requires API key)
async function getSpcxbankPrice() {
  if (!SPCXBANK_MINT) return null;
  try {
    const r = await fetch(`https://api.jup.ag/price/v2?ids=${SPCXBANK_MINT}`);
    const d = await r.json();
    return d?.data?.[SPCXBANK_MINT]?.price ? parseFloat(d.data[SPCXBANK_MINT].price) : null;
  } catch (_) { return null; }
}


// ===== USER-WALLET READS (called after user connects in dashboard) =======

// Helper: find a wallet's balance for a specific Token-2022 mint by
// querying all of the wallet's Token-2022 accounts and filtering by mint.
async function getUserToken2022Balance(wallet, mintStr) {
  try {
    const r = await rpc('getTokenAccountsByOwner', [
      wallet,
      { programId: TOKEN_2022_PROGRAM },
      { encoding: 'jsonParsed' },
    ]);
    const match = (r.value || []).find(a => a.account.data.parsed.info.mint === mintStr);
    if (!match) return 0;
    return parseFloat(match.account.data.parsed.info.tokenAmount.uiAmountString);
  } catch (e) { console.warn('getUserToken2022Balance', mintStr, e); return null; }
}

// Returns the connected wallet's $SPCXBANK balance, 0 if no token account,
// or null pre-launch (mint not set).
async function getUserSpcxbankBalance(wallet) {
  if (!SPCXBANK_MINT) return null;
  return getUserToken2022Balance(wallet, SPCXBANK_MINT);
}

// Returns the connected wallet's QQQx balance, 0 if no token account.
async function getUserQqqxBalance(wallet) {
  return getUserToken2022Balance(wallet, QQQX_MINT);
}

// Live QQQx USD price from DexScreener, fallback to Jupiter.
async function getQqqxPriceUsd() {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${QQQX_MINT}`);
    if (res.ok) {
      const data = await res.json();
      const px = parseFloat(data?.pairs?.[0]?.priceUsd);
      if (isFinite(px) && px > 0) return px;
    }
  } catch (_) {}
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${QQQX_MINT}`);
    if (res.ok) {
      const data = await res.json();
      const px = parseFloat(data?.data?.[QQQX_MINT]?.price);
      if (isFinite(px) && px > 0) return px;
    }
  } catch (_) {}
  return null;
}


// ===== HIGH-LEVEL ORCHESTRATOR ===========================================
// Each page (index.js / app.js) wires its own DOM updates. This function
// just returns a snapshot. Pages call it on load + on interval.
async function snapshotOnChain() {
  // Always-available reads (treasury exists today):
  const base = {};
  try { base.sol         = await getTreasurySol();        } catch (e) { console.warn('sol', e); }
  try { base.qqqxInBank  = await getTreasuryQQQx();       } catch (e) { console.warn('qqqx', e); }
  try { base.recentTxs   = await getTreasuryActivity(20); } catch (e) { console.warn('activity', e); }

  // Token-dependent reads (only post-launch):
  if (SPCXBANK_MINT) {
    try { base.supply      = await getSpcxbankSupply();       } catch (e) { console.warn('supply', e); }
    try { base.topHolders  = await getSpcxbankTopHolders();   } catch (e) { console.warn('top holders', e); }
    try { base.price       = await getSpcxbankPrice();        } catch (e) { console.warn('price', e); }
  }
  return base;
}

// ===== LIVE STAT-CARD UPDATERS (run on every page that loads solana.js) ==
// Wires the 4 $SPCXBANK ON-CHAIN DATA cards (price / mcap / holders / 24h
// vol) + 2 DISTRIBUTED cards from DexScreener + Helius. Both index.html
// and app.html share the same IDs so this single fetcher updates both.

function fmtCompactUsd(n) {
  if (!isFinite(n) || n <= 0) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  if (n >= 1)   return '$' + n.toFixed(2);
  return '$' + n.toFixed(6);
}
function setStatValue(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function setStatDelta(valueId, text) {
  const v = document.getElementById(valueId);
  const card = v && v.parentElement;
  const delta = card && card.querySelector('.stat-delta');
  if (delta) delta.textContent = text;
}

// 1. $SPCXBANK price / mcap / 24h vol via DexScreener
async function refreshSpcxbankMarketStats() {
  if (!SPCXBANK_MINT) return;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${SPCXBANK_MINT}`);
    if (!res.ok) return;
    const data = await res.json();
    const pair = data?.pairs?.[0];
    if (!pair) return;

    const priceUsd = parseFloat(pair.priceUsd);
    const mcap     = parseFloat(pair.fdv || pair.marketCap); // for pump.fun, FDV = mcap (fixed 1B supply)
    const vol24h   = parseFloat(pair?.volume?.h24);
    const ch24     = parseFloat(pair?.priceChange?.h24);

    if (isFinite(priceUsd) && priceUsd > 0) {
      setStatValue('spcxbank-price-stat', fmtCompactUsd(priceUsd));
      if (isFinite(ch24)) {
        setStatDelta('spcxbank-price-stat', (ch24 >= 0 ? '▲ +' : '▼ ') + Math.abs(ch24).toFixed(2) + '% · 24H');
      }
    }
    if (isFinite(mcap) && mcap > 0) {
      setStatValue('spcxbank-mcap-stat', fmtCompactUsd(mcap));
      setStatDelta('spcxbank-mcap-stat', 'PRICE × 1B SUPPLY');
    }
    if (isFinite(vol24h) && vol24h > 0) {
      setStatValue('spcxbank-vol-stat', fmtCompactUsd(vol24h));
      setStatDelta('spcxbank-vol-stat', 'LAST 24H');
    }
  } catch (e) { console.warn('refreshSpcxbankMarketStats failed', e); }
}

// 2. $SPCXBANK holders count via RPC getProgramAccounts on Token-2022.
async function refreshSpcxbankHoldersCount() {
  if (!SPCXBANK_MINT) return;
  try {
    // Token-2022 account size differs from classic (165) — use the standard
    // Account-with-mint extension layout (~170 bytes for the basic case).
    // Safer: omit dataSize filter and let memcmp on mint do the work.
    const accounts = await rpc('getProgramAccounts', [
      TOKEN_2022_PROGRAM,
      {
        filters: [
          { memcmp: { offset: 0, bytes: SPCXBANK_MINT } },
        ],
        encoding: 'jsonParsed',
        commitment: 'confirmed',
      },
    ]);
    const count = (accounts || []).filter(a => {
      const info = a.account?.data?.parsed?.info;
      if (!info) return false;
      const amt = parseFloat(info.tokenAmount?.uiAmountString || '0');
      return amt > 0;
    }).length;
    setStatValue('spcxbank-holders-stat', count.toLocaleString());
    setStatDelta('spcxbank-holders-stat', count === 1 ? 'WALLET HOLDING' : 'WALLETS HOLDING');
  } catch (e) { console.warn('refreshSpcxbankHoldersCount failed', e); }
}

// ===== TREASURY ENHANCED TX (Helius parsed transactions) =================
// Single source of truth for everything DISTRIBUTIONS / PURCHASES related.
// Helius parses SPL token transfers + Jupiter swaps for us — much cleaner
// than calling getTransaction() per signature.

const HELIUS_API_KEY = SOLANA_RPC.split('api-key=')[1] || '';
let _treasuryTxCache = null;
let _treasuryTxFetchedAt = 0;
const TREASURY_TX_CACHE_MS = 25_000; // 25s — multiple consumers share one fetch

async function getTreasuryEnhancedTxs(limit = 100) {
  const now = Date.now();
  if (_treasuryTxCache && (now - _treasuryTxFetchedAt) < TREASURY_TX_CACHE_MS) return _treasuryTxCache;
  try {
    const url = `https://api.helius.xyz/v0/addresses/${TREASURY_WALLET}/transactions?api-key=${HELIUS_API_KEY}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return _treasuryTxCache || [];
    _treasuryTxCache = await res.json();
    _treasuryTxFetchedAt = now;
    return _treasuryTxCache;
  } catch (e) {
    console.warn('getTreasuryEnhancedTxs failed', e);
    return _treasuryTxCache || [];
  }
}

// Extract all QQQx transfers from treasury tx history.
// direction: 'out' (treasury→others, = distributions to holders)
//         or 'in'  (others→treasury, = jupiter swap outputs / refills)
function extractQqqxTransfers(txs, direction) {
  const out = [];
  for (const tx of txs) {
    for (const t of (tx.tokenTransfers || [])) {
      if (t.mint !== QQQX_MINT) continue;
      const isOut = t.fromUserAccount === TREASURY_WALLET;
      const isIn  = t.toUserAccount   === TREASURY_WALLET;
      if (direction === 'out' && !isOut) continue;
      if (direction === 'in'  && !isIn)  continue;
      out.push({
        signature: tx.signature,
        timestamp: tx.timestamp,
        type:      tx.type,
        source:    tx.source,
        from:      t.fromUserAccount,
        to:        t.toUserAccount,
        amount:    parseFloat(t.tokenAmount),
      });
    }
  }
  return out;
}

// Sum SOL spent in Jupiter swaps where Treasury bought QQQx (for PURCHASES rows).
function extractTreasuryJupiterBuys(txs) {
  const buys = [];
  for (const tx of txs) {
    if (tx.source !== 'JUPITER') continue;
    let solOut = 0;
    let qqqxIn = 0;
    for (const t of (tx.tokenTransfers || [])) {
      if (t.fromUserAccount === TREASURY_WALLET && t.mint === 'So11111111111111111111111111111111111111112') {
        solOut += parseFloat(t.tokenAmount);
      }
      if (t.toUserAccount === TREASURY_WALLET && t.mint === QQQX_MINT) {
        qqqxIn += parseFloat(t.tokenAmount);
      }
    }
    // Also count native SOL transfers (some Jupiter routes use native SOL not wrapped)
    for (const nat of (tx.nativeTransfers || [])) {
      if (nat.fromUserAccount === TREASURY_WALLET) solOut += (nat.amount || 0) / 1e9;
    }
    if (qqqxIn > 0 && solOut > 0) {
      buys.push({
        signature: tx.signature,
        timestamp: tx.timestamp,
        solIn: solOut,
        qqqxOut: qqqxIn,
      });
    }
  }
  return buys;
}

// DISTRIBUTED · QQQx + USD stat cards.
async function refreshDistributedStats() {
  if (!SPCXBANK_MINT) return;
  try {
    const [txs, qqqxPx] = await Promise.all([
      getTreasuryEnhancedTxs(100),
      getQqqxPriceUsd(),
    ]);
    const out = extractQqqxTransfers(txs, 'out');
    const totalQqqx = out.reduce((s, t) => s + t.amount, 0);
    const totalUsd  = qqqxPx ? totalQqqx * qqqxPx : 0;

    setStatValue('distributed-qqqx-stat', totalQqqx > 0 ? totalQqqx.toFixed(2) : '0');
    setStatDelta('distributed-qqqx-stat', totalQqqx > 0 ? `ACROSS ${out.length} TRANSFERS` : 'AWAITING FIRST SWEEP');

    setStatValue('distributed-usd-stat', totalUsd > 0 ? fmtCompactUsd(totalUsd) : '$0');
    setStatDelta('distributed-usd-stat', totalQqqx > 0 ? 'AT CURRENT QQQx PRICE' : 'AWAITING FIRST SWEEP');
  } catch (e) { console.warn('refreshDistributedStats failed', e); }
}

// Run all refreshers on load + every 30s.
function refreshAllSpcxbankStats() {
  refreshSpcxbankMarketStats();
  refreshSpcxbankHoldersCount();
  refreshDistributedStats();
}
if (SPCXBANK_MINT) {
  refreshAllSpcxbankStats();
  setInterval(refreshAllSpcxbankStats, 30000);
}


// ===== NOTES FOR LAUNCH ==================================================
// Wire-up checklist when the mint goes live:
//   1. Set SPCXBANK_MINT above to the real address.
//   2. Swap SOLANA_RPC to Helius (or another paid endpoint).
//   3. In main.js / app.js, replace `PRE-LAUNCH` ticker cells via
//      updateTickerCell(...) using values from snapshotOnChain().
//   4. For exact holder count (>20 wallets) and historical cumulative
//      distributed amount, switch to Helius DAS or a dedicated indexer.
//      RPC alone cannot answer those efficiently.
//   5. For the live activity feed, prefer Helius webhooks over polling
//      signatures every minute.
//
// ----- ON-CHAIN DATA stat cards (index.html → #treasury) ----------------
// Post-launch, replace `PRE-LAUNCH` delta text with:
//   #spcxbank-price-stat   delta:  ▲ +12.4% · 24H   (sign + colour by sign)
//   #qqqx-price-stat       delta:  NASDAQ-100 · xSTOCK   (static; live now)
//   #distributed-stat      delta:  ACROSS 1,024 DISTRIBUTIONS   (live count)
//   #next-sweep            delta:  EVERY 5 MIN   (static)
// Until SPCXBANK_MINT is set, NEXT DISTRIBUTION shows static "5m 00s";
// the live countdown kicks in automatically once the mint constant is set.
