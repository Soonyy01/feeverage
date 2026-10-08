import { $, bars, initShell, loadTokens, readChain, statBlock, tokenCard, wireCards } from "./core.js";

initShell();

// Wordmark unfolds, follows the pointer, and the margin/notional figure cycles.
const wm = $("wordmark");
requestAnimationFrame(() => setTimeout(() => wm.classList.remove("folded"), 120));
addEventListener("pointermove", (e) => {
  const x = (e.clientX / innerWidth - 0.5) * 2, y = (e.clientY / innerHeight - 0.5) * 2;
  wm.style.setProperty("--dx", `${7 + x * 4}px`);
  wm.style.setProperty("--dy", `${7 + y * 3}px`);
}, { passive: true });

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
setInterval(step, 2600);

// Stats + newest launches.
const setStats = statBlock($("stats"));
wireCards($("latest"));

async function refresh() {
  await readChain();
  const { tokens, totals, source } = await loadTokens();
  setStats(totals);
  $("statsSource").textContent = source;
  const newest = tokens.slice(0, 3);
  $("latest").innerHTML = newest.length
    ? newest.map(tokenCard).join("")
    : `<div class="empty" style="grid-column:1/-1"><h3>No tokens yet</h3><p class="muted" style="margin-top:8px">The first launch shows up here.</p><p style="margin-top:16px"><a class="btn" href="launch.html">Launch a token →</a></p></div>`;
}
refresh();
setInterval(refresh, 60_000);
