import {
  $, C, E, esc, ethPx, fmt, holdingLive, initShell, loadHoldings, loadTokens, market, onMarkets, provider, readChain,
  refreshTokenPrices, short, t, tokenLogo, tokenUrl, usd, wallet,
} from "./core.js";

initShell();

let holdings = [], ethBal = null, user = null, busy = false;
const pct = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${fmt(n, 2)}%`);
const cls = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const priceEth = ethPx;

function renderTable() {
  if (!holdings.length) {
    $("holdings").innerHTML = `<div class="empty"><p>${esc(t("p.none"))}</p><p style="margin-top:14px"><a class="btn" href="index.html#tokens">${esc(t("p.none.cta"))}</a></p></div>`;
    $("history").innerHTML = `<div class="empty"><p class="muted">${esc(t("p.notrades"))}</p></div>`;
    return;
  }
  const rows = holdings.slice().sort((a, b) => (holdingLive(b).valueEth ?? 0) - (holdingLive(a).valueEth ?? 0));
  $("holdings").innerHTML = `<div class="ptable"><table>
    <thead><tr><th>Token</th><th class="num">${t("p.bal")}</th><th class="num">${t("p.price")}</th><th class="num">${t("p.avg")}</th><th class="num">${t("p.val")}</th><th class="num">${t("p.ret")}</th><th></th></tr></thead>
    <tbody>${rows.map((h) => `<tr data-row="${h.token.toLowerCase()}">
      <td><div class="tok">${tokenLogo(h)}<div><b>$${esc(h.symbol)}</b><small>${h.isLong ? "▲ Long" : "▼ Short"} ${esc(h.market)} ${h.leverage}×</small></div></div></td>
      <td class="num">${fmt(h.balance, h.balance >= 1000 ? 0 : 2)}</td>
      <td class="num" data-c="price">${priceEth(h.spotEth)}</td>
      <td class="num">${priceEth(h.avgEth)}</td>
      <td class="num" data-c="value">—</td>
      <td class="num" data-c="pnl">—</td>
      <td><a class="btn" href="${tokenUrl(h.token)}">${esc(t("p.trade"))}</a></td>
    </tr>`).join("")}</tbody></table></div>`;

  const trades = holdings.flatMap((h) => h.trades.map((x) => ({ ...x, h }))).sort((a, b) => b.block - a.block).slice(0, 50);
  $("history").innerHTML = trades.length ? `<div class="ptable"><table>
    <thead><tr><th>Token</th><th></th><th class="num">ETH</th><th class="num">Tokens</th><th class="num">Tx</th></tr></thead>
    <tbody>${trades.map((x) => `<tr>
      <td><div class="tok">${tokenLogo(x.h)}<div><b>$${esc(x.h.symbol)}</b></div></div></td>
      <td class="${x.side === "buy" ? "pos" : "neg"}"><b>${x.side === "buy" ? t("p.buy") : t("p.sell")}</b></td>
      <td class="num">${fmt(x.eth, 5)}</td><td class="num">${fmt(x.tokens, 2)}</td>
      <td class="num"><a href="${C.explorer}/tx/${x.tx}" target="_blank" rel="noopener">${short(x.tx)} ↗</a></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty"><p class="muted">${esc(t("p.notrades"))}</p></div>`;
  paintLive();
}

// Every price tick: re-mark values and PnL in USD.
function paintLive() {
  const ethPx = market.ETH?.px ?? 0;
  if (ethBal != null) {
    $("ethBal").textContent = fmt(ethBal, 4) + " ETH";
    $("ethBalUsd").textContent = ethPx ? usd(ethBal * ethPx) : "—";
  }
  let val = 0, spent = 0, pnl = 0, any = false;
  for (const h of holdings) {
    const L = holdingLive(h);
    const row = document.querySelector(`[data-row="${h.token.toLowerCase()}"]`);
    if (row) {
      row.querySelector('[data-c="value"]').textContent = L.valueUsd != null ? usd(L.valueUsd) : "—";
      const p = row.querySelector('[data-c="pnl"]');
      p.innerHTML = L.pnlUsd != null ? `<span class="${cls(L.pnlUsd)}">${L.pnlUsd > 0 ? "+" : ""}${usd(L.pnlUsd)}<br><small>${pct(L.pnlPct)}</small></span>` : "—";
      row.querySelector('[data-c="price"]').innerHTML = `${priceEth(h.spotEth)}${L.moveSinceEntry != null ? `<br><small class="${cls(L.moveSinceEntry)}">${pct(L.moveSinceEntry)} ${t("p.move")}</small>` : ""}`;
    }
    if (L.valueEth != null) { val += L.valueEth; any = true; }
    spent += h.spentEth;
    if (L.pnlEth != null) pnl += L.pnlEth;
  }
  $("hVal").textContent = any ? usd(val * ethPx) : "$0.00";
  $("hCost").textContent = usd(spent * ethPx);
  $("hPnl").textContent = (pnl > 0 ? "+" : "") + usd(pnl * ethPx);
  $("hPnl").className = "v " + cls(pnl);
  $("hPnlPct").textContent = spent > 0 ? `${pct((pnl / spent) * 100)} · ${t("p.pnl.s")}` : t("p.pnl.s");
}

async function load() {
  const w = wallet.state;
  user = w.authenticated && w.address ? w.address : null;
  $("needWallet").hidden = Boolean(user);
  $("mine").hidden = !user;
  $("who").hidden = !user;
  if (!user || busy) return;
  busy = true;
  $("who").textContent = short(user);
  $("pStatus").textContent = t("p.loading");
  try {
    await readChain();
    const [{ tokens }, bal] = await Promise.all([loadTokens(), provider ? provider.getBalance(user) : 0n]);
    ethBal = Number(E.formatEther(bal));
    holdings = await loadHoldings(user, tokens);
    $("pStatus").textContent = "";
  } catch (e) {
    $("pStatus").textContent = String(e?.shortMessage || e?.message || e);
  } finally {
    busy = false;
  }
  renderTable();
}

// Token prices come from the chain; refresh them often so values stay live.
setInterval(async () => {
  if (!holdings.length) return;
  await refreshTokenPrices(holdings);
  paintLive();
}, 10_000);
setInterval(async () => {
  if (!user || !provider) return;
  try { ethBal = Number(E.formatEther(await provider.getBalance(user))); paintLive(); } catch {}
}, 15_000);

$("connectHere").addEventListener("click", () => wallet.connect().catch(() => {}));
wallet.onChange(load);
onMarkets(paintLive);
addEventListener("langchange", renderTable);
setInterval(load, 60_000);
