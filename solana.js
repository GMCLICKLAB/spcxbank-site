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
const SPCXBANK_MINT   = null; // ⟵ FILL IN AT LAUNCH

// QQQx (Backed Finance · Nasdaq-100 tokenized ETF) on Solana.
const QQQX_MINT       = 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ';

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
    { mint: QQQX_MINT },
    { encoding: 'jsonParsed' },
  ]);
  if (!r.value.length) return 0;
  return parseFloat(r.value[0].account.data.parsed.info.tokenAmount.uiAmountString);
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

// Returns the connected wallet's $SPCXBANK balance, 0 if no token account,
// or null pre-launch (mint not set).
async function getUserSpcxbankBalance(wallet) {
  if (!SPCXBANK_MINT) return null;
  try {
    const r = await rpc('getTokenAccountsByOwner', [
      wallet,
      { mint: SPCXBANK_MINT },
      { encoding: 'jsonParsed' },
    ]);
    if (!r.value.length) return 0;
    return parseFloat(r.value[0].account.data.parsed.info.tokenAmount.uiAmountString);
  } catch (e) { console.warn('getUserSpcxbankBalance', e); return null; }
}

// Returns the connected wallet's QQQx balance, 0 if no token account.
async function getUserQqqxBalance(wallet) {
  try {
    const r = await rpc('getTokenAccountsByOwner', [
      wallet,
      { mint: QQQX_MINT },
      { encoding: 'jsonParsed' },
    ]);
    if (!r.value.length) return 0;
    return parseFloat(r.value[0].account.data.parsed.info.tokenAmount.uiAmountString);
  } catch (e) { console.warn('getUserQqqxBalance', e); return null; }
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
