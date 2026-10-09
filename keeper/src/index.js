// Feeverage keeper: flap.sh trade tax on BNB Chain -> leveraged Hyperliquid positions.
//
// Tokens are launched from the website on flap.sh as tax tokens whose tax beneficiary is
// this operator wallet, with their strategy tag in the IPFS description.
// Every cycle the keeper:
//   1. discover  new flap.sh launches whose tax goes to the operator and that carry a tag
//   2. account   each token's tax already paid to the operator (Tax Token Helper)
//   3. bridge    each token's share of BNB to its own Hyperliquid account (Relay)
//   4. trade     free margin × leverage into the token's market and side
//   5. serve     /status.json for the website's stats and token book
//
// One seed phrase runs everything: account #0 is the operator (receives the tax and pays
// gas), accounts #1, #2, … are the Hyperliquid accounts of token #0, #1, …
import { createPublicClient, createWalletClient, formatEther, http, parseAbi, parseAbiItem } from "viem";
import { bsc } from "viem/chains";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { createServer } from "node:http";
import { loadState, saveState, tokenState, pendingWei } from "./state.js";
import { quoteDeposit, executeDeposit, relayRouteSupported } from "./bridge.js";
import { hlAccountFor, loadMarkets, nativeUsd, topUpPosition, accountSummary } from "./hl.js";
import { parseStrategy } from "./strategy.js";

const env = (k, d) => {
  const v = process.env[k] || d;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

const cfg = {
  rpcUrl: env("RPC_URL", "https://bsc-rpc.publicnode.com"),
  portal: env("FLAP_PORTAL", "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0"),
  helper: env("FLAP_TAX_HELPER", "0x53841c73217735F37BC1775538b03b23feFD8346"),
  ipfs: env("IPFS_GATEWAY", "https://flap.mypinata.cloud/ipfs/"),
  startBlock: BigInt(env("START_BLOCK", "0")),
  mnemonic: env("SEED_PHRASE", process.env.HL_MNEMONIC),
  operatorKey: process.env.OPERATOR_PRIVATE_KEY || "",
  pollSeconds: Number(env("POLL_SECONDS", "300")),
  gasReserveWei: BigInt(env("GAS_RESERVE_WEI", "3000000000000000")),
  minBridgeUsd: Number(env("MIN_BRIDGE_USD", "12")),
  minOrderUsd: Number(env("MIN_ORDER_USD", "11")),
  marginUse: Number(env("MARGIN_USE", "0.95")),
  slippage: Number(env("SLIPPAGE", "0.01")),
  relayApi: env("RELAY_API", "https://api.relay.link"),
  hlRelayChainId: Number(env("HL_RELAY_CHAIN_ID", "1337")),
  hlRelayUsdc: env("HL_RELAY_USDC", "0x00000000000000000000000000000000"),
  port: Number(env("PORT", "8787")),
  logChunk: BigInt(env("LOG_CHUNK", "5000")),
  dryRun: env("DRY_RUN", "true") !== "false",
};

const EV_CREATED = parseAbiItem("event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)");
const HELPER_ABI = parseAbi([
  "function getTaxTokenInfo(address taxToken) view returns ((uint16 marketBps, uint16 deflationBps, uint16 lpBps, uint16 dividendBps, uint16 taxRate, uint256 burntTokenAmount, uint256 totalQuoteSentToDividend, uint256 totalQuoteAddedToLiquidity, uint256 totalTokenAddedToLiquidity, uint256 totalQuoteSentToMarketing, address marketingWallet, address quoteToken, uint256 minimumShareBalance))",
]);
const PORTAL_ABI = parseAbi([
  "function getTokenV6(address token) view returns ((uint8 status, uint256 reserve, uint256 circulatingSupply, uint256 price, uint8 tokenVersion, uint256 r, uint256 h, uint256 k, uint256 dexSupplyThresh, address quoteTokenAddress, bool nativeToQuoteSwapEnabled, bytes32 extensionID, uint256 taxRate, address pool, uint256 progress))",
]);
const STATUS_DEX = 4;

// Operator = account #0 of the seed phrase (or an explicit private key, if set).
const operator = cfg.operatorKey ? privateKeyToAccount(cfg.operatorKey) : mnemonicToAccount(cfg.mnemonic, { addressIndex: 0 });
const op = operator.address.toLowerCase();
const chain = { ...bsc, rpcUrls: { default: { http: [cfg.rpcUrl] } } };
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl, { batch: false, retryCount: 3 }) });
const walletClient = createWalletClient({ chain, transport: http(cfg.rpcUrl), account: operator });
const log = (...a) => console.log(new Date().toISOString(), ...a);

let state = loadState();
let status = { updatedAt: null, operator: operator.address, dryRun: cfg.dryRun, chainId: 56, native: "BNB", totals: {}, tokens: [] };

// ---------------------------------------------------------------- helpers

async function scan(fromKey, fn) {
  const latest = await publicClient.getBlockNumber();
  let from = state[fromKey] ? BigInt(state[fromKey]) + 1n : cfg.startBlock;
  if (from === 0n) {
    from = latest;
    log(`${fromKey}: START_BLOCK not set, starting at the current block ${latest}`);
  }
  let chunk = cfg.logChunk;
  while (from <= latest) {
    const to = from + chunk - 1n > latest ? latest : from + chunk - 1n;
    try {
      await fn(from, to);
    } catch (e) {
      if (e.keepRange || chunk <= 200n) throw e;
      chunk /= 4n; // the RPC refused the range: try smaller ones
      continue;
    }
    state[fromKey] = String(to);
    saveState(state);
    from = to + 1n;
  }
}

async function fetchMeta(cid) {
  try {
    const r = await fetch(cfg.ipfs + cid, { signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 1. discover

async function discover() {
  await scan("launchBlock", async (fromBlock, toBlock) => {
    const logs = await publicClient.getLogs({ address: cfg.portal, event: EV_CREATED, fromBlock, toBlock });
    if (!logs.length) return;
    // flap.sh launches thousands of tokens: check all their tax receivers in one multicall.
    const infos = await publicClient.multicall({
      contracts: logs.map((e) => ({ address: cfg.helper, abi: HELPER_ABI, functionName: "getTaxTokenInfo", args: [e.args.token] })),
      allowFailure: true,
    });
    for (let i = 0; i < logs.length; i++) {
      const e = logs[i], info = infos[i];
      if (info.status !== "success" || info.result.marketingWallet.toLowerCase() !== op) continue;
      const token = e.args.token;
      if (state.registry.some((r) => r.token.toLowerCase() === token.toLowerCase())) continue;
      let meta = null;
      for (let k = 0; k < 3 && !meta; k++) meta = await fetchMeta(e.args.meta);
      const strat = parseStrategy(meta?.description);
      if (!strat) {
        if (!meta) log(`  ${e.args.symbol}: metadata ${e.args.meta} not reachable yet, will retry`);
        if (!meta) throw Object.assign(new Error("IPFS not reachable"), { keepRange: true }); // rescans this range next cycle
        continue;
      }
      const index = state.registry.length;
      state.registry.push({
        index, token, deployer: e.args.creator, name: e.args.name, symbol: e.args.symbol, meta: e.args.meta, ...strat,
        launchedBlock: String(e.blockNumber), launchTx: e.transactionHash,
        hlAccount: hlAccountFor(cfg.mnemonic, index).address,
      });
      log(`new token #${index} ${e.args.symbol} → ${strat.leverage}x ${strat.isLong ? "long" : "short"} ${strat.market}`);
    }
  });
}

// ---------------------------------------------------------------- 2. account

// flap.sh keeps a running total of the tax each token has paid to its receiver.
// That total, per token, is exactly what the operator wallet received for it.
async function account() {
  if (!state.registry.length) return;
  const res = await publicClient.multicall({
    contracts: state.registry.flatMap((r) => [
      { address: cfg.helper, abi: HELPER_ABI, functionName: "getTaxTokenInfo", args: [r.token] },
      { address: cfg.portal, abi: PORTAL_ABI, functionName: "getTokenV6", args: [r.token] },
    ]),
    allowFailure: true,
  });
  state.registry.forEach((r, i) => {
    const info = res[2 * i], st = res[2 * i + 1];
    if (st.status === "success") r.graduated = Number(st.result.status) === STATUS_DEX;
    if (info.status !== "success") return;
    const ts = tokenState(state, r.token);
    const sent = info.result.totalQuoteSentToMarketing;
    if (sent > BigInt(ts.creditedWei)) {
      log(`  +${formatEther(sent - BigInt(ts.creditedWei))} BNB tax from ${r.symbol}`);
      ts.creditedWei = sent.toString();
    }
  });
}

// ---------------------------------------------------------------- 3. bridge

async function bridge(r, ts, bnbPrice) {
  const pending = pendingWei(ts);
  const usd = Number(formatEther(pending)) * bnbPrice;
  if (pending <= 0n || usd < cfg.minBridgeUsd) return;
  const balance = await publicClient.getBalance({ address: operator.address });
  if (balance - cfg.gasReserveWei < pending) {
    log(`#${r.index} ${r.symbol}: ${formatEther(pending)} BNB owed, wallet has ${formatEther(balance)} BNB (keeps ${formatEther(cfg.gasReserveWei)} for gas)`);
    return;
  }
  log(`#${r.index} bridge ${formatEther(pending)} BNB (~$${usd.toFixed(2)}) → Hyperliquid ${r.hlAccount}`);
  if (cfg.dryRun) return;
  const quote = await quoteDeposit(cfg, { user: operator.address, recipient: r.hlAccount, amountWei: pending });
  // Book it first: a crash mid-bridge must never send the same BNB twice.
  ts.bridgedWei = (BigInt(ts.bridgedWei) + pending).toString();
  saveState(state);
  try {
    const requestId = await executeDeposit(cfg, { quote, walletClient, publicClient, log });
    ts.bridgedUsd += usd;
    ts.bridges.push({ at: new Date().toISOString(), wei: pending.toString(), usd, requestId });
  } catch (e) {
    ts.bridgedWei = (BigInt(ts.bridgedWei) - pending).toString();
    ts.failedWei = (BigInt(ts.failedWei) + pending).toString();
    log(`  bridge FAILED, ${formatEther(pending)} BNB parked in failedWei for review: ${e.message}`);
  }
}

// ---------------------------------------------------------------- 4. trade

async function trade(r, ts, markets) {
  const market = markets.get(r.market);
  if (!market || market.delisted) return log(`#${r.index} market ${r.market} not on Hyperliquid, skipping`);
  const account = hlAccountFor(cfg.mnemonic, r.index);
  const order = await topUpPosition({ account, launch: r, market, cfg, ts, log });
  if (order && !order.dryRun) ts.orders.push({ at: new Date().toISOString(), ...order });
}

// ---------------------------------------------------------------- 5. status

async function buildStatus(bnbPrice) {
  const tokens = [];
  let fees = 0, deployed = 0, equity = 0, notional = 0, pnl = 0;
  for (const r of state.registry) {
    const ts = tokenState(state, r.token);
    let hl = null;
    try {
      hl = await accountSummary(r.hlAccount);
    } catch {}
    const pos = hl?.positions.find((p) => p.coin === r.market);
    const t = {
      index: r.index, token: r.token, deployer: r.deployer, name: r.name, symbol: r.symbol, meta: r.meta,
      market: r.market, isLong: r.isLong, leverage: r.leverage, hlAccount: r.hlAccount, graduated: Boolean(r.graduated),
      launchedBlock: r.launchedBlock, block: Number(r.launchedBlock),
      // amounts in BNB (field names are shared with the website)
      feesEth: Number(formatEther(BigInt(ts.creditedWei))),
      pendingEth: Number(formatEther(pendingWei(ts))),
      bridgedUsd: ts.bridgedUsd,
      equityUsd: hl?.accountValue ?? 0,
      notionalUsd: pos ? Math.abs(Number(pos.positionValue)) : 0,
      pnlUsd: pos ? Number(pos.unrealizedPnl) : 0,
      szi: pos ? Number(pos.szi) : 0,
      entryPx: pos ? Number(pos.entryPx) : null,
      liqPx: pos?.liquidationPx ? Number(pos.liquidationPx) : null,
    };
    fees += t.feesEth; deployed += t.bridgedUsd; equity += t.equityUsd; notional += t.notionalUsd; pnl += t.pnlUsd;
    tokens.push(t);
  }
  status = {
    updatedAt: new Date().toISOString(), operator: operator.address, dryRun: cfg.dryRun, chainId: 56, native: "BNB", nativeUsd: bnbPrice,
    totals: { tokens: tokens.length, feesEth: fees, feesUsd: fees * bnbPrice, deployedUsd: deployed, equityUsd: equity, notionalUsd: notional, pnlUsd: pnl },
    tokens,
  };
}

function serve() {
  createServer((req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("cache-control", "no-store");
    if (req.url.startsWith("/status.json")) {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify(status));
    }
    res.statusCode = 404;
    res.end("not found");
  }).listen(cfg.port, () => log(`status API on :${cfg.port}/status.json`));
}

// ---------------------------------------------------------------- loop

async function cycle() {
  const [markets, bnbPrice] = await Promise.all([loadMarkets(), nativeUsd("BNB")]);
  await discover();
  await account();
  log(`cycle: ${state.registry.length} tokens, BNB $${bnbPrice}${cfg.dryRun ? " [DRY RUN]" : ""}`);
  for (const r of state.registry) {
    const ts = tokenState(state, r.token);
    try {
      await bridge(r, ts, bnbPrice);
      await trade(r, ts, markets);
    } catch (e) {
      log(`#${r.index} error: ${e.shortMessage ?? e.message}`);
    } finally {
      saveState(state);
    }
  }
  await buildStatus(bnbPrice);
}

async function check() {
  log(`operator ${operator.address} (${formatEther(await publicClient.getBalance({ address: operator.address }))} BNB)`);
  log(`chain id ${await publicClient.getChainId()} (BNB Chain = 56)`);
  log(`latest block ${await publicClient.getBlockNumber()}  ← use this as START_BLOCK and in the website config`);
  const route = await relayRouteSupported(cfg);
  log(`Relay route BNB Chain(56)=${route.origin} → Hyperliquid(${cfg.hlRelayChainId})=${route.destination}`);
  log(`Hyperliquid account for token #0: ${hlAccountFor(cfg.mnemonic, 0).address}`);
  log(`put the operator address in the website config.js → feeRecipient`);
}

const args = process.argv.slice(2);
if (args.includes("--check")) await check();
else if (args.includes("--once")) await cycle();
else {
  serve();
  for (;;) {
    try {
      await cycle();
    } catch (e) {
      log(`cycle error: ${e.shortMessage ?? e.message}`);
    }
    await new Promise((r) => setTimeout(r, cfg.pollSeconds * 1000));
  }
}
