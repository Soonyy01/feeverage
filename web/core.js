// Shared by every page: config, chain + Hyperliquid access, live prices, menu,
// theme, language, token data with live position maths, and animation helpers.
import { wallet } from "./wallet.js";
import { applyI18n, getLang, setLang, t } from "./i18n.js";
export { wallet, t, getLang };

const DEFAULTS = {
  privyAppId: "",
  feeRecipient: "",
  keeperApi: "",
  xUrl: "",
  chainId: 56,
  native: "BNB",
  rpc: "https://bsc-dataseed.bnbchain.org",
  rpcFallbacks: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed1.binance.org"],
  explorer: "https://bscscan.com",
  // flap.sh on BNB Chain
  portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
  taxTokenImpl: "0x024f18294970B5c76c0691b87f138A0317156422",
  taxHelper: "0x53841c73217735F37BC1775538b03b23feFD8346",
  flapUpload: "https://funcs.flap.sh/api/upload",
  ipfs: "https://flap.mypinata.cloud/ipfs/",
  ipfsGateways: ["https://flap.mypinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://w3s.link/ipfs/"],
  strategies: {},
  taxOptions: [1, 3, 5, 10],
  startBlock: 0,
  hlInfo: "https://api.hyperliquid.xyz/info",
  hlWs: "wss://api.hyperliquid.xyz/ws",
  markets: ["BTC", "ETH", "BNB", "HYPE", "SOL", "XRP", "DOGE"],
  maxLeverage: 20,
  minTopUpUsd: 12,
};
// A typo in config.js must never take the whole site down.
export const C = { ...DEFAULTS, ...(window.FEEVERAGE_CONFIG || {}) };
export const E = window.ethers;
export const $ = (id) => document.getElementById(id);
export const ZERO = "0x0000000000000000000000000000000000000000";
export const NATIVE = C.native;
// Local data is namespaced per chain, so nothing from an earlier deployment shows up.
export const KEY = `feev.${C.chainId}.`;

// ------------------------------------------------------------------ ABIs (flap.sh Portal)
const NEW_TOKEN_V6 = "(string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion)";
export const PORTAL_ABI = [
  `function newTokenV6(${NEW_TOKEN_V6} params) payable returns (address)`,
  "function swapExactInput((address inputToken,address outputToken,uint256 inputAmount,uint256 minOutputAmount,bytes permitData) params) payable returns (uint256)",
  "function quoteExactInput((address inputToken,address outputToken,uint256 inputAmount) params) returns (uint256)",
  "function getTokenV6(address token) view returns ((uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 taxRate,address pool,uint256 progress))",
  "event TokenCreated(uint256 ts,address creator,uint256 nonce,address token,string name,string symbol,string meta)",
  "event TokenBought(uint256 ts,address token,address buyer,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)",
  "event TokenSold(uint256 ts,address token,address seller,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)",
];
export const HELPER_ABI = [
  "function getTaxTokenInfo(address taxToken) view returns ((uint16 marketBps,uint16 deflationBps,uint16 lpBps,uint16 dividendBps,uint16 taxRate,uint256 burntTokenAmount,uint256 totalQuoteSentToDividend,uint256 totalQuoteAddedToLiquidity,uint256 totalTokenAddedToLiquidity,uint256 totalQuoteSentToMarketing,address marketingWallet,address quoteToken,uint256 minimumShareBalance))",
];
export const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function metaURI() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
// Portal enums
export const STATUS = { INVALID: 0, TRADABLE: 1, DEX: 4, STAGED: 5 };
export const TOKEN_TAXED_V3 = 6;

// Strategy tag stored in the token description (same format the keeper parses).
const TAG_RE = /feeverage:([A-Z0-9]{1,12}):([LS]):(\d{1,2})\b/;
export const parseStrategy = (d) => {
  const m = TAG_RE.exec(d ?? "");
  return m ? { market: m[1], isLong: m[2] === "L", leverage: Number(m[3]) } : null;
};
export const strategyLine = ({ market, isLong, leverage }) =>
  `Fees → ${leverage}x ${isLong ? "LONG" : "SHORT"} ${market} on Hyperliquid · feeverage:${market}:${isLong ? "L" : "S"}:${leverage}`;
export const stripTag = (d) => String(d ?? "").replace(/\n*Fees → .*feeverage:[A-Z0-9]+:[LS]:\d+\s*$/s, "").replace(/\s*​\S*$/, "").trim();

// ------------------------------------------------------------------ format
export const fmt = (n, d = 2) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const usd = (n, d = 2) => (n < 0 ? "−$" : "$") + fmt(Math.abs(n), d);
export const compactUsd = (n) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? fmt(a / 1e9, 2) + "B" : a >= 1e6 ? fmt(a / 1e6, 2) + "M" : a >= 1e3 ? fmt(a / 1e3, 1) + "K" : fmt(a, 2);
  return (n < 0 ? "−$" : "$") + s;
};
export const signedUsd = (n) => (n > 0 ? "+" : "") + compactUsd(n);
export const px = (n) => (n == null || !isFinite(n) ? "—" : n >= 1000 ? fmt(n, 0) : n >= 1 ? fmt(n, 2) : fmt(n, 5));
export const ethPx = (p) => (p == null || !isFinite(p) ? "—" : (p >= 0.001 ? fmt(p, 6) : p.toExponential(3)) + " " + (window.FEEVERAGE_CONFIG?.native || "BNB"));
export const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a ?? "");
export const errMsg = (e) => esc(e?.shortMessage || e?.info?.error?.message || e?.reason || e?.message || String(e));
export const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
export const tokenUrl = (addr) => `token.html?t=${addr}`;
const X_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-7.2L4.5 22H1.4l8.1-9.3L1 2h7.1l5 6.6L18.9 2Zm-1.2 18h1.7L7.1 3.9H5.3L17.7 20Z"/></svg>`;

// ------------------------------------------------------------------ chain
// RPC: the configured endpoint first, then public mirrors, then the site's own proxy
// (/api/rpc), which works even when a visitor's network or browser blocks the others.
const RPCS = [C.rpc, ...(C.rpcFallbacks ?? []),
  typeof location !== "undefined" && /^https?:/.test(location.protocol) ? location.origin + "/api/rpc" : null].filter(Boolean);
const mkProvider = (url) => new E.JsonRpcProvider(url, C.chainId, { staticNetwork: true, batchMaxCount: 1, pollingInterval: 800 });
export let provider = E ? mkProvider(RPCS[0]) : null;
export let portal = provider ? new E.Contract(C.portal, PORTAL_ABI, provider) : null;
export let helper = provider ? new E.Contract(C.taxHelper, HELPER_ABI, provider) : null;
export const chain = { ok: false, launchFee: 0n, launchOpen: true, canLaunchMe: null };
let rpcPick = null;
export function pickRpc() {
  if (!E) return Promise.resolve(null);
  rpcPick ??= (async () => {
    for (const url of RPCS) {
      const p = mkProvider(url);
      try {
        const id = await Promise.race([
          p.send("eth_chainId", []),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000)),
        ]);
        if (Number(id) !== Number(C.chainId)) continue;
        provider = p;
        portal = new E.Contract(C.portal, PORTAL_ABI, p);
        helper = new E.Contract(C.taxHelper, HELPER_ABI, p);
        return url;
      } catch {}
    }
    rpcPick = null; // nothing answered: try again on the next call
    return null;
  })();
  return rpcPick;
}

export async function readChain() {
  await pickRpc();
  try {
    const code = await provider.getCode(C.portal);
    chain.ok = code && code !== "0x";
  } catch {
    chain.ok = false;
  }
  return chain;
}

// ------------------------------------------------------------------ live prices
// Hyperliquid first (websocket + REST). If Hyperliquid is unreachable from the
// visitor's network, CoinGecko and then Binance keep prices live.
export const market = {}; // name -> { px, prev, maxLev, src }
const marketListeners = new Set();
export const onMarkets = (fn) => marketListeners.add(fn);
const emitMarkets = () => marketListeners.forEach((fn) => fn(market));
let hlOk = false, wsLive = false, wsDirty = false;

async function postHl(body) {
  const r = await fetch(C.hlInfo, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Hyperliquid " + r.status);
  return r.json();
}

async function fromHyperliquid() {
  const [meta, ctxs] = await postHl({ type: "metaAndAssetCtxs" });
  meta.universe.forEach((u, i) => {
    const prev = market[u.name];
    market[u.name] = {
      px: prev?.src === "ws" && wsLive ? prev.px : Number(ctxs[i].markPx),
      prev: Number(ctxs[i].prevDayPx),
      maxLev: u.maxLeverage,
      src: prev?.src === "ws" && wsLive ? "ws" : "hl",
    };
  });
  hlOk = true;
}

const GECKO = { BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", HYPE: "hyperliquid", SOL: "solana", XRP: "ripple", DOGE: "dogecoin" };
async function fromCoinGecko() {
  const ids = C.markets.map((m) => GECKO[m]).filter(Boolean).join(",");
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
  if (!r.ok) throw new Error("coingecko " + r.status);
  const j = await r.json();
  for (const m of C.markets) {
    const d = j[GECKO[m]];
    if (!d?.usd) continue;
    const ch = Number(d.usd_24h_change ?? 0);
    market[m] = { ...(market[m] ?? { maxLev: C.maxLeverage }), px: Number(d.usd), prev: Number(d.usd) / (1 + ch / 100), src: "cg" };
  }
}

async function fromBinance() {
  const syms = C.markets.map((m) => `"${m}USDT"`).join(",");
  const r = await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=[${syms}]`);
  if (!r.ok) throw new Error("binance " + r.status);
  for (const x of await r.json()) {
    const m = x.symbol.replace(/USDT$/, "");
    market[m] = { ...(market[m] ?? { maxLev: C.maxLeverage }), px: Number(x.lastPrice), prev: Number(x.openPrice), src: "bn" };
  }
}

async function loadMarkets() {
  try {
    await fromHyperliquid();
  } catch {
    hlOk = false;
    try { await fromCoinGecko(); } catch { try { await fromBinance(); } catch {} }
  }
  renderTicker();
  paintPrices();
  emitMarkets();
}

function connectPrices() {
  let ws;
  try { ws = new WebSocket(C.hlWs); } catch { return; }
  ws.onopen = () => ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "allMids" } }));
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.channel !== "allMids") return;
    wsLive = true;
    const mids = msg.data?.mids ?? {};
    for (const m of C.markets) {
      if (mids[m] == null) continue;
      market[m] ??= { prev: 0, maxLev: C.maxLeverage };
      market[m].px = Number(mids[m]);
      market[m].src = "ws";
      wsDirty = true;
    }
  };
  ws.onclose = () => { wsLive = false; setTimeout(connectPrices, 4000); };
  ws.onerror = () => ws.close();
}

const lastShown = {};
let tickerKey = "";
function renderTicker() {
  const el = $("ticker");
  if (!el) return;
  const have = C.markets.filter((m) => market[m]?.px);
  const list = have.length ? have : C.markets;
  const key = list.join(",");
  if (key === tickerKey) return;
  tickerKey = key;
  const row = list.map((m) => `<span class="item" data-coin="${m}"><b>${m}</b><span class="p">—</span><span class="c"></span></span>`).join("");
  el.innerHTML = row + row + row + row; // repeated for a seamless loop on wide screens
  Object.keys(lastShown).forEach((k) => delete lastShown[k]);
}

// Updates every live price on the page in place and flashes green or red on each tick.
export function paintPrices() {
  for (const m of C.markets) {
    const d = market[m];
    if (!d || !isFinite(d.px)) continue;
    const text = px(d.px);
    const before = lastShown[m];
    const dir = before == null ? "" : d.px > before ? "tick-up" : d.px < before ? "tick-down" : "";
    const ch = d.prev ? ((d.px - d.prev) / d.prev) * 100 : null;
    document.querySelectorAll(`[data-coin="${m}"]`).forEach((el) => {
      const p = el.querySelector(".p"), c = el.querySelector(".c");
      if (p && p.textContent !== text) p.textContent = text;
      if (c && ch != null) {
        c.className = "c " + (ch >= 0 ? "up" : "down");
        c.textContent = `${ch >= 0 ? "▲" : "▼"} ${fmt(Math.abs(ch), 2)}%`;
      }
      if (dir) { el.classList.remove("tick-up", "tick-down"); void el.offsetWidth; el.classList.add(dir); }
    });
    document.querySelectorAll(`[data-px="${m}"]`).forEach((s) => (s.textContent = text));
    lastShown[m] = d.px;
  }
}

setInterval(() => {
  if (!wsDirty) return;
  wsDirty = false;
  renderTicker();
  paintPrices();
  emitMarkets();
}, 1000);

// ------------------------------------------------------------------ live position maths
// Positions come from Hyperliquid (or the keeper's snapshot) and are re-marked every
// second against the live price of the token's own market and side.
export function live(tok) {
  const m = market[tok.market]?.px;
  const ethPx = market[NATIVE]?.px ?? 0;
  const r = { ...tok };
  if (tok.szi && tok.entryPx && m) {
    r.markPx = m;
    r.pnlUsd = tok.szi * (m - tok.entryPx);
    r.notionalUsd = Math.abs(tok.szi) * m;
    r.equityUsd = (tok.equityUsd ?? 0) + (r.pnlUsd - (tok.pnlUsd ?? 0));
  } else r.markPx = m ?? null;
  r.liqDist = r.liqPx && m ? (tok.isLong ? (m - r.liqPx) / m : (r.liqPx - m) / m) : null;
  r.pendingUsd = (tok.pendingEth ?? 0) * ethPx;
  r.feesUsd = (tok.feesEth ?? 0) * ethPx;
  r.mcapUsd = tok.mcapEth != null ? tok.mcapEth * ethPx : null;
  r.open = r.notionalUsd > 0;
  // PnL as a % of the margin put in (what the fees funded).
  const base = (tok.bridgedUsd ?? 0) > 0 ? tok.bridgedUsd * (C.marginUse ?? 0.95) : (r.equityUsd ?? 0) - (r.pnlUsd ?? 0);
  r.pnlPct = r.open && base > 0 ? (r.pnlUsd / base) * 100 : null;
  return r;
}

// "+$12.34 (+4.1%)" / "−$5.20 (−2.0%)": always signed, green when up, red when down.
const sgn = (n) => (n > 0 ? "+" : n < 0 ? "−" : "");
export function pnlText(x) {
  const pct = x.pnlPct != null ? ` (${sgn(x.pnlPct)}${fmt(Math.abs(x.pnlPct), 1)}%)` : "";
  return `${sgn(x.pnlUsd)}$${fmt(Math.abs(x.pnlUsd), 2)}${pct}`;
}
const entryText = (x) => `${px(x.entryPx)} → ${px(x.markPx)}`;

// ------------------------------------------------------------------ tokens
async function fromKeeper() {
  const r = await fetch(C.keeperApi.replace(/\/$/, "") + "/status.json", { cache: "no-store" });
  if (!r.ok) throw new Error("keeper " + r.status);
  return r.json();
}

// Token metadata lives on IPFS (flap.sh pins it): description, image, socials.
// Several public gateways are tried at once; the first that answers wins.
const metaCache = new Map();
const GATEWAYS = () => [...new Set([C.ipfs, ...(C.ipfsGateways || [])].filter(Boolean))];
export async function fetchMeta(cid) {
  if (!cid) return null;
  if (metaCache.has(cid)) return metaCache.get(cid);
  const p = (async () => {
    try {
      const { j, gw } = await Promise.any(GATEWAYS().map(async (gw) => {
        const r = await fetch(gw + cid, { signal: AbortSignal.timeout(12000) });
        if (!r.ok) throw new Error(String(r.status));
        return { j: await r.json(), gw };
      }));
      return {
        description: j.description ?? "",
        logo: j.image ? (/^https?:/.test(j.image) ? j.image : gw + String(j.image).replace(/^ipfs:\/\//, "")) : "",
        socials: { twitter: j.twitter ?? "", telegram: j.telegram ?? "", website: j.website ?? "" },
        creator: j.creator ?? null,
      };
    } catch {
      metaCache.delete(cid); // try again later
      return null;
    }
  })();
  metaCache.set(cid, p);
  return p;
}

// The strategy is also written into the CREATE2 salt, so it can be read even when IPFS is down:
// salt = "FEEV" | side | leverage | market (10 bytes ASCII) | random (12) | counter (4)
export function saltPrefix({ market, isLong, leverage }) {
  const b = new Uint8Array(16);
  b.set([0x46, 0x45, 0x45, 0x56, isLong ? 0x4c : 0x53, leverage]);
  b.set(new TextEncoder().encode(market.slice(0, 10)), 6);
  return b;
}
// Strategy for a token: description tag, then salt, then the manual list in config.js.
export const knownStrategy = (token) => parseStrategy("feeverage:" + (C.strategies?.[String(token).toLowerCase()] || ""));

// Runs fn over items with at most n in flight, so a long list doesn't flood the RPC.
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; try { await fn(x); } catch {} }
  }));
}

// The site's own server finds this site's launches (flap.sh launches thousands of tokens a day).
async function fromServer() {
  if (typeof location === "undefined" || !/^https?:/.test(location.protocol) || !isAddr(C.feeRecipient)) return null;
  try {
    const q = new URLSearchParams({ fee: C.feeRecipient, from: String(Number(C.startBlock) || 0) });
    const r = await fetch(`api/tokens?${q}`, { signal: AbortSignal.timeout(55000) });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.tokens) ? j.tokens : null;
  } catch {
    return null;
  }
}

// Checks one token: fees must go to our operator and its description must carry the strategy tag.
async function inspect(x) {
  const info = await helper.getTaxTokenInfo(x.token);
  if (!C.feeRecipient || info.marketingWallet.toLowerCase() !== C.feeRecipient.toLowerCase()) return null;
  const tk = new E.Contract(x.token, TOKEN_ABI, provider);
  const [name, symbol, cid] = await Promise.all([x.name ?? tk.name(), x.symbol ?? tk.symbol(), x.meta ?? tk.metaURI()]);
  const meta = await fetchMeta(cid);
  const st = parseStrategy(meta?.description ?? x.description ?? "") ?? knownStrategy(x.token);
  if (!st) return null;
  return { token: x.token, deployer: x.deployer ?? meta?.creator ?? null, name, symbol, meta: cid, description: meta?.description ?? x.description ?? "",
    logo: meta?.logo ?? x.logo ?? "", socials: meta?.socials ?? {}, ...st, block: x.block ?? 0, feesEth: null, pendingEth: null };
}

async function fromChain() {
  const found = new Map();
  for (const x of (await fromServer()) ?? []) found.set(x.token.toLowerCase(), x);
  // Launches made from this browser show up immediately, before any indexer has seen them.
  for (const m of store.get(KEY + "launches", [])) if (!found.has(m.token.toLowerCase())) found.set(m.token.toLowerCase(), m);
  const out = [];
  await pool([...found.values()], 6, async (x) => {
    const st = parseStrategy(x.description) ?? knownStrategy(x.token);
    const t2 = st ? { ...x, ...st } : await inspect(x);
    if (t2 && t2.market) out.push({ feesEth: null, pendingEth: null, socials: {}, ...t2 });
  });
  out.sort((a, b) => (b.block || 0) - (a.block || 0));
  return out;
}

// ------------------------------------------------------------------ token state (on-chain, live)
// Price, progress and status straight from the flap.sh Portal; creator fees from the
// Tax Token Helper (BNB already sent to the operator for this token).
function applyState(x, s) {
  x.status = Number(s.status);
  x.graduated = x.status === STATUS.DEX;
  x.spotEth = Number(E.formatEther(s.price));
  const p = Number(s.progress);
  x.progress = x.graduated ? 1 : p > 1e6 ? p / 1e18 : p > 1 ? p / 10000 : p;
  x.reserveEth = Number(E.formatEther(s.reserve));
  x.taxBps = Number(s.taxRate);
  if (x.supply) x.mcapEth = x.spotEth * x.supply;
}
export async function refreshTokenPrices(list) {
  if (!chain.ok) return;
  await Promise.all(list.filter((x) => x.token).map(async (x) => {
    try { applyState(x, await portal.getTokenV6(x.token)); } catch {}
  }));
}

async function enrichChain(list) {
  if (!chain.ok) return;
  await Promise.all(list.filter((x) => x.token).map(async (x) => {
    const tk = new E.Contract(x.token, TOKEN_ABI, provider);
    await Promise.all([
      x.supply == null ? tk.totalSupply().then((v) => (x.supply = Number(E.formatEther(v)))).catch(() => {}) : null,
      portal.getTokenV6(x.token).then((s) => applyState(x, s)).catch(() => {}),
      helper.getTaxTokenInfo(x.token).then((i) => {
        const sent = Number(E.formatEther(i.totalQuoteSentToMarketing));
        if (x.feesEth == null || sent > x.feesEth) x.feesEth = sent;
        // Without a keeper, everything not yet bridged counts toward the next top-up.
        if (x.pendingEth == null) x.pendingEth = Math.max(0, sent - (x.bridgedEth ?? 0));
      }).catch(() => {}),
      x.logo == null && x.meta ? fetchMeta(x.meta).then((m) => { if (m) { x.logo = m.logo; x.socials ??= m.socials; x.description ??= m.description; } }) : null,
    ].filter(Boolean));
    if (x.spotEth != null && x.supply) x.mcapEth = x.spotEth * x.supply;
  }));
}

// Pull each token's position straight from Hyperliquid when reachable.
async function enrichPositions(list) {
  if (!hlOk) return;
  await Promise.all(list.filter((x) => isAddr(x.hlAccount)).map(async (x) => {
    try {
      const s = await postHl({ type: "clearinghouseState", user: x.hlAccount });
      x.equityUsd = Number(s.marginSummary.accountValue);
      const p = s.assetPositions.map((a) => a.position).find((q) => q.coin === x.market);
      if (p) {
        x.szi = Number(p.szi);
        x.entryPx = Number(p.entryPx);
        x.liqPx = p.liquidationPx ? Number(p.liquidationPx) : null;
        x.pnlUsd = Number(p.unrealizedPnl);
        x.notionalUsd = Math.abs(Number(p.positionValue));
      } else {
        x.szi = 0; x.notionalUsd = 0; x.pnlUsd = 0; x.liqPx = null; x.entryPx = null;
      }
    } catch {}
  }));
}

// Returns { tokens, source }. Everything is real data; with no launches it is empty.
export async function loadTokens() {
  await pickRpc();
  if (!chain.ok) await readChain();
  let tokens = [], source;
  try {
    if (C.keeperApi) {
      const s = await fromKeeper();
      tokens = s.tokens.slice().reverse();
      source = t("src.keeper") + (s.dryRun ? " (dry run)" : "");
    } else if (isAddr(C.feeRecipient)) {
      tokens = await fromChain();
      source = t("src.chain");
    } else throw new Error("no source");
  } catch {
    tokens = [];
    source = isAddr(C.feeRecipient) || C.keeperApi ? t("src.connecting") : t("src.none");
  }
  await Promise.all([enrichChain(tokens), enrichPositions(tokens)]);
  if (tokens.length) store.set(KEY + "tokens", tokens.slice(0, 200));
  return { tokens, source };
}

// Last list seen by this browser: drawn instantly while fresh data loads.
export const cachedTokens = () => store.get(KEY + "tokens", []);

export function totals(tokens) {
  const L = tokens.map(live);
  const sum = (k) => L.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  return {
    tokens: tokens.length,
    feesEth: sum("feesEth"), feesUsd: sum("feesUsd"),
    equityUsd: sum("equityUsd"), notionalUsd: sum("notionalUsd"), pnlUsd: sum("pnlUsd"),
    longs: tokens.filter((x) => x.isLong).length, shorts: tokens.filter((x) => !x.isLong).length,
  };
}

// ------------------------------------------------------------------ a wallet's holdings
// Balance from the token contract. Cost basis from the trades this wallet made on this site
// (launch buy, buys and sells), kept in the browser. Values are marked to the live price.
export function recordTrade(user, x) {
  const k = KEY + "trades." + user.toLowerCase();
  const all = store.get(k, []);
  all.unshift({ ...x, at: Date.now() });
  store.set(k, all.slice(0, 500));
}
export async function loadHoldings(user, tokens) {
  if (!chain.ok || !isAddr(user)) return [];
  const trades = store.get(KEY + "trades." + user.toLowerCase(), []);
  const out = [];
  await Promise.all(tokens.map(async (x) => {
    const tk = new E.Contract(x.token, TOKEN_ABI, provider);
    const balance = Number(E.formatEther(await tk.balanceOf(user).catch(() => 0n)));
    const mine = trades.filter((r) => r.token?.toLowerCase() === x.token.toLowerCase());
    const buys = mine.filter((r) => r.side === "buy"), sells = mine.filter((r) => r.side === "sell");
    if (balance <= 0 && !mine.length) return;
    const spent = buys.reduce((a, b) => a + b.eth, 0);
    const bought = buys.reduce((a, b) => a + b.tokens, 0);
    const received = sells.reduce((a, b) => a + b.eth, 0);
    const sold = sells.reduce((a, b) => a + b.tokens, 0);
    out.push({ ...x, balance, spentEth: spent, boughtTokens: bought, receivedEth: received, soldTokens: sold,
      avgEth: bought > 0 ? spent / bought : null, trades: mine.map((r) => ({ ...r })) });
  }));
  return out;
}

// Live marks for one holding (native coin and USD).
export function holdingLive(h) {
  const ethPx = market[NATIVE]?.px ?? 0;
  const valueEth = h.spotEth != null ? h.balance * h.spotEth : null;
  const costLeft = h.avgEth != null ? h.balance * h.avgEth : null;
  const pnlEth = valueEth != null && h.spentEth > 0 ? valueEth + h.receivedEth - h.spentEth : null;
  return {
    valueEth, valueUsd: valueEth != null ? valueEth * ethPx : null,
    pnlEth, pnlUsd: pnlEth != null ? pnlEth * ethPx : null,
    pnlPct: pnlEth != null && h.spentEth > 0 ? (pnlEth / h.spentEth) * 100 : null,
    moveSinceEntry: h.avgEth && h.spotEth != null ? ((h.spotEth - h.avgEth) / h.avgEth) * 100 : null,
    costLeftEth: costLeft,
  };
}

// ------------------------------------------------------------------ token card
export function tokenLogo(x, cls = "tlogo") {
  return x.logo
    ? `<img class="${cls}" src="${esc(x.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="${cls}">${esc((x.symbol || "?")[0])}</span>`;
}

export function tokenCard(raw) {
  const x = live(raw);
  const tw = x.socials?.twitter;
  const twUrl = tw ? (/^https?:\/\//.test(tw) ? tw : `https://x.com/${tw.replace(/^@/, "")}`) : null;
  return `<article class="card" data-href="${tokenUrl(x.token)}" data-token="${x.token}">
    <div class="head">${tokenLogo(x)}
      <div style="min-width:0"><b><a href="${tokenUrl(x.token)}">$${esc(x.symbol)}</a></b><span>${esc(x.name)}</span></div>
      <span class="mk">${esc(x.market)}</span></div>
    <div class="strat"><span><span class="${x.isLong ? "side-l" : "side-s"}">${x.isLong ? "▲ Long" : "▼ Short"}</span> ${esc(x.market)} ${x.leverage}×</span>
      <span class="muted" style="font-size:11.5px">${t("card.mcap")} <b data-f="mcap" style="color:var(--ink)">${x.mcapUsd != null ? compactUsd(x.mcapUsd) : "—"}</b></span></div>
    <div class="big ${x.pnlUsd > 0 ? "pos" : x.pnlUsd < 0 ? "neg" : ""}" data-f="pnl">${x.open ? pnlText(x) : (x.bridgedUsd ?? 0) > 0 ? t("card.reopen") : t("card.waiting")}</div>
    ${x.open ? `<div class="sub"><span>${t("card.entry")} ${x.isLong ? "▲" : "▼"}</span><span data-f="entry">${entryText(x)}</span></div>` : ""}
    <div class="sub"><span>${t("card.next")}</span><span data-f="next">${usd(x.pendingUsd)} / $${C.minTopUpUsd}</span></div>
    <div class="meter"><i data-f="meter" style="width:${Math.min(100, (x.pendingUsd / C.minTopUpUsd) * 100)}%"></i></div>
    <div class="foot">
      <span style="display:flex;gap:8px;align-items:center">${twUrl ? `<a class="iconbtn" href="${esc(twUrl)}" target="_blank" rel="noopener" aria-label="X">${X_ICON}</a>` : ""}<span class="label muted" style="letter-spacing:.08em">${usd(x.bridgedUsd ?? 0, 0)} ${t("card.funded")}</span></span>
      <button class="ca" type="button" data-copy="${x.token}">${short(x.token)} ⧉</button>
    </div>
  </article>`;
}

// Re-marks every card on screen against live prices without rebuilding it.
export function refreshCards(container, byToken) {
  container.querySelectorAll("[data-token]").forEach((card) => {
    const raw = byToken.get(card.dataset.token.toLowerCase());
    if (!raw) return;
    const x = live(raw);
    const pnl = card.querySelector('[data-f="pnl"]');
    if (pnl && x.open) {
      const txt = pnlText(x);
      if (pnl.textContent !== txt) {
        const up = x.pnlUsd > (pnl._v ?? x.pnlUsd);
        pnl.textContent = txt;
        pnl.className = `big ${x.pnlUsd > 0 ? "pos" : x.pnlUsd < 0 ? "neg" : ""}`;
        if (pnl._v != null) { pnl.classList.remove("flash-up", "flash-down"); void pnl.offsetWidth; pnl.classList.add(up ? "flash-up" : "flash-down"); }
        pnl._v = x.pnlUsd;
      }
    }
    const en = card.querySelector('[data-f="entry"]');
    if (en && x.open) en.textContent = entryText(x);
    const mc = card.querySelector('[data-f="mcap"]');
    if (mc && x.mcapUsd != null) mc.textContent = compactUsd(x.mcapUsd);
    const nx = card.querySelector('[data-f="next"]');
    if (nx) nx.textContent = `${usd(x.pendingUsd)} / $${C.minTopUpUsd}`;
    const mt = card.querySelector('[data-f="meter"]');
    if (mt) mt.style.width = Math.min(100, (x.pendingUsd / C.minTopUpUsd) * 100) + "%";
  });
}

export function wireCards(container) {
  container.addEventListener("click", async (e) => {
    const cp = e.target.closest("[data-copy]");
    if (cp) {
      e.stopPropagation();
      try { await navigator.clipboard.writeText(cp.dataset.copy); cp.textContent = t("card.copy") + " ✓"; } catch { cp.textContent = cp.dataset.copy; }
      setTimeout(() => (cp.textContent = short(cp.dataset.copy) + " ⧉"), 1500);
      return;
    }
    if (e.target.closest("a")) return;
    const c = e.target.closest("[data-href]");
    if (c) location.href = c.dataset.href;
  });
}

// ------------------------------------------------------------------ animation helpers
export function bars(el, lev, max = 20) {
  if (!el) return;
  el.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < lev ? "" : "ghost"}" style="animation-delay:${i * 18}ms"></i>`).join("");
}

// A number that spins like a counter, then settles on its real value.
export function roll(el, to, fmtFn, dur = 1200) {
  el.dataset.v = to;
  el._fmt = fmtFn;
  const t0 = performance.now();
  const spread = Math.max(Math.abs(to), Number(el.dataset.spread ?? 1000));
  const id = (el._rollId = (el._rollId ?? 0) + 1);
  const tick = (now) => {
    if (el._rollId !== id) return;
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
    el.textContent = fmtFn(p < 1 ? to + (1 - e) * spread * Math.random() : to);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Wires every [data-stat] inside `root`: rolls on scroll-in, eases to new live values.
const STAT_FMT = { tokens: (n) => fmt(n, 0), pnlUsd: signedUsd };
export function statBlock(root) {
  const els = [...root.querySelectorAll("[data-stat]")];
  els.forEach((el) => {
    el.dataset.v = 0;
    el._fmt = STAT_FMT[el.dataset.stat] ?? compactUsd;
    el.textContent = el._fmt(0);
  });
  const rollAll = () => els.forEach((el, i) => setTimeout(() => roll(el, Number(el.dataset.v), el._fmt), i * 90));
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((en) => en.forEach((x) => x.isIntersecting && rollAll()), { threshold: 0.3 }).observe(root);
  } else rollAll();
  return (tot, { quiet = false } = {}) => {
    els.forEach((el) => {
      const val = Number(tot[el.dataset.stat] ?? 0) || 0;
      if (Math.abs(Number(el.dataset.v) - val) > 1e-9) {
        if (quiet) { el.dataset.v = val; el.textContent = el._fmt(val); }
        else roll(el, val, el._fmt, 900);
      }
      if (el.dataset.stat === "pnlUsd") { el.classList.toggle("pos", val > 0); el.classList.toggle("neg", val < 0); }
    });
    root.querySelectorAll("[data-stat-sub=feesEth]").forEach((s) => (s.textContent = `${fmt(tot.feesEth ?? 0, 4)} ${NATIVE}`));
  };
}

// ------------------------------------------------------------------ theme
const THEME_KEY = "feev.theme";
export function setTheme(th) {
  document.documentElement.dataset.theme = th;
  try { localStorage.setItem(THEME_KEY, th); } catch {}
}
const theme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

// ------------------------------------------------------------------ menu
function renderMenu() {
  const m = $("menu");
  if (!m) return;
  const xUrl = C.xUrl;
  const xHandle = xUrl ? "@" + xUrl.replace(/\/+$/, "").split("/").pop() : t("m.x.none");
  m.innerHTML = `
    <a class="mi" href="launch.html"><b>${t("m.launch")}</b><small>${t("m.launch.s")}</small></a>
    <a class="mi" href="docs.html"><b>${t("m.docs")}</b><small>${t("m.docs.s")}</small></a>
    <a class="mi" href="positions.html"><b>${t("m.positions")}</b><small>${t("m.positions.s")}</small></a>
    <div class="mi static"><b>${t("m.lang")}</b><span class="toggle"><button type="button" data-lang="en" aria-pressed="${getLang() === "en"}">EN</button><button type="button" data-lang="zh" aria-pressed="${getLang() === "zh"}">中文</button></span></div>
    <div class="mi static"><b>${t("m.theme")}</b><span class="toggle"><button type="button" data-theme-set="light" aria-pressed="${theme() === "light"}">${t("m.light")}</button><button type="button" data-theme-set="dark" aria-pressed="${theme() === "dark"}">${t("m.dark")}</button></span></div>
    <a class="mi x ${xUrl ? "" : "off"}" href="${xUrl ? esc(xUrl) : "#"}" target="_blank" rel="noopener">${X_ICON}<small>${esc(xHandle)}</small></a>`;
}

function wireMenu() {
  const btn = $("menuBtn"), m = $("menu");
  if (!btn || !m) return;
  const close = () => { m.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = m.hidden;
    if ($("walletMenu")) { $("walletMenu").hidden = true; $("walletBtn")?.setAttribute("aria-expanded", "false"); }
    if (open) renderMenu();
    m.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => { if (!m.hidden && !m.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  m.addEventListener("click", async (e) => {
    const l = e.target.closest("[data-lang]");
    if (l) { setLang(l.dataset.lang); renderMenu(); return; }
    const th = e.target.closest("[data-theme-set]");
    if (th) { setTheme(th.dataset.themeSet); renderMenu(); return; }
  });
}

// ------------------------------------------------------------------ wallet button (next to Menu)
function wireWallet() {
  const b = $("walletBtn"), wm = $("walletMenu");
  if (!b || !wm) return;
  const close = () => { wm.hidden = true; b.setAttribute("aria-expanded", "false"); };
  const paint = () => {
    const w = wallet.state;
    const on = w.authenticated && w.address;
    b.innerHTML = on ? `<span class="sq live"></span>${short(w.address)}` : w.mode === "loading" ? t("m.loading") : t("m.connect");
    b.classList.toggle("ghost", Boolean(on));
    b.disabled = w.mode === "loading";
    wm.innerHTML = on ? `
      <a class="mi" href="positions.html"><b>${t("m.positions")}</b><small>${short(w.address)}</small></a>
      <button class="mi" type="button" data-copy-addr="${w.address}"><b>${t("w.copy")}</b><small>${short(w.address)}</small></button>
      <a class="mi" href="${C.explorer}/address/${w.address}" target="_blank" rel="noopener"><b>${t("w.explorer")}</b><small>↗</small></a>
      <button class="mi x" type="button" data-disconnect><b>${t("m.disconnect")}</b><small></small></button>` : "";
  };
  wallet.onChange(paint);
  addEventListener("langchange", paint);
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const w = wallet.state;
    if (w.authenticated && w.address) {
      const open = wm.hidden;
      wm.hidden = !open;
      b.setAttribute("aria-expanded", String(open));
      $("menu").hidden = true;
      $("menuBtn")?.setAttribute("aria-expanded", "false");
    } else {
      try { await wallet.connect(); } catch (err) { console.warn(err); }
    }
  });
  document.addEventListener("click", (e) => { if (!wm.hidden && !wm.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  wm.addEventListener("click", async (e) => {
    const cp = e.target.closest("[data-copy-addr]");
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copyAddr); cp.querySelector("small").textContent = t("card.copy") + " ✓"; } catch {} return; }
    if (e.target.closest("[data-disconnect]")) { close(); await wallet.disconnect(); }
  });
}

// ------------------------------------------------------------------ boot
// Drop data left in the browser by the earlier Robinhood Chain version of the site.
function forgetOldChain() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k === "feeverage.launches" || k === "feev.notours" || k.startsWith("feev.trades.") || k.startsWith("feev.4663.")) localStorage.removeItem(k);
    }
  } catch {}
}

export function initShell() {
  forgetOldChain();
  pickRpc();
  applyI18n();
  wireMenu();
  wireWallet();
  if (!isAddr(C.feeRecipient) || !C.keeperApi) {
    console.info("[Feeverage] Setup: fill feeRecipient and keeperApi in config.js for live token data.");
  }
  renderTicker();
  loadMarkets();
  connectPrices();
  setInterval(loadMarkets, 20_000);
}
