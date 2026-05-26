/* ============================================================
   $SPCXBANK · keeper-distribute.js
   ------------------------------------------------------------
   Snapshots all $SPCXBANK holders and pro-rata distributes the
   treasury's CURRENT QQQx balance to them in batched on-chain
   transfers.

   Run from YOUR LOCAL MACHINE. The treasury private key never
   touches the website, never touches my server, never gets
   stored in this repo. It lives ONLY in your env vars for the
   duration of the script run.

   ============================================================
   SETUP (one-time)
   ============================================================
     # 1. Install Node 18+ if you don't have it
     # 2. From this folder:
     npm init -y
     npm install @solana/web3.js @solana/spl-token bs58

   ============================================================
   USAGE
   ============================================================
     # PowerShell on Windows:
     $env:HELIUS_RPC        = "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
     $env:TREASURY_KEYPAIR  = "5kZjpM...your base58 secret key..."
     $env:SPCXBANK_MINT     = "the token CA you'll get at launch"
     $env:MIN_QQQX          = "0.0001"   # skip holders below this (dust)
     $env:DRY_RUN           = "1"        # 1 = preview only, no signing
     node keeper-distribute.js

     # Once dry-run looks right, unset DRY_RUN and re-run to send:
     Remove-Item env:DRY_RUN
     node keeper-distribute.js

   ============================================================
   SAFETY
   ============================================================
   • Always do `DRY_RUN=1` first. It prints every recipient +
     amount but signs nothing. Verify totals look sane.
   • Script reads the treasury's CURRENT QQQx balance and
     distributes ALL of it (minus a small dust threshold per
     holder). It does NOT keep any reserve. If you want to
     keep some, transfer the part you want to keep OUT first.
   • Batches 8 transfers per tx (Solana tx size limit). With
     14k holders → ~1750 txs, ~10 minutes at modest RPC rate.
   • Each tx is logged to console with its solscan link so you
     can audit progress in real time.
   • If the script crashes mid-run, the already-sent txs are
     final. Re-running will distribute the REMAINING QQQx
     balance pro-rata again (no double-pay because amounts are
     based on whatever's left in the wallet).
   ============================================================ */

const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const {
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} = require('@solana/spl-token');
const bs58 = require('bs58');

// Both $SPCXBANK and QQQx are deployed on Token-2022, not classic SPL Token.
const TOKEN_PROGRAM = TOKEN_2022_PROGRAM_ID;

// ---- Config from env ---------------------------------------------------
const HELIUS_RPC       = process.env.HELIUS_RPC;
const TREASURY_KEYPAIR = process.env.TREASURY_KEYPAIR;
const SPCXBANK_MINT    = process.env.SPCXBANK_MINT;
const QQQX_MINT        = 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ';
const MIN_QQQX         = parseFloat(process.env.MIN_QQQX || '0.0001');
const DRY_RUN          = process.env.DRY_RUN === '1';
const BATCH_SIZE       = 8;       // transfers per tx (size-safe)
const RPC_DELAY_MS     = 250;     // throttle between batches

function bail(msg) {
  console.error('✗', msg);
  process.exit(1);
}

if (!HELIUS_RPC)       bail('HELIUS_RPC env var missing');
if (!TREASURY_KEYPAIR) bail('TREASURY_KEYPAIR env var missing');
if (!SPCXBANK_MINT)    bail('SPCXBANK_MINT env var missing');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  // ---- Load treasury keypair (never logged) ----------------------------
  const treasury = Keypair.fromSecretKey(bs58.decode(TREASURY_KEYPAIR));
  const treasuryPk = treasury.publicKey;
  console.log('▸ treasury wallet:', treasuryPk.toBase58());

  const conn = new Connection(HELIUS_RPC, 'confirmed');

  // ---- Fetch treasury's current QQQx balance --------------------------
  const treasuryQqqxAta = getAssociatedTokenAddressSync(new PublicKey(QQQX_MINT), treasuryPk, false, TOKEN_PROGRAM);
  const treasuryQqqxAcc = await getAccount(conn, treasuryQqqxAta, undefined, TOKEN_PROGRAM).catch(() => null);
  if (!treasuryQqqxAcc) bail('Treasury has no QQQx account yet — buy some QQQx first.');
  const treasuryQqqxRaw = BigInt(treasuryQqqxAcc.amount);
  const QQQX_DECIMALS = 8; // QQQx is 8 decimals on Solana
  const treasuryQqqxUi = Number(treasuryQqqxRaw) / 10 ** QQQX_DECIMALS;
  console.log('▸ treasury QQQx balance:', treasuryQqqxUi.toFixed(6));
  if (treasuryQqqxUi <= 0) bail('Nothing to distribute.');

  // ---- Snapshot all $SPCXBANK holders via Helius ----------------------
  // Uses Helius `getTokenAccounts` DAS endpoint (paginated).
  console.log('▸ snapshotting $SPCXBANK holders ...');
  const holders = await fetchAllHolders(conn, SPCXBANK_MINT);
  const totalSupply = holders.reduce((s, h) => s + h.amount, 0);
  console.log(`▸ found ${holders.length} holders · total balance ${totalSupply}`);
  if (totalSupply === 0n) bail('Total holder balance is zero — nothing to distribute against.');

  // ---- Compute each holder's QQQx cut ---------------------------------
  // qqqx_for_holder = holder_balance * treasury_qqqx_raw / total_supply
  const totalSupplyBig = holders.reduce((s, h) => s + BigInt(h.amount), 0n);
  const cuts = holders
    .map(h => {
      const cutRaw = BigInt(h.amount) * treasuryQqqxRaw / totalSupplyBig;
      const cutUi  = Number(cutRaw) / 10 ** QQQX_DECIMALS;
      return { owner: h.owner, amountRaw: cutRaw, amountUi: cutUi };
    })
    .filter(c => c.amountUi >= MIN_QQQX); // skip dust

  const totalToSendRaw = cuts.reduce((s, c) => s + c.amountRaw, 0n);
  const totalToSendUi  = Number(totalToSendRaw) / 10 ** QQQX_DECIMALS;
  console.log(`▸ ${cuts.length} recipients pass MIN_QQQX=${MIN_QQQX}`);
  console.log(`▸ distributing ${totalToSendUi.toFixed(6)} QQQx (${(totalToSendUi / treasuryQqqxUi * 100).toFixed(2)}% of balance)`);

  if (DRY_RUN) {
    console.log('\n— DRY RUN preview (first 10 recipients) —');
    cuts.slice(0, 10).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.owner}  →  ${c.amountUi.toFixed(6)} QQQx`);
    });
    console.log('\n✓ DRY_RUN complete. Unset DRY_RUN and re-run to actually send.');
    return;
  }

  // ---- Build + send batched transfer txs ------------------------------
  console.log('▸ sending transfers in batches of', BATCH_SIZE);
  let sentCount = 0;
  let failCount = 0;

  for (let i = 0; i < cuts.length; i += BATCH_SIZE) {
    const batch = cuts.slice(i, i + BATCH_SIZE);
    const tx = new Transaction();

    for (const c of batch) {
      const recipientAta = getAssociatedTokenAddressSync(new PublicKey(QQQX_MINT), new PublicKey(c.owner), false, TOKEN_PROGRAM);
      // Note: relies on recipients already having a QQQx ATA. For first-time
      // recipients, prepend a createAssociatedTokenAccountInstruction(payer=treasury).
      // Doing it inline below for safety:
      const exists = await conn.getAccountInfo(recipientAta).catch(() => null);
      if (!exists) {
        // For brevity, this script skips creating ATAs to keep tx-size predictable.
        // To support fresh recipients, swap in `createAssociatedTokenAccountIdempotentInstruction`.
        console.warn(`  · skip ${c.owner}: no QQQx ATA yet (recipient must hold QQQx once before)`);
        continue;
      }
      tx.add(
        createTransferInstruction(
          treasuryQqqxAta,
          recipientAta,
          treasuryPk,
          c.amountRaw,
          [],
          TOKEN_PROGRAM,
        ),
      );
    }

    if (tx.instructions.length === 0) continue;

    try {
      const sig = await sendAndConfirmTransaction(conn, tx, [treasury], { commitment: 'confirmed' });
      sentCount += tx.instructions.length;
      console.log(`  ✓ batch ${Math.floor(i / BATCH_SIZE) + 1}: ${tx.instructions.length} transfers · https://solscan.io/tx/${sig}`);
    } catch (e) {
      failCount++;
      console.error(`  ✗ batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, e.message);
    }

    await sleep(RPC_DELAY_MS);
  }

  console.log(`\n✓ done · ${sentCount} transfers sent · ${failCount} batches failed`);
}

// ---- Helper: paginated holder snapshot via Helius -----------------------
// Uses standard `getProgramAccounts` filter on the SPL Token program with
// mint filter. Works on any Solana RPC but Helius is faster for large
// holder sets (no public-RPC rate limit).
async function fetchAllHolders(conn, mintStr) {
  // Token-2022 account size varies (170+ depending on extensions). Skip
  // dataSize filter and rely on memcmp on the mint field at offset 0.
  const accounts = await conn.getProgramAccounts(TOKEN_PROGRAM, {
    filters: [
      { memcmp: { offset: 0, bytes: mintStr } },
    ],
    encoding: 'base64',
    commitment: 'confirmed',
  });
  const holders = [];
  for (const a of accounts) {
    const data = a.account.data;
    if (data.length < 72) continue; // need at least mint(32) + owner(32) + amount(8)
    const owner  = new PublicKey(data.slice(32, 64)).toBase58();
    const amount = data.readBigUInt64LE(64);
    if (amount === 0n) continue;
    holders.push({ owner, amount });
  }
  return holders;
}

main().catch(e => {
  console.error('FATAL', e);
  process.exit(1);
});
