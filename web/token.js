import {
  $, C, CURVE_ABI, E, TOKEN_ABI, chain, errMsg, esc, fmt, initShell, isAddr, loadTokens, market,
  provider, px, readChain, short, stripTag, usd, wallet,
} from "./core.js";

initShell();

const addr = new URLSearchParams(location.search).get("t") ?? "";
let t = null;

function stat(label, value, cls = "") {
  return `<div><dt>${label}</dt><dd class="${cls}">${value}</dd></div>`;
}

function render() {
  if (!t) return;
  document.title = `${t.symbol} · Feeverage`;
  const open = t.notionalUsd > 0;
  const prog = Math.max(0, Math.min(1, t.progress ?? 0));
  const img = t.logo ? `<img src="${esc(t.logo)}" alt="" referrerpolicy="no-referrer">` : `<span class="ph">${esc((t.symbol || "?")[0])}</span>`;
  $("hero").innerHTML = `${img}<div style="min-width:0"><span class="label muted">${esc(t.name)}</span><h1 style="margin-top:6px">${esc(t.symbol)}</h1></div>
    <span class="chip ${open ? (t.isLong ? "long" : "short") : "idle"}" style="font-size:13px;padding:9px 11px">${t.leverage}× ${t.isLong ? "▲ LONG" : "▼ SHORT"} ${esc(t.market)}</span>`;
  const pnlCls = t.pnlUsd > 0 ? "pos" : t.pnlUsd < 0 ? "neg" : "";
  $("mstats").innerHTML = [
    stat("Fees routed", t.feesEth == null ? "—" : fmt(t.feesEth, 4) + " ETH"),
    stat("Margin", t.equityUsd ? usd(t.equityUsd) : "—"),
    stat("Notional", open ? usd(t.notionalUsd) : "—"),
    stat("Unrealized PnL", open ? (t.pnlUsd > 0 ? "+" : "") + usd(t.pnlUsd) : "—", pnlCls),
    stat("Entry price", px(t.entryPx)),
    stat("Liq. price", px(t.liqPx)),
    stat(`${esc(t.market)} mark`, `<span data-px="${esc(t.market)}">${market[t.market] ? px(market[t.market].px) : "—"}</span>`),
    stat("Fees waiting", t.pendingEth == null ? "—" : fmt(t.pendingEth, 4) + " ETH"),
    stat(t.graduated ? "Status" : "Bonding curve", t.graduated ? "Graduated" : fmt(prog * 100, 0) + "%"),
  ].join("");
  $("curveBar").style.width = prog * 100 + "%";
  $("curveText").textContent = t.graduated
    ? "Graduated to a Uniswap v4 pool on Robinhood Chain."
    : t.reserveEth != null ? `${fmt(t.reserveEth, 4)} / ${fmt(t.thresholdEth, 4)} ETH to graduation` : "Reading the curve…";
  const d = stripTag(t.description);
  $("desc").textContent = d || "No description.";
  $("links").innerHTML = `
    <dt>Contract</dt><dd><a href="${C.explorer}/token/${t.token}" target="_blank" rel="noopener">${short(t.token)} ↗</a></dd>
    <dt>Creator</dt><dd>${t.deployer ? `<a href="${C.explorer}/address/${t.deployer}" target="_blank" rel="noopener">${short(t.deployer)} ↗</a>` : "—"}</dd>
    <dt>Hyperliquid account</dt><dd>${t.hlAccount ? `<a href="https://app.hyperliquid.xyz/explorer/address/${t.hlAccount}" target="_blank" rel="noopener">${short(t.hlAccount)} ↗</a>` : "assigned by keeper"}</dd>`;

  const me = wallet.state.address?.toLowerCase();
  $("push").hidden = !(me && t.deployer && me === t.deployer.toLowerCase() && !t.graduated);
  $("trade").hidden = Boolean(t.graduated);
  $("gradNote").hidden = !t.graduated;
}

// ------------------------------------------------------------------ trade
let side = "buy", timer;
document.querySelectorAll("#trade .seg button").forEach((b) => b.addEventListener("click", () => {
  side = b.dataset.t;
  document.querySelectorAll("#trade .seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("tAmtLbl").textContent = side === "buy" ? "Pay (ETH)" : `Sell (${t?.symbol ?? "tokens"})`;
  $("tGo").textContent = side === "buy" ? `Buy ${t?.symbol ?? ""}` : `Sell ${t?.symbol ?? ""}`;
  requote();
}));
function requote() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const v = Number($("tAmt").value);
    if (!t || !(v > 0) || !chain.ok) return ($("tQuote").textContent = chain.ok ? "Enter an amount" : "Connecting to Robinhood Chain…");
    const from = wallet.state.address ?? C.feeRecipient;
    try {
      const c = new E.Contract(t.curve, CURVE_ABI, provider);
      const amt = E.parseEther(String(v));
      if (side === "buy") {
        const out = await c.buy.staticCall(amt, 0n, from, { value: amt, from });
        $("tQuote").textContent = `≈ ${fmt(Number(E.formatEther(out)), 2)} ${t.symbol}`;
      } else {
        const out = await c.sell.staticCall(amt, 0n, from, { from });
        $("tQuote").textContent = `≈ ${fmt(Number(E.formatEther(out)), 6)} ETH`;
      }
    } catch {
      $("tQuote").textContent = side === "sell" ? "Approve first or check your balance" : "Could not quote";
    }
  }, 300);
}
$("tAmt").addEventListener("input", requote);

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
    load();
  } catch (e) {
    st.className = "status err"; st.innerHTML = errMsg(e);
  }
});

$("push").addEventListener("click", async () => {
  const st = $("tStatus");
  try {
    const s = await wallet.signer();
    await (await new E.Contract(t.curve, CURVE_ABI, s).sweepFees(0)).wait();
    st.className = "status ok"; st.textContent = "Fees released. The keeper bridges them on its next run.";
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
  t = tokens.find((x) => x.token?.toLowerCase() === addr.toLowerCase()) ?? null;
  $("missing").hidden = Boolean(t);
  $("page").hidden = !t;
  render();
  requote();
}
wallet.onChange(render);
load();
setInterval(load, 60_000);
