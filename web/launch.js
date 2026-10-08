import {
  $, C, E, FACTORY_ABI, ROUTER_ABI, ZERO, bars, chain, errMsg, esc, fmt, initShell, isAddr, market,
  onMarkets, provider, px, readChain, short, store, strategyLine, tokenUrl, wallet,
} from "./core.js";

initShell();

const form = { market: "BTC", isLong: true, lev: 5 };

function renderMarkets() {
  $("markets").innerHTML = C.markets.map((m) =>
    `<button type="button" data-m="${m}" aria-pressed="${m === form.market}">${m}<span class="px" data-px="${m}">${market[m] ? px(market[m].px) : ""}</span></button>`,
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
  if ($("sumBars").dataset.lev !== String(form.lev)) {
    bars($("sumBars"), form.lev);
    $("sumBars").dataset.lev = String(form.lev);
  }
  $("figLeft").textContent = `$1 fees → $${form.lev} ${form.market}`;
  $("figRight").textContent = `${form.lev}× ${side}`;
  $("sumExp").textContent = `$${fmt(100 * 0.95 * form.lev, 0)} ${form.market}`;
  const liq = form.lev === 1 ? (form.isLong ? 99 : 100) : Math.max(0, 100 / form.lev - 1);
  $("sumLiq").textContent = `≈ ${fmt(liq, 1)}% ${form.isLong ? "down" : "up"}`;
  $("markLbl").textContent = form.market;
  $("sumMark").dataset.px = form.market;
  $("sumMark").textContent = market[form.market] ? px(market[form.market].px) : "—";

  const buy = Math.max(0, Number($("buy").value) || 0);
  $("sumBuy").textContent = `${fmt(buy, 4)} ETH`;
  if (chain.launchFee != null) {
    const fee = Number(E.formatEther(chain.launchFee));
    $("sumFee").textContent = `${fmt(fee, 4)} ETH`;
    $("sumTotal").textContent = `${fmt(fee + buy, 4)} ETH`;
  } else {
    $("sumFee").textContent = chain.ok ? "…" : "read on-chain";
    $("sumTotal").textContent = `${fmt(buy, 4)} ETH + fee`;
  }
  renderChecks();
}

function renderChecks() {
  const w = wallet.state;
  const rows = [
    [isAddr(C.feeRecipient), "Fee recipient set", "Set feeRecipient in config.js"],
    [chain.ok, "Robinhood Chain reachable", "Robinhood Chain not reachable"],
    [w.authenticated, w.address ? `Wallet ${short(w.address)}` : "Wallet connected", "Connect a wallet"],
    [chain.canLaunchMe !== false, chain.canLaunchMe ? "Launching allowed for this wallet" : "Launch permission", "Launching is gated for this wallet right now"],
  ];
  $("checks").innerHTML = rows.map(([ok, good, bad]) =>
    `<div><span class="sq ${ok ? "live" : "off"}"></span>${esc(ok ? good : bad)}</div>`).join("");
}

function setStatus(msg, kind = "") {
  $("launchStatus").className = "status " + kind;
  $("launchStatus").innerHTML = msg;
}

async function refreshGate() {
  await readChain();
  if (chain.ok) {
    $("tax").max = String(Number(chain.maxTaxBps) / 100);
    const ok = wallet.state.address ? chain.canLaunchMe : chain.launchOpen;
    $("gate").innerHTML = `<span class="sq ${ok ? "live" : "off"}"></span>${ok ? "Launching open" : "Launching gated"}`;
  } else {
    $("gate").innerHTML = `<span class="sq off"></span>Chain unreachable`;
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

    const taxBps = Math.round(Math.min(Number(chain.maxTaxBps) / 100, Math.max(0, Number($("tax").value) || 0)) * 100);
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
    setStatus(`✓ ${esc(symbol)} is live. ${token ? `<a href="${tokenUrl(token)}">Open the token page →</a>` : ""}`, "ok");
  } catch (e) {
    setStatus(errMsg(e), "err");
  } finally {
    btn.disabled = false;
  }
});

wallet.onChange(() => refreshGate());
onMarkets(() => {
  if (!$("markets").querySelector("button")) renderMarkets();
  update();
});
renderMarkets();
update();
