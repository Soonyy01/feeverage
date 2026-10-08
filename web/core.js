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
  chainId: 4663,
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
  router: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948",
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  launchConfigId: 0,
  startBlock: 0,
  hlInfo: "https://api.hyperliquid.xyz/info",
  hlWs: "wss://api.hyperliquid.xyz/ws",
  markets: ["BTC", "ETH", "HYPE", "SOL", "XRP", "DOGE"],
  maxLeverage: 20,
  minTopUpUsd: 12,
};
// A typo in config.js must never take the whole site down.
export const C = { ...DEFAULTS, ...(window.FEEVERAGE_CONFIG || {}) };
export const E = window.ethers;
export const $ = (id) => document.getElementById(id);
export const ZERO = "0x0000000000000000000000000000000000000000";

// ------------------------------------------------------------------ ABIs
export const ROUTER_ABI = [
  "function launchAndBuy((string name,string symbol,string logo,string description,(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt) params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut,address recipient,address[] snipeTaxExemptions) payable returns (address token,address curve,uint256 tokensOut)",
];
export const FACTORY_ABI = [
  "function launchFee() view returns (uint256)",
  "function launchEnabled() view returns (bool)",
  "function canLaunch(address) view returns (bool)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function previewLaunchEconomics(uint256 launchConfigId,address pairToken) view returns (bytes32)",
  "function getLaunchedToken(address) view returns ((address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists))",
  "event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)",
];
export const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function logo() view returns (string)",
  "function description() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function socials() view returns (string twitter,string telegram,string discord,string website,string farcaster)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
export const CURVE_ABI = [
  "function buy(uint256 quoteIn,uint256 minTokensOut,address recipient) payable returns (uint256)",
  "function sell(uint256 tokensIn,uint256 minQuoteOut,address recipient) returns (uint256)",
  "function sweepFees(uint256 minBuybackTokensOut)",
  "function graduated() view returns (bool)",
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
];

// Strategy tag stored in the token description (same format the keeper parses).
const TAG_RE = /feeverage:([A-Z0-9]{1,12}):([LS]):(\d{1,2})\b/;
export const parseStrategy = (d) => {
  const m = TAG_RE.exec(d ?? "");
  return m ? { market: m[1], isLong: m[2] === "L", leverage: Number(m[3]) } : null;
};
export const strategyLine = ({ market, isLong, leverage }) =>
  `Fees → ${leverage}x ${isLong ? "LONG" : "SHORT"} ${market} on Hyperliquid · feeverage:${market}:${isLong ? "L" : "S"}:${leverage}`;
export const stripTag = (d) => String(d ?? "").replace(/\n*Fees → .*feeverage:[A-Z0-9]+:[LS]:\d+\s*$/s, "").trim();

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
export const provider = E ? new E.JsonRpcProvider(C.rpc, C.chainId, { staticNetwork: true }) : null;
export const factory = provider ? new E.Contract(C.factory, FACTORY_ABI, provider) : null;
export const chain = { ok: false, launchFee: null, launchOpen: null, maxTaxBps: 1000n, canLaunchMe: null };

export async function readChain() {
  if (!factory) return chain;
  try {
    const [fee, open, tax] = await Promise.all([factory.launchFee(), factory.launchEnabled(), factory.maxCreatorTaxBps()]);
    Object.assign(chain, { ok: true, launchFee: fee, launchOpen: open, maxTaxBps: tax });
    const me = wallet.state.address;
    chain.canLaunchMe = me ? await factory.canLaunch(me) : null;
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

const GECKO = { BTC: "bitcoin", ETH: "ethereum", HYPE: "hyperliquid", SOL: "solana", XRP: "ripple", DOGE: "dogecoin" };
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
  const ethPx = market.ETH?.px ?? 0;
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
  return r;
}

// ------------------------------------------------------------------ tokens
async function fromKeeper() {
  const r = await fetch(C.keeperApi.replace(/\/$/, "") + "/status.json", { cache: "no-store" });
  if (!r.ok) throw new Error("keeper " + r.status);
  return r.json();
}

const FEES_SWEPT = E ? E.id("FeesSwept(uint256,uint256,uint256)") : null;
async function addCurveFees(list) {
  const withCurve = list.filter((x) => x.curve);
  if (!withCurve.length) return;
  const latest = await provider.getBlockNumber();
  const first = Math.min(...withCurve.map((x) => x.block || latest));
  const byCurve = new Map(withCurve.map((x) => [x.curve.toLowerCase(), x]));
  withCurve.forEach((x) => (x.feesEth = 0));
  for (let from = first, n = 0; from <= latest && n < 60; from += 10_000, n++) {
    const logs = await provider.getLogs({ address: [...byCurve.keys()], topics: [FEES_SWEPT], fromBlock: from, toBlock: Math.min(latest, from + 9_999) });
    for (const l of logs) {
      const [, , creator] = E.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256"], l.data);
      const x = byCurve.get(l.address.toLowerCase());
      if (x) x.feesEth += Number(E.formatEther(creator));
    }
  }
}

async function fromChain() {
  const latest = await provider.getBlockNumber();
  const start = Math.max(C.startBlock || 0, latest - 300_000);
  const found = new Map();
  for (let from = latest; from > start && found.size < 150; from -= 10_000) {
    const logs = await factory.queryFilter(factory.filters.TokenLaunched(), Math.max(start, from - 9_999), from);
    for (const l of logs) found.set(l.args.token.toLowerCase(), { token: l.args.token, curve: l.args.curve, deployer: l.args.deployer, block: l.blockNumber });
  }
  for (const m of store.get("feeverage.launches", [])) if (!found.has(m.token.toLowerCase())) found.set(m.token.toLowerCase(), m);
  const out = [];
  await Promise.all([...found.values()].map(async (x) => {
    const info = await factory.getLaunchedToken(x.token).catch(() => null);
    if (!info || info.creatorFeeRecipient.toLowerCase() !== C.feeRecipient.toLowerCase()) return;
    const tk = new E.Contract(x.token, TOKEN_ABI, provider);
    const [name, symbol, description] = await Promise.all([tk.name(), tk.symbol(), tk.description().catch(() => "")]);
    const s = parseStrategy(description);
    if (!s) return;
    out.push({ token: x.token, curve: info.curve, deployer: info.deployer, name, symbol, description, ...s, block: x.block ?? 0, feesEth: null, pendingEth: null });
  }));
  out.sort((a, b) => b.block - a.block);
  await addCurveFees(out);
  return out;
}

async function enrichChain(list) {
  if (!chain.ok) return;
  await Promise.all(list.filter((x) => x.token).map(async (x) => {
    const tk = new E.Contract(x.token, TOKEN_ABI, provider);
    const jobs = [
      x.logo == null ? tk.logo().then((v) => (x.logo = v)).catch(() => (x.logo = "")) : null,
      x.description == null ? tk.description().then((v) => (x.description = v)).catch(() => {}) : null,
      x.socials == null ? tk.socials().then((v) => (x.socials = { twitter: v.twitter, telegram: v.telegram, website: v.website })).catch(() => (x.socials = {})) : null,
      x.supply == null ? tk.totalSupply().then((v) => (x.supply = Number(E.formatEther(v)))).catch(() => {}) : null,
    ];
    if (x.curve) {
      const c = new E.Contract(x.curve, CURVE_ABI, provider);
      jobs.push((async () => {
        try {
          const [g, real, thr, res] = await Promise.all([c.graduated(), c.realQuoteReserve(), c.graduationThreshold(), c.getReserves()]);
          x.graduated = g;
          x.progress = g ? 1 : Number(real) / Number(thr || 1n);
          x.reserveEth = Number(E.formatEther(real));
          x.thresholdEth = Number(E.formatEther(thr));
          x.spotEth = res.tokenReserve > 0n ? Number(E.formatEther(res.quoteReserve)) / Number(E.formatEther(res.tokenReserve)) : null;
        } catch {}
      })());
    }
    await Promise.all(jobs.filter(Boolean));
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

// Returns { tokens, totals(), source }. Everything is real data; with no launches it is empty.
export async function loadTokens() {
  let tokens = [], source;
  try {
    if (C.keeperApi) {
      const s = await fromKeeper();
      tokens = s.tokens.slice().reverse();
      source = t("src.keeper") + (s.dryRun ? " (dry run)" : "");
    } else if (chain.ok && isAddr(C.feeRecipient)) {
      tokens = await fromChain();
      source = t("src.chain");
    } else throw new Error("no source");
  } catch {
    tokens = [];
    source = isAddr(C.feeRecipient) || C.keeperApi ? t("src.connecting") : t("src.none");
  }
  await Promise.all([enrichChain(tokens), enrichPositions(tokens)]);
  return { tokens, source };
}

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
    <div class="big ${x.pnlUsd > 0 ? "pos" : x.pnlUsd < 0 ? "neg" : ""}" data-f="pnl">${x.open ? (x.pnlUsd > 0 ? "+" : "") + usd(x.pnlUsd) : (x.bridgedUsd ?? 0) > 0 ? t("card.reopen") : t("card.waiting")}</div>
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
      const txt = (x.pnlUsd > 0 ? "+" : "") + usd(x.pnlUsd);
      if (pnl.textContent !== txt) {
        const up = x.pnlUsd > (pnl._v ?? x.pnlUsd);
        pnl.textContent = txt;
        pnl.className = `big ${x.pnlUsd > 0 ? "pos" : x.pnlUsd < 0 ? "neg" : ""}`;
        if (pnl._v != null) { pnl.classList.remove("flash-up", "flash-down"); void pnl.offsetWidth; pnl.classList.add(up ? "flash-up" : "flash-down"); }
        pnl._v = x.pnlUsd;
      }
    }
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
    root.querySelectorAll("[data-stat-sub=feesEth]").forEach((s) => (s.textContent = `${fmt(tot.feesEth ?? 0, 4)} ETH`));
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
  const w = wallet.state;
  const connected = w.authenticated && w.address;
  const xUrl = C.xUrl;
  const xHandle = xUrl ? "@" + xUrl.replace(/\/+$/, "").split("/").pop() : t("m.x.none");
  m.innerHTML = `
    <a class="mi" href="launch.html"><b>${t("m.launch")}</b><small>${t("m.launch.s")}</small></a>
    <a class="mi" href="docs.html"><b>${t("m.docs")}</b><small>${t("m.docs.s")}</small></a>
    <button class="mi" type="button" id="menuWallet"><b>${connected ? t("m.disconnect") : t("m.connect")}</b><small>${connected ? short(w.address) : w.mode === "loading" ? t("m.loading") : t("m.connect.s")}</small></button>
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
    if (e.target.closest("#menuWallet")) {
      close();
      try {
        if (wallet.state.authenticated) await wallet.disconnect();
        else await wallet.connect();
      } catch (err) { console.warn(err); }
    }
  });
  wallet.onChange(() => { if (!m.hidden) renderMenu(); });
}

// ------------------------------------------------------------------ boot
export function initShell() {
  applyI18n();
  wireMenu();
  if (!isAddr(C.feeRecipient) || !C.keeperApi) {
    console.info("[Feeverage] Setup: fill feeRecipient and keeperApi in config.js for live token data.");
  }
  renderTicker();
  loadMarkets();
  connectPrices();
  setInterval(loadMarkets, 20_000);
}
