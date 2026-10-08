import { wallet } from "./wallet.js";

const C = window.FEEVERAGE_CONFIG;
const E = window.ethers;
const $ = (id) => document.getElementById(id);
const ZERO = "0x0000000000000000000000000000000000000000";

// ------------------------------------------------------------------ ABIs
const ROUTER_ABI = [
  "function launchAndBuy((string name,string symbol,string logo,string description,(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt) params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut,address recipient,address[] snipeTaxExemptions) payable returns (address token,address curve,uint256 tokensOut)",
];
const FACTORY_ABI = [
  "function launchFee() view returns (uint256)",
  "function launchEnabled() view returns (bool)",
  "function canLaunch(address) view returns (bool)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function previewLaunchEconomics(uint256 launchConfigId,address pairToken) view returns (bytes32)",
  "function getLaunchedToken(address) view returns ((address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists))",
  "event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)",
];
const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function logo() view returns (string)",
  "function description() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const CURVE_ABI = [
  "function buy(uint256 quoteIn,uint256 minTokensOut,address recipient) payable returns (uint256)",
  "function sell(uint256 tokensIn,uint256 minQuoteOut,address recipient) returns (uint256)",
  "function sweepFees(uint256 minBuybackTokensOut)",
  "function graduated() view returns (bool)",
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
];

// Strategy tag stored in the token description (same format the keeper parses).
const TAG_RE = /feeverage:([A-Z0-9]{1,12}):([LS]):(\d{1,2})\b/;
const parseStrategy = (d) => {
  const m = TAG_RE.exec(d ?? "");
  return m ? { market: m[1], isLong: m[2] === "L", leverage: Number(m[3]) } : null;
};
const strategyLine = ({ market, isLong, leverage }) =>
  `Fees → ${leverage}x ${isLong ? "LONG" : "SHORT"} ${market} on Hyperliquid · feeverage:${market}:${isLong ? "L" : "S"}:${leverage}`;

// ------------------------------------------------------------------ format
const fmt = (n, d = 2) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (n, d = 2) => (n < 0 ? "−$" : "$") + fmt(Math.abs(n), d);
const compactUsd = (n) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? fmt(a / 1e9, 2) + "B" : a >= 1e6 ? fmt(a / 1e6, 2) + "M" : a >= 1e3 ? fmt(a / 1e3, 1) + "K" : fmt(a, 2);
  return (n < 0 ? "−$" : "$") + s;
};
const px = (n) => (n == null || !isFinite(n) ? "—" : n >= 1000 ? fmt(n, 0) : n >= 1 ? fmt(n, 2) : fmt(n, 5));
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a ?? "");
const errMsg = (e) => esc(e?.shortMessage || e?.info?.error?.message || e?.reason || e?.message || String(e));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ------------------------------------------------------------------ chain + HL
const provider = E ? new E.JsonRpcProvider(C.rpc, C.chainId, { staticNetwork: true }) : null;
const factory = provider ? new E.Contract(C.factory, FACTORY_ABI, provider) : null;
let chainOk = false;

async function hl(body) {
  const r = await fetch(C.hlInfo, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Hyperliquid " + r.status);
  return r.json();
}

const market = {}; // name -> { px, prev, maxLev }

async function loadMarkets() {
  try {
    const [meta, ctxs] = await hl({ type: "metaAndAssetCtxs" });
    meta.universe.forEach((u, i) => (market[u.name] = { px: Number(ctxs[i].markPx), prev: Number(ctxs[i].prevDayPx), maxLev: u.maxLeverage, live: true }));
  } catch {
    /* Hyperliquid unreachable: show no prices rather than made-up ones */
  }
  renderTicker();
  renderMarkets();
  update();
}

function renderTicker() {
  const items = C.markets.filter((m) => market[m]).map((m) => {
    const { px: p, prev } = market[m];
    const ch = prev ? ((p - prev) / prev) * 100 : 0;
    return `<span class="item"><b>${m}-PERP</b>${px(p)}<span class="${ch >= 0 ? "up" : "down"}">${ch >= 0 ? "▲" : "▼"} ${fmt(Math.abs(ch), 2)}%</span></span>`;
  });
  if (!items.length) items.push(`<span class="item"><b>HYPERLIQUID</b>PRICES LOADING…</span>`);
  items.push(`<span class="item"><b>FEEVERAGE</b>$FEEV</span>`, `<span class="item"><b>FEES</b>→ LEVERAGED</span>`, `<span class="item"><b>ROBINHOOD</b>× HYPERLIQUID</span>`);
  const row = items.join("");
  $("ticker").innerHTML = row + row; // doubled for a seamless loop
}

// ------------------------------------------------------------------ hero animation
function bars(el, lev, max = 20) {
  el.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < lev ? "" : "ghost"}" style="animation-delay:${i * 18}ms"></i>`).join("");
}

function heroLoop() {
  const wm = $("wordmark");
  requestAnimationFrame(() => setTimeout(() => wm.classList.remove("folded"), 120));
  if (!reduceMotion) {
    addEventListener("pointermove", (e) => {
      const x = (e.clientX / innerWidth - 0.5) * 2, y = (e.clientY / innerHeight - 0.5) * 2;
      wm.style.setProperty("--dx", `${7 + x * 4}px`);
      wm.style.setProperty("--dy", `${7 + y * 3}px`);
    }, { passive: true });
  }
  const seq = [["BTC", 5, true], ["HYPE", 10, true], ["ETH", 3, false], ["SOL", 20, true], ["BTC", 2, false]];
  let k = 0;
  const step = () => {
    const [m, lev, long] = seq[k++ % seq.length];
    bars($("heroBars"), lev);
    $("heroLev").textContent = lev + "×";
    $("heroMarket").textContent = `${m}-PERP`;
    $("heroMode").textContent = `cross · ${long ? "long" : "short"}`;
    $("heroNotional").textContent = `$${lev} of ${m}`;
  };
  step();
  if (!reduceMotion) setInterval(step, 2600);
}

// Stats roll like a counter every time they scroll into view (and when the data changes),
// then settle on the real value, which is 0 until tokens are launched.
function roll(el, to, fmtFn, dur = 1200) {
  el.dataset.v = to;
  el._fmt = fmtFn;
  if (reduceMotion) return (el.textContent = fmtFn(to));
  const t0 = performance.now();
  const spread = Math.max(Math.abs(to), Number(el.dataset.spread ?? 1000));
  const id = (el._rollId = (el._rollId ?? 0) + 1);
  const tick = (t) => {
    if (el._rollId !== id) return;
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
    const noise = (1 - e) * spread * Math.random();
    el.textContent = fmtFn(p < 1 ? to + noise : to);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function rollAll() {
  document.querySelectorAll("[data-stat]").forEach((el, i) => {
    if (el._fmt) setTimeout(() => roll(el, Number(el.dataset.v), el._fmt), i * 90);
  });
}
const statsObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => entries.forEach((en) => en.isIntersecting && rollAll()), { threshold: 0.4 })
  : null;

// ------------------------------------------------------------------ launch form
const form = { market: "BTC", isLong: true, lev: 5 };
let launchFee = null, maxTaxBps = 1000n, canLaunchMe = null, launchOpen = null;

function renderMarkets() {
  $("markets").innerHTML = C.markets.map((m) =>
    `<button type="button" data-m="${m}" aria-pressed="${m === form.market}">${m}<span class="px">${market[m] ? px(market[m].px) : ""}</span></button>`,
  ).join("");
}
$("markets").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-m]");
  if (!b) return;
  form.market = b.dataset.m;
  renderMarkets();
  update();
});
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
  form.isLong = b.dataset.side === "long";
  document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  update();
}));
["lev", "buy", "symbol", "tax"].forEach((id) => $(id).addEventListener("input", update));
$("logo").addEventListener("input", () => {
  const u = $("logo").value.trim();
  $("logoPrev").style.backgroundImage = /^https?:\/\//.test(u) ? `url("${u.replace(/"/g, "")}")` : "";
});

function update() {
  const maxL = Math.min(C.maxLeverage, market[form.market]?.maxLev ?? C.maxLeverage);
  $("lev").max = String(maxL);
  if (Number($("lev").value) > maxL) $("lev").value = String(maxL);
  form.lev = Number($("lev").value);
  const sym = ($("symbol").value || "FEEV").toUpperCase();
  const side = form.isLong ? "long" : "short";
  $("levOut").textContent = form.lev + "×";
  $("sumTitle").textContent = `${sym} → ${form.lev}× ${side} ${form.market}`;
  bars($("sumBars"), form.lev);
  $("figLeft").textContent = `$1 fees → $${form.lev} ${form.market}`;
  $("figRight").textContent = `${form.lev}× ${side}`;
  $("sumExp").textContent = `$${fmt(100 * 0.95 * form.lev, 0)} ${form.market}`;
  const liq = form.lev === 1 ? (form.isLong ? 99 : 100) : Math.max(0, 100 / form.lev - 1);
  $("sumLiq").textContent = `≈ ${fmt(liq, 1)}% ${form.isLong ? "down" : "up"}`;
  $("markLbl").textContent = form.market;
  $("sumMark").textContent = market[form.market] ? "$" + px(market[form.market].px) : "—";

  const buy = Math.max(0, Number($("buy").value) || 0);
  $("sumBuy").textContent = `${fmt(buy, 4)} ETH`;
  if (launchFee != null) {
    const fee = Number(E.formatEther(launchFee));
    $("sumFee").textContent = `${fmt(fee, 4)} ETH`;
    $("sumTotal").textContent = `${fmt(fee + buy, 4)} ETH`;
  } else {
    $("sumFee").textContent = chainOk ? "…" : "read on-chain";
    $("sumTotal").textContent = `${fmt(buy, 4)} ETH + fee`;
  }
  renderChecks();
}

function renderChecks() {
  const w = wallet.state;
  const rows = [
    [isAddr(C.feeRecipient), "Fee recipient set", "Set feeRecipient in config.js"],
    [chainOk, "Robinhood Chain reachable", "RPC not reachable from this page"],
    [w.authenticated, w.address ? `Wallet ${short(w.address)}` : "Wallet connected", "Connect a wallet"],
    [canLaunchMe !== false, canLaunchMe ? "Launching allowed for this wallet" : "Launch permission", "Launching is gated for this wallet right now"],
  ];
  $("checks").innerHTML = rows.map(([ok, good, bad]) =>
    `<div><span class="sq ${ok ? "live" : "off"}"></span>${esc(ok ? good : bad)}</div>`).join("");
}

function setStatus(msg, kind = "") {
  $("launchStatus").className = "status " + kind;
  $("launchStatus").innerHTML = msg;
}

async function refreshGate() {
  if (!factory) return;
  try {
    const [fee, open, tax] = await Promise.all([factory.launchFee(), factory.launchEnabled(), factory.maxCreatorTaxBps()]);
    chainOk = true;
    launchFee = fee; launchOpen = open; maxTaxBps = tax;
    $("tax").max = String(Number(tax) / 100);
    const me = wallet.state.address;
    canLaunchMe = me ? await factory.canLaunch(me) : null;
    const ok = me ? canLaunchMe : open;
    $("gate").innerHTML = `<span class="sq ${ok ? "live" : "off"}"></span>${ok ? "Launching open" : "Launching gated"}`;
    $("netDot").className = "sq live";
  } catch (e) {
    chainOk = false;
    $("gate").innerHTML = `<span class="sq off"></span>Chain unreachable`;
    $("netDot").className = "sq off";
  }
  update();
}

$("launchForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = $("name").value.trim(), symbol = $("symbol").value.trim().toUpperCase();
  const buyEth = Number($("buy").value) || 0;
  if (!E) return setStatus("ethers did not load. Check your connection and reload.", "err");
  if (!isAddr(C.feeRecipient)) return setStatus("Set <b>feeRecipient</b> in config.js to the keeper operator address (or your own wallet for a test).", "err");
  if (!name || !symbol) return setStatus("Name and ticker are required.", "err");
  if (buyEth < 0.0001) return setStatus("The first buy must be at least 0.0001 ETH.", "err");

  const btn = $("launchBtn");
  btn.disabled = true;
  try {
    setStatus("Connecting wallet…");
    const signer = await wallet.signer();
    const me = await signer.getAddress();
    const f = new E.Contract(C.factory, FACTORY_ABI, provider);
    const [fee, allowed, econ] = await Promise.all([f.launchFee(), f.canLaunch(me), f.previewLaunchEconomics(C.launchConfigId, ZERO)]);
    if (!allowed) throw new Error("Launching is gated on Robinhood Chain right now for this wallet.");

    const taxBps = Math.round(Math.min(Number(maxTaxBps) / 100, Math.max(0, Number($("tax").value) || 0)) * 100);
    const strat = { market: form.market, isLong: form.isLong, leverage: form.lev };
    const desc = ($("desc").value.trim() + "\n\n" + strategyLine(strat)).trim();
    if (new TextEncoder().encode(desc).length > 2048) throw new Error("Description is too long.");
    const params = [
      name, symbol, $("logo").value.trim(), desc,
      [$("x").value.trim(), $("tg").value.trim(), "", $("web").value.trim(), ""],
      C.feeRecipient, taxBps, false, econ, E.hexlify(E.randomBytes(32)),
    ];
    const quoteIn = E.parseEther(String(buyEth));
    const value = fee + quoteIn;
    const router = new E.Contract(C.router, ROUTER_ABI, signer);
    const args = [params, C.launchConfigId, ZERO, quoteIn, 0n, me, [me]];

    setStatus("Simulating…");
    await router.launchAndBuy.staticCall(...args, { value });
    setStatus("Confirm the launch in your wallet…");
    const tx = await router.launchAndBuy(...args, { value });
    setStatus(`Sent. Waiting for the block… <a href="${C.explorer}/tx/${tx.hash}" target="_blank" rel="noopener">view tx</a>`);
    const rc = await tx.wait();
    const ev2 = rc.logs.map((l) => { try { return f.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "TokenLaunched");
    const token = ev2?.args?.token, curve = ev2?.args?.curve;
    if (token) {
      const mine = store.get("feeverage.launches", []);
      mine.unshift({ token, curve, deployer: me, block: rc.blockNumber, name, symbol, logo: $("logo").value.trim(), ...strat, at: Date.now(), tx: tx.hash });
      store.set("feeverage.launches", mine.slice(0, 50));
    }
    setStatus(`✓ ${esc(symbol)} is live${token ? ` at <a href="${C.explorer}/token/${token}" target="_blank" rel="noopener">${short(token)}</a>` : ""}. Fees start flowing to its ${form.lev}× ${form.isLong ? "long" : "short"} ${form.market} position on the keeper's next run.`, "ok");
    loadTokens();
    document.getElementById("tokens").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  } catch (e) {
    setStatus(errMsg(e), "err");
  } finally {
    btn.disabled = false;
  }
});

// ------------------------------------------------------------------ tokens + stats

let tokens = [];
let sortBy = "new";
let source = "loading";

async function fromKeeper() {
  const r = await fetch(C.keeperApi.replace(/\/$/, "") + "/status.json", { cache: "no-store" });
  if (!r.ok) throw new Error("keeper " + r.status);
  return r.json();
}

// Creator-side fees each token has released, read from its curve's FeesSwept events.
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
  for (let from = latest; from > start && found.size < 60; from -= 10_000) {
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
    out.push({ token: x.token, curve: info.curve, deployer: info.deployer, name, symbol, logo, ...s, block: x.block ?? 0, feesEth: null, pendingEth: null, equityUsd: 0, notionalUsd: 0, pnlUsd: 0, liqPx: null });
  }));
  out.sort((a, b) => b.block - a.block);
  await addCurveFees(out);
  return out;
}

async function enrichCurves(list) {
  if (!chainOk) return;
  await Promise.all(list.filter((t) => t.curve).map(async (t) => {
    const c = new E.Contract(t.curve, CURVE_ABI, provider);
    try {
      const [g, real, thr] = await Promise.all([c.graduated(), c.realQuoteReserve(), c.graduationThreshold()]);
      t.graduated = g;
      t.progress = g ? 1 : Number(real) / Number(thr || 1n);
      t.reserveEth = Number(E.formatEther(real));
      t.thresholdEth = Number(E.formatEther(thr));
    } catch {}
    if (!t.logo) {
      t.logo = await new E.Contract(t.token, TOKEN_ABI, provider).logo().catch(() => "");
    }
  }));
}

async function loadTokens() {
  let totals = null;
  try {
    if (C.keeperApi) {
      const s = await fromKeeper();
      tokens = s.tokens.slice().reverse();
      totals = s.totals;
      source = `Keeper API · ${s.dryRun ? "dry run" : "live"}`;
      $("statsTime").textContent = s.updatedAt ? "Updated " + new Date(s.updatedAt).toLocaleTimeString() : "";
    } else if (chainOk && isAddr(C.feeRecipient)) {
      tokens = await fromChain();
      source = "Read from Robinhood Chain · add a keeper API for fees and positions";
    } else throw new Error("no source");
    if (!tokens.length) source += " · no tokens launched yet";
  } catch {
    tokens = [];
    source = isAddr(C.feeRecipient) ? "Waiting for Robinhood Chain…" : "Live stats start once feeRecipient is set in config.js";
  }
  await enrichCurves(tokens);
  renderCards();
  renderStats(totals);
}

function renderStats(t) {
  const sum = (k) => tokens.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const ethPx = market.ETH?.px ?? 0;
  const v = t ?? { tokens: tokens.length, feesEth: sum("feesEth"), feesUsd: sum("feesEth") * ethPx, equityUsd: sum("equityUsd"), notionalUsd: sum("notionalUsd"), pnlUsd: sum("pnlUsd") };
  const set = (k, val, f) => {
    const el = document.querySelector(`[data-stat="${k}"]`);
    if (!el) return;
    const changed = el._fmt == null || Number(el.dataset.v) !== Number(val);
    el.dataset.v = val;
    el._fmt = f;
    if (changed) roll(el, Number(val) || 0, f);
  };
  set("tokens", v.tokens, (n) => fmt(n, 0));
  set("feesUsd", v.feesUsd, compactUsd);
  set("equityUsd", v.equityUsd, compactUsd);
  set("notionalUsd", v.notionalUsd, compactUsd);
  set("pnlUsd", v.pnlUsd, (n) => (n > 0 ? "+" : "") + compactUsd(n));
  document.querySelector('[data-stat="pnlUsd"]').className = "v " + (v.pnlUsd > 0 ? "pos" : v.pnlUsd < 0 ? "neg" : "");
  document.querySelector('[data-stat-sub="feesEth"]').textContent = `${fmt(v.feesEth ?? 0, 4)} ETH`;
  $("statsSource").textContent = source;
}

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  sortBy = b.dataset.sort;
  document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  renderCards();
}));
$("refresh").addEventListener("click", loadTokens);

function card(t, i) {
  const open = t.notionalUsd > 0;
  const side = open ? (t.isLong ? "long" : "short") : "idle";
  const img = t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ph">${esc((t.symbol || "?")[0])}</span>`;
  const pnlCls = t.pnlUsd > 0 ? "pos" : t.pnlUsd < 0 ? "neg" : "";
  const prog = Math.max(0, Math.min(1, t.progress ?? 0));
  return `<article class="card">
    <div class="head">${img}<div style="min-width:0"><b>${esc(t.symbol)}</b><span>${esc(t.name)}</span></div></div>
    <div class="pos-row"><span class="chip ${side}">${t.leverage}× ${t.isLong ? "▲ LONG" : "▼ SHORT"} ${esc(t.market)}</span><span class="label ${open ? "" : "muted"}">${open ? "Position open" : "Waiting for fees"}</span></div>
    <dl>
      <div><dt>Fees routed</dt><dd>${t.feesEth == null ? "—" : fmt(t.feesEth, 4) + " ETH"}</dd></div>
      <div><dt>Margin</dt><dd>${t.equityUsd ? usd(t.equityUsd) : "—"}</dd></div>
      <div><dt>Notional</dt><dd>${open ? usd(t.notionalUsd) : "—"}</dd></div>
      <div><dt>uPnL</dt><dd class="${pnlCls}">${open ? (t.pnlUsd > 0 ? "+" : "") + usd(t.pnlUsd) : "—"}</dd></div>
      <div><dt>Liq. price</dt><dd>${px(t.liqPx)}</dd></div>
      <div><dt>${t.graduated ? "Status" : "Curve"}</dt><dd>${t.graduated ? "Graduated" : fmt(prog * 100, 0) + "%"}</dd></div>
    </dl>
    <div style="padding:0 14px 4px"><div class="bar" style="display:flex;height:8px;border:2px solid var(--ink);margin-top:10px"><i style="display:block;width:${prog * 100}%;background:var(--yellow);border-right:${prog > 0 && prog < 1 ? "2px solid var(--ink)" : "0"}"></i></div></div>
    <div class="foot">
      <button class="btn sm" type="button" data-open="${i}">Trade</button>
      ${t.hlAccount ? `<a href="https://app.hyperliquid.xyz/explorer/address/${t.hlAccount}" target="_blank" rel="noopener">Position ↗</a>` : ""}
      ${t.token ? `<a href="${C.explorer}/token/${t.token}" target="_blank" rel="noopener">Contract ↗</a>` : ""}
    </div>
  </article>`;
}

function renderCards() {
  const list = tokens.slice();
  if (sortBy === "fees") list.sort((a, b) => (b.feesEth ?? 0) - (a.feesEth ?? 0));
  if (sortBy === "pnl") list.sort((a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0));
  window.__cards = list;
  $("cards").innerHTML = list.length
    ? list.map(card).join("")
    : `<div class="empty" style="grid-column:1/-1"><h3>No tokens yet</h3><p class="muted" style="margin-top:8px">Launch the first one above. New launches appear here automatically.</p></div>`;
}

// ------------------------------------------------------------------ trade dialog
const dlg = $("tokenDlg");
$("dlgClose").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

$("cards").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-open]");
  if (!b) return;
  openToken(window.__cards[Number(b.dataset.open)]);
});

function openToken(t) {
  $("dlgTitle").textContent = `${t.symbol} · ${t.leverage}× ${t.isLong ? "long" : "short"} ${t.market}`;
  const me = wallet.state.address?.toLowerCase();
  const isCreator = me && t.deployer && me === t.deployer.toLowerCase();
  $("dlgBody").innerHTML = `
    ${t.graduated
      ? `<p>This token graduated from its bonding curve and now trades on a Uniswap v4 pool on Robinhood Chain. Use any Robinhood Chain swap app with the contract address below.</p>`
      : `<div class="seg" role="group" aria-label="Trade side"><button type="button" data-t="buy" aria-pressed="true">BUY</button><button type="button" data-t="sell" aria-pressed="false">SELL</button></div>
         <label class="f" for="tAmt"><span id="tAmtLbl">Pay (ETH)</span><input id="tAmt" type="number" min="0" step="0.001" value="0.001"></label>
         <div class="label muted" id="tQuote">Enter an amount</div>
         <button class="btn dark" id="tGo" type="button" style="width:100%">Buy ${esc(t.symbol)}</button>`}
    <div class="status" id="tStatus"></div>
    <dl class="kv">
      <dt>Contract</dt><dd><a href="${C.explorer}/token/${t.token ?? ""}" target="_blank" rel="noopener">${short(t.token) || "—"}</a></dd>
      <dt>Hyperliquid account</dt><dd>${t.hlAccount ? `<a href="https://app.hyperliquid.xyz/explorer/address/${t.hlAccount}" target="_blank" rel="noopener">${short(t.hlAccount)}</a>` : "assigned by keeper"}</dd>
      <dt>Fees not yet bridged</dt><dd>${t.pendingEth == null ? "—" : fmt(t.pendingEth, 4) + " ETH"}</dd>
      <dt>Entry price</dt><dd>${px(t.entryPx)}</dd>
    </dl>
    ${isCreator && !t.graduated ? `<button class="btn ghost" id="tPush" type="button">Push fees to the position</button><p class="note">You launched this token, so you can release its collected curve fees now instead of waiting for graduation.</p>` : ""}`;
  dlg.showModal();
  if (!t.graduated) wireTrade(t);
  $("tPush")?.addEventListener("click", async () => {
    try {
      const s = await wallet.signer();
      await (await new E.Contract(t.curve, CURVE_ABI, s).sweepFees(0)).wait();
      $("tStatus").className = "status ok";
      $("tStatus").textContent = "Fees released. The keeper bridges them on its next run.";
    } catch (e) {
      $("tStatus").className = "status err";
      $("tStatus").innerHTML = errMsg(e);
    }
  });
}

function wireTrade(t) {
  let side = "buy", quote = null, timer;
  const seg = dlg.querySelectorAll(".seg button");
  seg.forEach((b) => b.addEventListener("click", () => {
    side = b.dataset.t;
    seg.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("tAmtLbl").textContent = side === "buy" ? "Pay (ETH)" : `Sell (${t.symbol})`;
    $("tGo").textContent = side === "buy" ? `Buy ${t.symbol}` : `Sell ${t.symbol}`;
    requote();
  }));
  const requote = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      quote = null;
      const v = Number($("tAmt").value);
      if (!(v > 0) || !chainOk) return ($("tQuote").textContent = chainOk ? "Enter an amount" : "Chain unreachable");
      const from = wallet.state.address ?? C.feeRecipient;
      try {
        const c = new E.Contract(t.curve, CURVE_ABI, provider);
        const amt = E.parseEther(String(v));
        if (side === "buy") {
          const out = await c.buy.staticCall(amt, 0n, from, { value: amt, from });
          quote = { amt, out };
          $("tQuote").textContent = `≈ ${fmt(Number(E.formatEther(out)), 2)} ${t.symbol}`;
        } else {
          const out = await c.sell.staticCall(amt, 0n, from, { from });
          quote = { amt, out };
          $("tQuote").textContent = `≈ ${fmt(Number(E.formatEther(out)), 6)} ETH`;
        }
      } catch (e) {
        $("tQuote").textContent = side === "sell" ? "Approve first or check your balance" : "Could not quote";
      }
    }, 300);
  };
  $("tAmt").addEventListener("input", requote);
  requote();
  $("tGo").addEventListener("click", async () => {
    const st = $("tStatus");
    try {
      const v = Number($("tAmt").value);
      if (!(v > 0)) throw new Error("Enter an amount.");
      const s = await wallet.signer();
      const me = await s.getAddress();
      const c = new E.Contract(t.curve, CURVE_ABI, s);
      const amt = E.parseEther(String(v));
      st.className = "status"; st.textContent = "Confirm in your wallet…";
      if (side === "buy") {
        const out = await c.buy.staticCall(amt, 0n, me, { value: amt });
        await (await c.buy(amt, (out * 97n) / 100n, me, { value: amt })).wait();
      } else {
        const tok = new E.Contract(t.token, TOKEN_ABI, s);
        if ((await tok.allowance(me, t.curve)) < amt) {
          st.textContent = "Approve the token first…";
          await (await tok.approve(t.curve, E.MaxUint256)).wait();
        }
        const out = await c.sell.staticCall(amt, 0n, me);
        await (await c.sell(amt, (out * 97n) / 100n, me)).wait();
      }
      st.className = "status ok"; st.textContent = "Done. Every trade feeds the position.";
      loadTokens();
    } catch (e) {
      st.className = "status err"; st.innerHTML = errMsg(e);
    }
  });
}

// ------------------------------------------------------------------ wallet button
wallet.onChange((s) => {
  const b = $("connect");
  if (s.authenticated && s.address) b.textContent = short(s.address);
  else b.textContent = s.mode === "loading" ? "Loading…" : "Connect";
  b.disabled = s.mode === "loading";
  refreshGate();
});
$("connect").addEventListener("click", async () => {
  try {
    if (wallet.state.authenticated) await wallet.disconnect();
    else await wallet.connect();
  } catch (e) {
    setStatus(errMsg(e), "err");
  }
});

// ------------------------------------------------------------------ setup note + boot
function setupNote() {
  const missing = [];
  if (!isAddr(C.feeRecipient)) missing.push("<b>feeRecipient</b> (keeper operator address)");
  if (!C.keeperApi) missing.push("<b>keeperApi</b> (for fees, positions and stats)");
  if (missing.length) {
    $("setupNote").hidden = false;
    $("setupNote").innerHTML = `Setup: fill in ${missing.join(" and ")} in <span class="mono">config.js</span>. Stats stay at 0 until the first token is launched.`;
  }
}

heroLoop();
document.querySelectorAll("[data-stat]").forEach((el) => {
  el.dataset.v = 0;
  el._fmt = el.dataset.stat === "tokens" ? (n) => fmt(n, 0) : el.dataset.stat === "pnlUsd" ? (n) => (n > 0 ? "+" : "") + compactUsd(n) : compactUsd;
});
if (statsObserver) statsObserver.observe($("stats"));
setupNote();
renderMarkets();
update();
loadMarkets();
refreshGate().then(loadTokens);
setInterval(loadMarkets, 30_000);
setInterval(loadTokens, 60_000);
