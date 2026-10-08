import { $, C, roll, compactUsd, esc, fmt, initShell, loadTokens, paintPrices, readChain, signedUsd, statBlock, tokenUrl } from "./core.js";

initShell();
const setStats = statBlock($("stats"));

function leaderboard(el, list, key, f) {
  const top = list.filter((t) => (Number(t[key]) || 0) !== 0).sort((a, b) => b[key] - a[key]).slice(0, 5);
  el.innerHTML = top.length
    ? top.map((t, i) => `<a href="${tokenUrl(t.token)}"><span class="rk">${i + 1}</span><span><b>${esc(t.symbol)}</b> <span class="muted">${t.leverage}× ${t.isLong ? "long" : "short"} ${esc(t.market)}</span></span><span class="v">${f(t[key])}</span></a>`).join("")
    : `<div style="padding:16px" class="muted">Nothing yet.</div>`;
}

async function refresh() {
  await readChain();
  const { tokens, totals, source, updatedAt } = await loadTokens();
  setStats(totals);
  $("statsSource").textContent = source;
  $("statsTime").textContent = updatedAt ? "Updated " + new Date(updatedAt).toLocaleTimeString() : "";

  // Long vs short
  const longs = tokens.filter((t) => t.isLong).length, shorts = tokens.length - longs;
  const lp = tokens.length ? (longs / tokens.length) * 100 : 50;
  $("lsL").style.width = lp + "%";
  $("lsS").style.width = 100 - lp + "%";
  $("lsLabel").textContent = `${longs} long · ${shorts} short`;
  const open = tokens.filter((t) => t.notionalUsd > 0).length;
  $("openLabel").textContent = `${open} of ${tokens.length} positions open · ${tokens.filter((t) => t.graduated).length} graduated`;

  const avg = tokens.length ? tokens.reduce((a, t) => a + t.leverage, 0) / tokens.length : 0;
  roll($("avgLev"), avg, (n) => fmt(n, 1) + "×");
  roll($("gradN"), tokens.filter((t) => t.graduated).length, (n) => fmt(n, 0));

  // By market
  const rows = C.markets.map((m) => {
    const ts = tokens.filter((t) => t.market === m);
    const s = (k) => ts.reduce((a, t) => a + (Number(t[k]) || 0), 0);
    return { m, n: ts.length, fees: s("feesEth"), notional: s("notionalUsd"), pnl: s("pnlUsd") };
  });
  $("byMarket").innerHTML = rows.map((r) => `<tr>
    <td><b>${r.m}</b>-PERP</td><td class="mono" data-px="${r.m}">—</td><td class="mono">${r.n}</td>
    <td class="mono">${fmt(r.fees, 4)} ETH</td><td class="mono">${compactUsd(r.notional)}</td>
    <td class="mono ${r.pnl > 0 ? "pos" : r.pnl < 0 ? "neg" : ""}">${signedUsd(r.pnl)}</td></tr>`).join("");

  paintPrices();
  leaderboard($("lbFees"), tokens, "feesEth", (v) => fmt(v, 4) + " ETH");
  leaderboard($("lbPnl"), tokens, "pnlUsd", signedUsd);
}
refresh();
setInterval(refresh, 60_000);
