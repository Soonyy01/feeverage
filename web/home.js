import {
  $, bars, cachedTokens, esc, initShell, live, loadTokens, onMarkets, readChain, refreshCards, refreshTokenPrices, statBlock, t, tokenCard, totals, wireCards,
} from "./core.js";

initShell();

// ---------------------------------------------------------------- hero
const wm = $("wordmark");
requestAnimationFrame(() => setTimeout(() => wm.classList.remove("folded"), 120));
addEventListener("pointermove", (e) => {
  const x = (e.clientX / innerWidth - 0.5) * 2, y = (e.clientY / innerHeight - 0.5) * 2;
  wm.style.setProperty("--dx", `${7 + x * 4}px`);
  wm.style.setProperty("--dy", `${7 + y * 3}px`);
}, { passive: true });
const seq = [["BTC", 5, true], ["HYPE", 10, true], ["ETH", 3, false], ["SOL", 20, true], ["BTC", 2, false]];
let k = 0;
function step() {
  const [m, lev, long] = seq[k++ % seq.length];
  bars($("heroBars"), lev);
  $("heroLev").textContent = lev + "×";
  $("heroMarket").textContent = `${m}-PERP`;
  $("heroMode").textContent = `cross · ${long ? "long" : "short"}`;
  const n = $("heroNotional");
  if (n) n.textContent = `$${lev} ${m}`;
}
step();
setInterval(step, 2600);

// ---------------------------------------------------------------- stats
const setStats = statBlock($("stats"));
function paintStats(tokens, quiet) {
  const tot = totals(tokens);
  setStats(tot, { quiet });
  $("nLong").textContent = tot.longs;
  $("nShort").textContent = tot.shorts;
  const lp = tokens.length ? (tot.longs / tokens.length) * 100 : 50;
  $("lsL").style.width = lp + "%";
  $("lsS").style.width = 100 - lp + "%";
}

// ---------------------------------------------------------------- tokens
const VIEWS = {
  new: { k: "tok.v.new", filter: () => true, sort: (a, b) => (b.block ?? b.index ?? 0) - (a.block ?? a.index ?? 0) },
  live: { k: "tok.v.live", filter: (x) => x.open, sort: (a, b) => b.notionalUsd - a.notionalUsd },
  pnl: { k: "tok.v.pnl", filter: (x) => x.open, sort: (a, b) => b.pnlUsd - a.pnlUsd },
  mcap: { k: "tok.v.mcap", filter: () => true, sort: (a, b) => (b.mcapUsd ?? 0) - (a.mcapUsd ?? 0) },
  funded: { k: "tok.v.funded", filter: () => true, sort: (a, b) => (b.bridgedUsd ?? 0) - (a.bridgedUsd ?? 0) },
  next: { k: "tok.v.next", filter: () => true, sort: (a, b) => b.pendingUsd - a.pendingUsd },
  grad: { k: "tok.v.grad", filter: (x) => x.graduated, sort: (a, b) => (b.mcapUsd ?? 0) - (a.mcapUsd ?? 0) },
};
let tokens = [], view = "new", side = "all";
const byToken = new Map();

function renderViews() {
  const L = tokens.map(live);
  $("views").innerHTML = Object.entries(VIEWS).map(([key, v]) =>
    `<button type="button" data-view="${key}" aria-pressed="${key === view}">${t(v.k)}<span class="n">${L.filter(v.filter).length}</span></button>`).join("");
}

function renderCards() {
  const q = $("q").value.trim().toLowerCase();
  const v = VIEWS[view];
  const list = tokens.map(live)
    .filter(v.filter)
    .filter((x) => side === "all" || (side === "long") === x.isLong)
    .filter((x) => !q || [x.symbol, x.name, x.token, x.market].some((s) => String(s ?? "").toLowerCase().includes(q)))
    .sort(v.sort);
  const ids = tokens.map((x) => x.token);
  $("cards").innerHTML = list.length
    ? list.map((x) => tokenCard(tokens[ids.indexOf(x.token)])).join("")
    : `<div class="empty"><h3>${tokens.length ? esc(t("tok.nomatch")) : esc(t("tok.empty"))}</h3>${tokens.length ? "" : `<p class="muted" style="margin-top:8px">${esc(t("tok.empty.p"))}</p><p style="margin-top:16px"><a class="btn" href="launch.html">${esc(t("hero.launch"))}</a></p>`}</div>`;
}

$("views").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]");
  if (!b) return;
  view = b.dataset.view;
  renderViews();
  renderCards();
});
document.querySelectorAll(".tabs.side button").forEach((b) => b.addEventListener("click", () => {
  side = b.dataset.side;
  document.querySelectorAll(".tabs.side button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  renderCards();
}));
$("q").addEventListener("input", renderCards);
wireCards($("cards"));
addEventListener("langchange", () => { renderViews(); renderCards(); $("statsSource").textContent = lastSource; });

// ---------------------------------------------------------------- data
let lastSource = "";
async function refresh() {
  await readChain();
  const r = await loadTokens();
  tokens = r.tokens;
  byToken.clear();
  tokens.forEach((x) => byToken.set(x.token.toLowerCase(), x));
  lastSource = r.source;
  $("statsSource").textContent = r.source;
  paintStats(tokens, false);
  renderViews();
  renderCards();
}

// Every price tick re-marks positions, stats and cards in place.
onMarkets(() => {
  if (!tokens.length) return;
  paintStats(tokens, true);
  refreshCards($("cards"), byToken);
});

// Token prices (market caps) from the chain every 10 seconds.
setInterval(async () => {
  if (!tokens.length) return;
  await refreshTokenPrices(tokens);
  refreshCards($("cards"), byToken);
}, 10_000);

function show(list) {
  tokens = list;
  byToken.clear();
  tokens.forEach((x) => byToken.set(x.token.toLowerCase(), x));
  paintStats(tokens, false);
}
if (cachedTokens().length) show(cachedTokens());
renderViews();
renderCards();
refresh();
setInterval(refresh, 15_000);
