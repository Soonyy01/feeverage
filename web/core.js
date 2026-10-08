// Shared by every page: config, chain + Hyperliquid access, live prices,
// wallet button, token data, formatting and the small animation helpers.
import { wallet } from "./wallet.js";
export { wallet };

const DEFAULTS = {
  privyAppId: "",
  feeRecipient: "",
  keeperApi: "",
  chainId: 4663,
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
  router: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948",
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  launchConfigId: 0,
  startBlock: 0,
  hlInfo: "https://api.hyperliquid.xyz/info",
  markets: ["BTC", "ETH", "HYPE", "SOL", "XRP", "DOGE"],
  maxLeverage: 20,
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

// ------------------------------------------------------------------ Hyperliquid prices
export const market = {}; // name -> { px, prev, maxLev }
const marketListeners = new Set();
export const onMarkets = (fn) => marketListeners.add(fn);

async function hl(body) {
  const r = await fetch(C.hlInfo, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Hyperliquid " + r.status);
  return r.json();
}

async function loadMarkets() {
  try {
    const [meta, ctxs] = await hl({ type: "metaAndAssetCtxs" });
    meta.universe.forEach((u, i) => {
      const prev = market[u.name];
      market[u.name] = {
        px: prev?.ws ? prev.px : Number(ctxs[i].markPx), // keep the fresher websocket price
        prev: Number(ctxs[i].prevDayPx),
        maxLev: u.maxLeverage,
        ws: prev?.ws ?? false,
      };
    });
  } catch {
    /* Hyperliquid unreachable: show no prices rather than made-up ones */
  }
  if (!tickerBuilt) renderTicker();
  paintPrices();
  marketListeners.forEach((fn) => fn(market));
}

// Live mid prices pushed by Hyperliquid's public websocket.
const lastShown = {};
let tickerBuilt = false, wsDirty = false;
function connectPrices() {
  let ws;
  try { ws = new WebSocket("wss://api.hyperliquid.xyz/ws"); } catch { return; }
  ws.onopen = () => ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "allMids" } }));
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.channel !== "allMids") return;
    const mids = msg.data?.mids ?? {};
    for (const m of C.markets) {
      if (mids[m] == null) continue;
      market[m] ??= { prev: 0, maxLev: C.maxLeverage };
      market[m].px = Number(mids[m]);
      market[m].ws = true;
      wsDirty = true;
    }
  };
  ws.onclose = () => setTimeout(connectPrices, 3000);
  ws.onerror = () => ws.close();
}

function renderTicker() {
  const el = $("ticker");
  if (!el) return;
  const have = C.markets.filter((m) => market[m]);
  const items = have.map((m) => `<span class="item" data-coin="${m}"><b>${m}-PERP</b><span class="p">—</span><span class="c"></span></span>`);
  if (!items.length) items.push(`<span class="item"><b>HYPERLIQUID</b>PRICES LOADING…</span>`);
  items.push(`<span class="item"><b>FEEVERAGE</b>$FEEV</span>`, `<span class="item"><b>FEES</b>→ LEVERAGED</span>`, `<span class="item"><b>ROBINHOOD</b>× HYPERLIQUID</span>`);
  const row = items.join("");
  el.innerHTML = row + row; // doubled for a seamless loop
  tickerBuilt = have.length > 0;
  Object.keys(lastShown).forEach((k) => delete lastShown[k]);
}

// Updates numbers in place and flashes green or red on every tick.
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
      if (dir) {
        el.classList.remove("tick-up", "tick-down");
        void el.offsetWidth; // restart the flash
        el.classList.add(dir);
      }
    });
    document.querySelectorAll(`[data-px="${m}"]`).forEach((s) => (s.textContent = text));
    lastShown[m] = d.px;
  }
}

setInterval(() => {
  if (!wsDirty) return;
  wsDirty = false;
  if (!tickerBuilt) renderTicker();
  paintPrices();
  marketListeners.forEach((fn) => fn(market));
}, 1000);

// ------------------------------------------------------------------ tokens
async function fromKeeper() {
  const r = await fetch(C.keeperApi.replace(/\/$/, "") + "/status.json", { cache: "no-store" });
  if (!r.ok) throw new Error("keeper " + r.status);
  return r.json();
}

const FEES_SWEPT = E ? E.id("FeesSwept(uint256,uint256,uint256)") : null;
async function addCurveFees(list) {
  const withCurve = list.filter((t) => t.curve);
  if (!withCurve.length) return;
  const latest = await provider.getBlockNumber();
  const first = Math.min(...withCurve.map((t) => t.block || latest));
  const byCurve = new Map(withCurve.map((t) => [t.curve.toLowerCase(), t]));
  withCurve.forEach((t) => (t.feesEth = 0));
  for (let from = first, n = 0; from <= latest && n < 60; from += 10_000, n++) {
    const logs = await provider.getLogs({ address: [...byCurve.keys()], topics: [FEES_SWEPT], fromBlock: from, toBlock: Math.min(latest, from + 9_999) });
    for (const l of logs) {
      const [, , creator] = E.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256"], l.data);
      const t = byCurve.get(l.address.toLowerCase());
      if (t) t.feesEth += Number(E.formatEther(creator));
    }
  }
}

async function fromChain() {
  const latest = await provider.getBlockNumber();
  const start = Math.max(C.startBlock || 0, latest - 300_000);
  const found = new Map();
  for (let from = latest; from > start && found.size < 120; from -= 10_000) {
    const logs = await factory.queryFilter(factory.filters.TokenLaunched(), Math.max(start, from - 9_999), from);
    for (const l of logs) found.set(l.args.token.toLowerCase(), { token: l.args.token, curve: l.args.curve, deployer: l.args.deployer, block: l.blockNumber });
  }
  for (const m of store.get("feeverage.launches", [])) if (!found.has(m.token.toLowerCase())) found.set(m.token.toLowerCase(), m);
  const out = [];
  await Promise.all([...found.values()].map(async (x) => {
    const info = await factory.getLaunchedToken(x.token).catch(() => null);
    if (!info || info.creatorFeeRecipient.toLowerCase() !== C.feeRecipient.toLowerCase()) return;
    const t = new E.Contract(x.token, TOKEN_ABI, provider);
    const [name, symbol, logo, description] = await Promise.all([t.name(), t.symbol(), t.logo().catch(() => ""), t.description().catch(() => "")]);
    const s = parseStrategy(description);
    if (!s) return;
    out.push({ token: x.token, curve: info.curve, deployer: info.deployer, name, symbol, logo, description, ...s, block: x.block ?? 0, feesEth: null, pendingEth: null, equityUsd: 0, notionalUsd: 0, pnlUsd: 0, liqPx: null });
  }));
  out.sort((a, b) => b.block - a.block);
  await addCurveFees(out);
  return out;
}

async function enrichCurves(list) {
  if (!chain.ok) return;
  await Promise.all(list.filter((t) => t.curve).map(async (t) => {
    const c = new E.Contract(t.curve, CURVE_ABI, provider);
    try {
      const [g, real, thr] = await Promise.all([c.graduated(), c.realQuoteReserve(), c.graduationThreshold()]);
      t.graduated = g;
      t.progress = g ? 1 : Number(real) / Number(thr || 1n);
      t.reserveEth = Number(E.formatEther(real));
      t.thresholdEth = Number(E.formatEther(thr));
    } catch {}
    if (!t.logo || t.description == null) {
      const tk = new E.Contract(t.token, TOKEN_ABI, provider);
      t.logo ||= await tk.logo().catch(() => "");
      t.description ??= await tk.description().catch(() => "");
    }
  }));
}

// Returns { tokens, totals, source, updatedAt }. Everything is real data; with no launches it is empty.
export async function loadTokens() {
  let tokens = [], totals = null, source, updatedAt = null;
  try {
    if (C.keeperApi) {
      const s = await fromKeeper();
      tokens = s.tokens.slice().reverse();
      totals = s.totals;
      updatedAt = s.updatedAt;
      source = `Keeper API · ${s.dryRun ? "dry run" : "live"}`;
    } else if (chain.ok && isAddr(C.feeRecipient)) {
      tokens = await fromChain();
      source = "Live from Robinhood Chain";
    } else throw new Error("no source");
    if (!tokens.length) source += " · no tokens launched yet";
  } catch {
    tokens = [];
    source = isAddr(C.feeRecipient) ? "Connecting to Robinhood Chain…" : "Live stats start once feeRecipient is set in config.js";
  }
  await enrichCurves(tokens);
  const sum = (k) => tokens.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const ethPx = market.ETH?.px ?? 0;
  totals ??= { tokens: tokens.length, feesEth: sum("feesEth"), feesUsd: sum("feesEth") * ethPx, equityUsd: sum("equityUsd"), notionalUsd: sum("notionalUsd"), pnlUsd: sum("pnlUsd") };
  return { tokens, totals, source, updatedAt };
}

// ------------------------------------------------------------------ token card
export function tokenCard(t) {
  const open = t.notionalUsd > 0;
  const side = open ? (t.isLong ? "long" : "short") : "idle";
  const img = t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ph">${esc((t.symbol || "?")[0])}</span>`;
  const pnlCls = t.pnlUsd > 0 ? "pos" : t.pnlUsd < 0 ? "neg" : "";
  const prog = Math.max(0, Math.min(1, t.progress ?? 0));
  return `<article class="card" data-href="${tokenUrl(t.token)}">
    <div class="head">${img}<div style="min-width:0"><b><a href="${tokenUrl(t.token)}">${esc(t.symbol)}</a></b><span>${esc(t.name)}</span></div></div>
    <div class="pos-row"><span class="chip ${side}">${t.leverage}× ${t.isLong ? "▲ LONG" : "▼ SHORT"} ${esc(t.market)}</span><span class="label ${open ? "" : "muted"}">${open ? "Position open" : "Waiting for fees"}</span></div>
    <dl>
      <div><dt>Fees routed</dt><dd>${t.feesEth == null ? "—" : fmt(t.feesEth, 4) + " ETH"}</dd></div>
      <div><dt>Margin</dt><dd>${t.equityUsd ? usd(t.equityUsd) : "—"}</dd></div>
      <div><dt>Notional</dt><dd>${open ? usd(t.notionalUsd) : "—"}</dd></div>
      <div><dt>uPnL</dt><dd class="${pnlCls}">${open ? (t.pnlUsd > 0 ? "+" : "") + usd(t.pnlUsd) : "—"}</dd></div>
    </dl>
    <div style="padding:10px 14px 14px"><div class="row2" style="display:flex;justify-content:space-between"><span class="label muted">${t.graduated ? "Graduated" : "Bonding curve"}</span><span class="label">${t.graduated ? "100%" : fmt(prog * 100, 0) + "%"}</span></div>
      <div style="display:flex;height:8px;border:2px solid var(--ink);margin-top:8px"><i style="display:block;width:${prog * 100}%;background:var(--yellow)"></i></div></div>
  </article>`;
}

export function wireCards(container) {
  container.addEventListener("click", (e) => {
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
  const tick = (t) => {
    if (el._rollId !== id) return;
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
    el.textContent = fmtFn(p < 1 ? to + (1 - e) * spread * Math.random() : to);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Wires every [data-stat] inside `root`: rolls on scroll-in and on data change.
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
  return (totals) => {
    els.forEach((el) => {
      const val = Number(totals[el.dataset.stat] ?? 0) || 0;
      if (Number(el.dataset.v) !== val) roll(el, val, el._fmt);
      if (el.dataset.stat === "pnlUsd") el.classList.toggle("pos", val > 0), el.classList.toggle("neg", val < 0);
    });
    root.querySelectorAll("[data-stat-sub=feesEth]").forEach((s) => (s.textContent = `${fmt(totals.feesEth ?? 0, 4)} ETH`));
  };
}

// ------------------------------------------------------------------ header + boot
export function initShell() {
  const page = document.body.dataset.page;
  document.querySelectorAll("nav.links a").forEach((a) => {
    if (a.dataset.page === page) a.setAttribute("aria-current", "page");
  });
  const b = $("connect");
  wallet.onChange((s) => {
    if (s.authenticated && s.address) b.textContent = short(s.address);
    else b.textContent = s.mode === "loading" ? "Loading…" : "Connect";
    b.disabled = s.mode === "loading";
  });
  b.addEventListener("click", async () => {
    try {
      if (wallet.state.authenticated) await wallet.disconnect();
      else await wallet.connect();
    } catch (e) {
      console.warn(e);
    }
  });
  const note = $("setupNote");
  if (note) {
    const missing = [];
    if (!isAddr(C.feeRecipient)) missing.push("<b>feeRecipient</b>");
    if (!C.keeperApi) missing.push("<b>keeperApi</b>");
    if (missing.length) {
      note.hidden = false;
      note.innerHTML = `Setup: fill in ${missing.join(" and ")} in <span class="mono">config.js</span>. Numbers stay at 0 until the first token is launched.`;
    }
  }
  loadMarkets();
  connectPrices();
  setInterval(loadMarkets, 30_000);
}
