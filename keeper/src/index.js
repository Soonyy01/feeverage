// Feeverage keeper: token trading fees on Robinhood Chain -> leveraged Hyperliquid positions.
//
// Tokens are launched straight from the website through the launchpad router with
// creatorFeeRecipient = this operator wallet, and their strategy tag in the description.
// Every cycle the keeper:
//   1. discover  new launches whose fee recipient is the operator and that carry a tag
//   2. account   creator fees per token from the curve / pool FeesSwept events
//   3. claim     the operator's escrow balance, and sweep graduated pools' fees
//   4. bridge    each token's share of ETH to its own Hyperliquid account (Relay)
//   5. trade     free margin × leverage into the token's market and side
//   6. serve     /status.json for the website's stats and token book
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseAbi, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createServer } from "node:http";
import { loadState, saveState, tokenState, pendingWei, add } from "./state.js";
import { quoteDeposit, executeDeposit, relayRouteSupported } from "./bridge.js";
import { hlAccountFor, loadMarkets, ethUsd, topUpPosition, accountSummary } from "./hl.js";
import { parseStrategy } from "./strategy.js";

const env = (k, d) => {
  const v = process.env[k] || d;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

const cfg = {
  rpcUrl: env("RPC_URL", "https://rpc.mainnet.chain.robinhood.com"),
  factory: env("LAUNCH_FACTORY", "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e"),
  escrow: env("FEE_ESCROW", "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e"),
  hook: env("POOL_HOOK", "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044"),
  startBlock: BigInt(env("START_BLOCK", "0")),
  operatorKey: env("OPERATOR_PRIVATE_KEY"),
  mnemonic: env("HL_MNEMONIC"),
  pollSeconds: Number(env("POLL_SECONDS", "300")),
  minClaimWei: BigInt(env("MIN_CLAIM_WEI", "1000000000000000")),
  gasReserveWei: BigInt(env("GAS_RESERVE_WEI", "3000000000000000")),
  minBridgeUsd: Number(env("MIN_BRIDGE_USD", "12")),
  minOrderUsd: Number(env("MIN_ORDER_USD", "11")),
  marginUse: Number(env("MARGIN_USE", "0.95")),
  slippage: Number(env("SLIPPAGE", "0.01")),
  relayApi: env("RELAY_API", "https://api.relay.link"),
  hlRelayChainId: Number(env("HL_RELAY_CHAIN_ID", "1337")),
  hlRelayUsdc: env("HL_RELAY_USDC", "0x00000000000000000000000000000000"),
  port: Number(env("PORT", "8787")),
  logChunk: BigInt(env("LOG_CHUNK", "10000")),
  dryRun: env("DRY_RUN", "true") !== "false",
};

const FACTORY_ABI = parseAbi([
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
  "function getLaunchedToken(address token) view returns ((address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists))",
]);
const TOKEN_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function description() view returns (string)",
]);
const ESCROW_ABI = parseAbi(["function balanceOf(address) view returns (uint256)", "function claim() returns (uint256)"]);
const HOOK_ABI = parseAbi(["function sweepPoolFees(bytes32 poolId, uint256 minConversionQuoteOut, uint256 minBuybackTokensOut)"]);
const EV_CURVE_SWEPT = parseAbiItem("event FeesSwept(uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount)");
const EV_POOL_SWEPT = parseAbiItem("event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount, uint256 tokensLocked)");
const EV_POOL_REG = parseAbiItem("event PoolRegistered(bytes32 indexed poolId, address memecoin, address quoteToken, address creator)");

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [cfg.rpcUrl] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

const operator = privateKeyToAccount(cfg.operatorKey);
const op = operator.address.toLowerCase();
const publicClient = createPublicClient({ chain: robinhood, transport: http(cfg.rpcUrl) });
const walletClient = createWalletClient({ chain: robinhood, transport: http(cfg.rpcUrl), account: operator });
const log = (...a) => console.log(new Date().toISOString(), ...a);

let state = loadState();
let status = { updatedAt: null, operator: operator.address, dryRun: cfg.dryRun, totals: {}, tokens: [] };

// ---------------------------------------------------------------- helpers

async function scan(fromKey, fn) {
  const latest = await publicClient.getBlockNumber();
  let from = state[fromKey] ? BigInt(state[fromKey]) + 1n : cfg.startBlock;
  if (from === 0n) {
    from = latest;
    log(`${fromKey}: START_BLOCK not set, starting at the current block ${latest}`);
  }
  for (; from <= latest; from += cfg.logChunk) {
    const to = from + cfg.logChunk - 1n > latest ? latest : from + cfg.logChunk - 1n;
    await fn(from, to);
    state[fromKey] = String(to);
    saveState(state);
  }
}

async function write(params, label) {
  if (cfg.dryRun) {
    log(`  [dry-run] ${label}`);
    return null;
  }
  const { request } = await publicClient.simulateContract({ ...params, account: operator });
  const hash = await walletClient.writeContract(request);
  const rc = await publicClient.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`${label} reverted ${hash}`);
  log(`  ${label} ✓ ${hash}`);
  return rc;
}

// ---------------------------------------------------------------- 1. discover

async function discover() {
  await scan("launchBlock", async (fromBlock, toBlock) => {
    const logs = await publicClient.getLogs({
      address: cfg.factory,
      event: FACTORY_ABI.find((x) => x.name === "TokenLaunched"),
      fromBlock,
      toBlock,
    });
    for (const e of logs) {
      const token = e.args.token;
      if (state.registry.some((r) => r.token.toLowerCase() === token.toLowerCase())) continue;
      const info = await publicClient.readContract({ address: cfg.factory, abi: FACTORY_ABI, functionName: "getLaunchedToken", args: [token] });
      if (info.creatorFeeRecipient.toLowerCase() !== op) continue;
      const [name, symbol, description] = await Promise.all(
        ["name", "symbol", "description"].map((f) => publicClient.readContract({ address: token, abi: TOKEN_ABI, functionName: f }).catch(() => "")),
      );
      const strat = parseStrategy(description);
      if (!strat) continue;
      const index = state.registry.length;
      state.registry.push({
        index, token, curve: e.args.curve, deployer: e.args.deployer, name, symbol, ...strat,
        launchedBlock: String(e.blockNumber), launchTx: e.transactionHash, poolId: null,
        hlAccount: hlAccountFor(cfg.mnemonic, index).address,
      });
      log(`new token #${index} ${symbol} → ${strat.leverage}x ${strat.isLong ? "long" : "short"} ${strat.market}`);
    }
  });
}

// ---------------------------------------------------------------- 2. account

async function account() {
  const byCurve = new Map(state.registry.map((r) => [r.curve.toLowerCase(), r]));
  const byToken = new Map(state.registry.map((r) => [r.token.toLowerCase(), r]));
  await scan("feeBlock", async (fromBlock, toBlock) => {
    if (state.registry.length === 0) return;
    // graduated pools: learn their pool ids
    const regs = await publicClient.getLogs({ address: cfg.hook, event: EV_POOL_REG, fromBlock, toBlock });
    for (const e of regs) {
      const r = byToken.get(e.args.memecoin.toLowerCase());
      if (r && !r.poolId) {
        r.poolId = e.args.poolId;
        log(`  ${r.symbol} graduated, pool ${r.poolId.slice(0, 10)}…`);
      }
    }
    const credit = (r, amount, where) => {
      if (amount === 0n) return;
      const ts = tokenState(state, r.token);
      ts.creditedWei = add(ts.creditedWei, amount);
      log(`  +${formatEther(amount)} ETH fees for ${r.symbol} (${where})`);
    };
    const curveLogs = await publicClient.getLogs({ address: [...byCurve.keys()], event: EV_CURVE_SWEPT, fromBlock, toBlock });
    for (const e of curveLogs) credit(byCurve.get(e.address.toLowerCase()), e.args.creatorAmount, "curve");
    const pools = state.registry.filter((r) => r.poolId);
    if (pools.length) {
      const poolLogs = await publicClient.getLogs({ address: cfg.hook, event: EV_POOL_SWEPT, args: { poolId: pools.map((r) => r.poolId) }, fromBlock, toBlock });
      for (const e of poolLogs) credit(pools.find((r) => r.poolId === e.args.poolId), e.args.creatorAmount, "pool");
    }
  });
}

// ---------------------------------------------------------------- 3. claim

async function claim() {
  // Graduated pools: the fee recipient may sweep them itself.
  for (const r of state.registry.filter((x) => x.poolId)) {
    try {
      await publicClient.simulateContract({ address: cfg.hook, abi: HOOK_ABI, functionName: "sweepPoolFees", args: [r.poolId, 0n, 0n], account: operator });
      await write({ address: cfg.hook, abi: HOOK_ABI, functionName: "sweepPoolFees", args: [r.poolId, 0n, 0n] }, `sweep pool fees ${r.symbol}`);
    } catch {
      /* nothing to sweep, or the pool needs the launchpad's own operator */
    }
  }
  const owed = await publicClient.readContract({ address: cfg.escrow, abi: ESCROW_ABI, functionName: "balanceOf", args: [operator.address] });
  if (owed >= cfg.minClaimWei) {
    log(`claim ${formatEther(owed)} ETH from escrow`);
    await write({ address: cfg.escrow, abi: ESCROW_ABI, functionName: "claim" }, "claim");
  }
}

// ---------------------------------------------------------------- 4. bridge

async function bridge(r, ts, ethPrice) {
  const pending = pendingWei(ts);
  const usd = Number(formatEther(pending)) * ethPrice;
  if (pending <= 0n || usd < cfg.minBridgeUsd) return;
  const balance = await publicClient.getBalance({ address: operator.address });
  if (balance - cfg.gasReserveWei < pending) {
    log(`#${r.index} ${r.symbol}: ${formatEther(pending)} ETH owed but not claimed yet`);
    return;
  }
  log(`#${r.index} bridge ${formatEther(pending)} ETH (~$${usd.toFixed(2)}) → Hyperliquid ${r.hlAccount}`);
  if (cfg.dryRun) return;
  const quote = await quoteDeposit(cfg, { user: operator.address, recipient: r.hlAccount, amountWei: pending });
  // Book it first: a crash mid-bridge must never send the same ETH twice.
  ts.bridgedWei = add(ts.bridgedWei, pending);
  saveState(state);
  try {
    const requestId = await executeDeposit(cfg, { quote, walletClient, publicClient, log });
    ts.bridgedUsd += usd;
    ts.bridges.push({ at: new Date().toISOString(), wei: pending.toString(), usd, requestId });
  } catch (e) {
    ts.bridgedWei = (BigInt(ts.bridgedWei) - pending).toString();
    ts.failedWei = add(ts.failedWei, pending);
    log(`  bridge FAILED, ${formatEther(pending)} ETH parked in failedWei for review: ${e.message}`);
  }
}

// ---------------------------------------------------------------- 5. trade

async function trade(r, ts, markets) {
  const market = markets.get(r.market);
  if (!market || market.delisted) return log(`#${r.index} market ${r.market} not on Hyperliquid, skipping`);
  const account = hlAccountFor(cfg.mnemonic, r.index);
  const order = await topUpPosition({ account, launch: r, market, cfg, ts, log });
  if (order && !order.dryRun) ts.orders.push({ at: new Date().toISOString(), ...order });
}

// ---------------------------------------------------------------- 6. status

async function buildStatus(ethPrice) {
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
      index: r.index, token: r.token, curve: r.curve, deployer: r.deployer, name: r.name, symbol: r.symbol,
      market: r.market, isLong: r.isLong, leverage: r.leverage, hlAccount: r.hlAccount, graduated: Boolean(r.poolId),
      launchedBlock: r.launchedBlock,
      feesEth: Number(formatEther(BigInt(ts.creditedWei))),
      pendingEth: Number(formatEther(pendingWei(ts))),
      bridgedUsd: ts.bridgedUsd,
      equityUsd: hl?.accountValue ?? 0,
      notionalUsd: pos ? Math.abs(Number(pos.positionValue)) : 0,
      pnlUsd: pos ? Number(pos.unrealizedPnl) : 0,
      entryPx: pos ? Number(pos.entryPx) : null,
      liqPx: pos?.liquidationPx ? Number(pos.liquidationPx) : null,
    };
    fees += t.feesEth; deployed += t.bridgedUsd; equity += t.equityUsd; notional += t.notionalUsd; pnl += t.pnlUsd;
    tokens.push(t);
  }
  status = {
    updatedAt: new Date().toISOString(), operator: operator.address, dryRun: cfg.dryRun, ethUsd: ethPrice,
    totals: { tokens: tokens.length, feesEth: fees, feesUsd: fees * ethPrice, deployedUsd: deployed, equityUsd: equity, notionalUsd: notional, pnlUsd: pnl },
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
  const [markets, ethPrice] = await Promise.all([loadMarkets(), ethUsd()]);
  await discover();
  await account();
  await claim().catch((e) => log(`claim error: ${e.shortMessage ?? e.message}`));
  log(`cycle: ${state.registry.length} tokens, ETH $${ethPrice}${cfg.dryRun ? " [DRY RUN]" : ""}`);
  for (const r of state.registry) {
    const ts = tokenState(state, r.token);
    try {
      await bridge(r, ts, ethPrice);
      await trade(r, ts, markets);
    } catch (e) {
      log(`#${r.index} error: ${e.shortMessage ?? e.message}`);
    } finally {
      saveState(state);
    }
  }
  await buildStatus(ethPrice);
}

async function check() {
  log(`operator ${operator.address} (${formatEther(await publicClient.getBalance({ address: operator.address }))} ETH)`);
  log(`chain id ${await publicClient.getChainId()}`);
  const route = await relayRouteSupported(cfg);
  log(`Relay route Robinhood(4663)=${route.origin} → Hyperliquid(${cfg.hlRelayChainId})=${route.destination}`);
  log(`Hyperliquid account #0 ${hlAccountFor(cfg.mnemonic, 0).address}`);
  log(`put this operator address in the website CONFIG.feeRecipient`);
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
