import {
  $, C, CURVE_ABI, E, TOKEN_ABI, chain, compactUsd, errMsg, esc, ethPx, fmt, holdingLive, initShell, isAddr, live, loadHoldings, loadTokens,
  onMarkets, provider, px, readChain, refreshTokenPrices, short, stripTag, t, tokenLogo, usd, wallet,
} from "./core.js";

initShell();

const addr = new URLSearchParams(location.search).get("t") ?? "";
let raw = null;

const cell = (k, v, cls = "", f = "") => `<div><dt>${t(k)}</dt><dd class="${cls}" ${f ? `data-f="${f}"` : ""}>${v}</dd></div>`;

// Static parts: rebuilt on data load and on language change.
function render() {
  if (!raw) return;
  const x = live(raw);
  document.title = `$${x.symbol} · Feeverage`;
  $("hero").innerHTML = `${tokenLogo(x)}<div style="min-width:0"><span class="label muted">${esc(x.name)}</span><h1 style="margin-top:6px">$${esc(x.symbol)}</h1></div>
    <div class="chipline"><span class="mk" style="font-size:13px;padding:9px 11px;${x.isLong ? "background:var(--yellow);color:var(--on-yellow)" : "background:var(--solid);color:var(--yellow)"}">${x.isLong ? "▲ LONG" : "▼ SHORT"} ${esc(x.market)} ${x.leverage}×</span></div>`;
  $("mstats").innerHTML = [
    cell("t.pnl", "—", "", "pnl"),
    cell("t.mark", "—", "", "mark"),
    cell("t.entry", px(x.entryPx), "", "entry"),
    cell("t.liq", px(x.liqPx), "", "liq"),
    cell("t.notional", "—", "", "notional"),
    cell("t.margin", "—", "", "margin"),
    cell("t.funded", usd(x.bridgedUsd ?? 0), "", "funded"),
    cell("t.fees", x.feesEth == null ? "—" : fmt(x.feesEth, 4) + " ETH", "", "fees"),
    cell("t.mcap", "—", "", "mcap"),
  ].join("");
  const prog = Math.max(0, Math.min(1, x.progress ?? 0));
  $("curveBar").style.width = prog * 100 + "%";
  $("curvePct").textContent = x.graduated ? "100%" : fmt(prog * 100, 0) + "%";
  $("curveText").textContent = x.graduated ? t("t.curve.grad")
    : x.reserveEth != null ? `${fmt(x.reserveEth, 4)} / ${fmt(x.thresholdEth, 4)} ETH ${t("t.curve.to")}` : "";
  $("desc").textContent = stripTag(x.description) || t("t.nodesc");
  $("links").innerHTML = `
    <dt>${t("t.contract")}</dt><dd><a href="${C.explorer}/token/${x.token}" target="_blank" rel="noopener">${short(x.token)} ↗</a></dd>
    <dt>${t("t.creator")}</dt><dd>${x.deployer ? `<a href="${C.explorer}/address/${x.deployer}" target="_blank" rel="noopener">${short(x.deployer)} ↗</a>` : "—"}</dd>
    <dt>${t("t.hl")}</dt><dd>${isAddr(x.hlAccount) ? `<a href="https://app.hyperliquid.xyz/explorer/address/${x.hlAccount}" target="_blank" rel="noopener">${short(x.hlAccount)} ↗</a>` : t("t.hl.wait")}</dd>`;
  const me = wallet.state.address?.toLowerCase();
  $("push").hidden = !(me && x.deployer && me === x.deployer.toLowerCase() && !x.graduated);
  $("trade").hidden = Boolean(x.graduated);
  $("gradNote").hidden = !x.graduated;
  tickLive(true);
}

// Live parts: every price tick.
let lastPnl = null;
function tickLive(force) {
  if (!raw) return;
  const x = live(raw);
  const set = (f, v, cls) => {
    const el = document.querySelector(`[data-f="${f}"]`);
    if (!el) return;
    if (el.textContent !== v) el.textContent = v;
    if (cls != null) el.className = cls;
  };
  const pnlTxt = x.open ? (x.pnlUsd > 0 ? "+" : "") + usd(x.pnlUsd) : t("t.nopos");
  set("pnl", pnlTxt, x.pnlUsd > 0 ? "pos" : x.pnlUsd < 0 ? "neg" : "");
  if (!force && lastPnl != null && x.open && x.pnlUsd !== lastPnl) {
    const el = document.querySelector('[data-f="pnl"]');
    el.classList.add(x.pnlUsd > lastPnl ? "flash-up" : "flash-down");
  }
  lastPnl = x.pnlUsd;
  set("mark", x.markPx != null ? px(x.markPx) : "—");
  set("notional", x.open ? usd(x.notionalUsd) : "—");
  set("margin", x.equityUsd ? usd(x.equityUsd) : "—");
  set("mcap", x.mcapUsd != null ? compactUsd(x.mcapUsd) : "—");
  $("nextTxt").textContent = `${usd(x.pendingUsd)} / $${C.minTopUpUsd}`;
  $("nextBar").style.width = Math.min(100, (x.pendingUsd / C.minTopUpUsd) * 100) + "%";

  // Health gauge: distance to liquidation, live.
  const d = x.liqDist;
  let word = t("t.nopos"), deg = -90, dist = "";
  if (x.open && d != null) {
    word = d > 0.25 ? t("t.h.safe") : d > 0.12 ? t("t.h.ok") : d > 0.05 ? t("t.h.tight") : t("t.h.danger");
    deg = Math.max(-90, Math.min(90, -90 + Math.min(1, d / 0.4) * 180));
    dist = `${fmt(Math.max(0, d) * 100, 1)}% ${t("t.toliq")}`;
  } else if (x.open) {
    word = t("t.h.safe"); deg = 90;
  }
  $("hWord").textContent = word;
  $("hWord").style.color = !x.open ? "var(--muted)" : d == null || d > 0.12 ? "var(--up)" : d > 0.05 ? "var(--ink)" : "var(--down)";
  $("hDist").textContent = dist;
  $("needle").style.transform = `rotate(${deg}deg)`;
  paintYou();
}

// ------------------------------------------------------------------ the connected wallet's own position
let mine = null;
async function loadMine() {
  const w = wallet.state;
  if (!raw || !(w.authenticated && w.address)) { mine = null; $("youBox").hidden = true; return; }
  const [h] = await loadHoldings(w.address, [raw]);
  mine = h ?? { balance: 0, spentEth: 0, receivedEth: 0, avgEth: null };
  $("youBox").hidden = false;
  paintYou();
}
function paintYou() {
  if (!mine || !raw) return;
  if (!(mine.balance > 0) && !(mine.spentEth > 0)) { $("you").innerHTML = `<div style="grid-column:1/-1;border:0"><dd class="muted" style="font-weight:500">${t("t.you.none")}</dd></div>`; return; }
  const L = holdingLive({ ...mine, spotEth: raw.spotEth });
  const c = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
  $("you").innerHTML = `
    <div><dt>${t("p.bal")}</dt><dd>${fmt(mine.balance, mine.balance >= 1000 ? 0 : 2)}</dd></div>
    <div><dt>${t("p.val")}</dt><dd>${L.valueUsd != null ? usd(L.valueUsd) : "—"}</dd></div>
    <div><dt>${t("p.avg")}</dt><dd>${ethPx(mine.avgEth)}</dd></div>
    <div><dt>${t("p.ret")}</dt><dd class="${c(L.pnlUsd)}">${L.pnlUsd != null ? (L.pnlUsd > 0 ? "+" : "") + usd(L.pnlUsd) + ` (${L.pnlPct > 0 ? "+" : ""}${fmt(L.pnlPct, 1)}%)` : "—"}</dd></div>`;
}

// ------------------------------------------------------------------ trade
let side = "buy", timer;
document.querySelectorAll("#trade .seg button").forEach((b) => b.addEventListener("click", () => {
  side = b.dataset.t;
  document.querySelectorAll("#trade .seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("tAmtLbl").textContent = side === "buy" ? t("t.pay") : `${t("t.sellamt")} ($${raw?.symbol ?? ""})`;
  $("tGo").textContent = side === "buy" ? t("t.buy") : t("t.sell");
  requote();
}));
function requote() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const v = Number($("tAmt").value);
    if (!raw || !(v > 0) || !chain.ok) return ($("tQuote").textContent = t("t.quote"));
    const from = wallet.state.address ?? C.feeRecipient;
    try {
      const c = new E.Contract(raw.curve, CURVE_ABI, provider);
      const amt = E.parseEther(String(v));
      if (side === "buy") {
        const out = await c.buy.staticCall(amt, 0n, from, { value: amt, from });
        $("tQuote").textContent = `≈ ${fmt(Number(E.formatEther(out)), 2)} $${raw.symbol}`;
      } else {
        const out = await c.sell.staticCall(amt, 0n, from, { from });
        $("tQuote").textContent = `≈ ${fmt(Number(E.formatEther(out)), 6)} ETH`;
      }
    } catch {
      $("tQuote").textContent = side === "sell" ? t("t.approve") : t("t.noquote");
    }
  }, 300);
}
$("tAmt").addEventListener("input", requote);

$("tGo").addEventListener("click", async () => {
  const st = $("tStatus");
  try {
    const v = Number($("tAmt").value);
    if (!(v > 0)) throw new Error(t("t.quote"));
    const s = await wallet.signer();
    const me = await s.getAddress();
    const c = new E.Contract(raw.curve, CURVE_ABI, s);
    const amt = E.parseEther(String(v));
    st.className = "status"; st.textContent = t("t.confirm");
    if (side === "buy") {
      const out = await c.buy.staticCall(amt, 0n, me, { value: amt });
      await (await c.buy(amt, (out * 97n) / 100n, me, { value: amt })).wait();
    } else {
      const tok = new E.Contract(raw.token, TOKEN_ABI, s);
      if ((await tok.allowance(me, raw.curve)) < amt) {
        st.textContent = t("t.approving");
        await (await tok.approve(raw.curve, E.MaxUint256)).wait();
      }
      const out = await c.sell.staticCall(amt, 0n, me);
      await (await c.sell(amt, (out * 97n) / 100n, me)).wait();
    }
    st.className = "status ok"; st.textContent = t("t.done");
    await load();
  } catch (e) {
    st.className = "status err"; st.innerHTML = errMsg(e);
  }
});

$("push").addEventListener("click", async () => {
  const st = $("tStatus");
  try {
    const s = await wallet.signer();
    await (await new E.Contract(raw.curve, CURVE_ABI, s).sweepFees(0)).wait();
    st.className = "status ok"; st.textContent = t("t.pushed");
  } catch (e) {
    st.className = "status err"; st.innerHTML = errMsg(e);
  }
});

// ------------------------------------------------------------------ load
async function load() {
  if (!isAddr(addr)) {
    $("missing").hidden = false;
    $("page").hidden = true;
    return;
  }
  await readChain();
  const { tokens } = await loadTokens();
  raw = tokens.find((x) => x.token?.toLowerCase() === addr.toLowerCase()) ?? null;
  $("missing").hidden = Boolean(raw);
  $("page").hidden = !raw;
  render();
  requote();
  loadMine();
}
wallet.onChange(() => { render(); loadMine(); });
// The token's on-chain price, every 10 seconds.
setInterval(async () => { if (raw) { await refreshTokenPrices([raw]); tickLive(false); } }, 10_000);
onMarkets(() => tickLive(false));
addEventListener("langchange", render);
load();
setInterval(load, 30_000);
