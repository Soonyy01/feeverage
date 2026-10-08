import { $, esc, initShell, loadTokens, readChain, tokenCard, wireCards } from "./core.js";

initShell();

const VIEWS = {
  new: { label: "New", filter: () => true, sort: (a, b) => (b.block ?? 0) - (a.block ?? 0), empty: "No tokens launched yet." },
  live: { label: "Live positions", filter: (t) => t.notionalUsd > 0, sort: (a, b) => b.notionalUsd - a.notionalUsd, empty: "No open positions yet. A position opens once a token's fees reach Hyperliquid." },
  fees: { label: "Top fees", filter: (t) => (t.feesEth ?? 0) > 0, sort: (a, b) => b.feesEth - a.feesEth, empty: "No fees routed yet." },
  pnl: { label: "Top PnL", filter: (t) => t.notionalUsd > 0, sort: (a, b) => b.pnlUsd - a.pnlUsd, empty: "No open positions yet." },
  curve: { label: "On curve", filter: (t) => !t.graduated, sort: (a, b) => (b.progress ?? 0) - (a.progress ?? 0), empty: "No tokens on a bonding curve." },
  graduated: { label: "Graduated", filter: (t) => t.graduated, sort: (a, b) => (b.block ?? 0) - (a.block ?? 0), empty: "No token has graduated yet." },
};

let tokens = [];
const view = () => (VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : "new");

function render() {
  const v = view();
  $("tabs").innerHTML = Object.entries(VIEWS).map(([k, d]) =>
    `<a href="#${k}" aria-current="${k === v}">${d.label}<span class="n">${tokens.filter(d.filter).length}</span></a>`).join("");
  const q = $("q").value.trim().toLowerCase();
  const list = tokens.filter(VIEWS[v].filter)
    .filter((t) => !q || [t.symbol, t.name, t.token, t.market].some((x) => String(x ?? "").toLowerCase().includes(q)))
    .sort(VIEWS[v].sort);
  $("cards").innerHTML = list.length
    ? list.map(tokenCard).join("")
    : `<div class="empty" style="grid-column:1/-1"><h3>${q ? "No match" : "Nothing here yet"}</h3><p class="muted" style="margin-top:8px">${esc(q ? `Nothing matches "${q}".` : VIEWS[v].empty)}</p>${tokens.length ? "" : `<p style="margin-top:16px"><a class="btn" href="launch.html">Launch a token →</a></p>`}</div>`;
}

addEventListener("hashchange", render);
$("q").addEventListener("input", render);
$("refresh").addEventListener("click", refresh);
wireCards($("cards"));

async function refresh() {
  await readChain();
  const r = await loadTokens();
  tokens = r.tokens;
  $("source").textContent = r.source;
  render();
}
render();
refresh();
setInterval(refresh, 60_000);
