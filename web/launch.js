import {
  $, C, E, FACTORY_ABI, ROUTER_ABI, ZERO, bars, chain, errMsg, esc, fmt, initShell, isAddr, market,
  onMarkets, provider, px, readChain, short, store, strategyLine, t, tokenUrl, wallet,
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
// ------------------------------------------------------------------ logo: drop or pick an image
// The image is squared to 512×512 in the browser, uploaded to the site's own storage
// (/api/upload), and the returned public URL is what goes on-chain.
let uploading = null;
const setLogo = (url) => {
  $("logo").value = url;
  $("logoPrev").style.backgroundImage = url ? `url("${url.replace(/"/g, "")}")` : "";
  $("logoPrev").classList.toggle("has", Boolean(url));
};
const dropState = (txt, cls = "") => { $("dropState").textContent = txt; $("dropState").className = cls || "muted"; };

async function squareImage(file) {
  if (file.type === "image/gif") return file; // keep animation
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height), out = Math.min(512, side);
  const c = document.createElement("canvas");
  c.width = c.height = out;
  c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
  const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.9));
  return blob && blob.type === "image/webp" ? blob : await new Promise((r) => c.toBlob(r, "image/png"));
}

async function useFile(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return dropState(t("l.logo.err") + " · png, jpg, webp, gif", "err");
  const local = URL.createObjectURL(file);
  $("logoPrev").style.backgroundImage = `url("${local}")`;
  $("logoPrev").classList.add("has");
  $("logo").value = "";
  dropState(t("l.logo.up"));
  uploading = (async () => {
    try {
      const body = await squareImage(file);
      if (body.size > 1024 * 1024) throw new Error("max 1 MB");
      const r = await fetch("api/upload", { method: "POST", headers: { "content-type": body.type }, body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.error || `HTTP ${r.status}`);
      $("logo").value = j.url; // keep the local preview; the URL goes on-chain
      dropState(`${t("l.logo.ok")} ✓ · ${t("l.logo.change")}`, "ok");
    } catch (e) {
      setLogo("");
      console.warn("logo upload:", e.message);
      dropState(`${t("l.logo.err")} · ${t("l.logo.link")}`, "err");
    } finally {
      uploading = null;
    }
  })();
}

$("logoFile").addEventListener("change", (e) => useFile(e.target.files[0]));
const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => useFile(e.dataTransfer.files[0]));
addEventListener("paste", (e) => {
  const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
  if (f && !$("drop").hidden) useFile(f);
});

// Optional: paste a link instead of uploading.
let linkMode = false;
$("logoMode").addEventListener("click", () => {
  linkMode = !linkMode;
  $("drop").hidden = linkMode;
  $("logoUrl").hidden = !linkMode;
  $("logoMode").textContent = linkMode ? t("l.logo.file") : t("l.logo.link");
  setLogo(linkMode ? $("logoUrl").value.trim() : "");
  dropState("");
});
$("logoUrl").addEventListener("input", () => {
  const u = $("logoUrl").value.trim();
  setLogo(/^https?:\/\//.test(u) ? u : "");
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
  $("figLeft").textContent = `$1 → $${form.lev} ${form.market}`;
  $("figRight").textContent = `${form.lev}× ${side}`;
  $("sumExp").textContent = `$${fmt(100 * 0.95 * form.lev, 0)} ${form.market}`;
  const liq = form.lev === 1 ? (form.isLong ? 99 : 100) : Math.max(0, 100 / form.lev - 1);
  $("sumLiq").textContent = `≈ ${fmt(liq, 1)}% ${form.isLong ? t("l.down") : t("l.up")}`;
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
    [isAddr(C.feeRecipient), t("l.c.fee"), t("l.c.fee.x")],
    [chain.ok, t("l.c.chain"), t("l.c.chain.x")],
    [w.authenticated, w.address ? `Wallet ${short(w.address)}` : t("l.c.wallet"), t("l.c.wallet.x")],
    [chain.canLaunchMe !== false, t("l.c.gate"), t("l.c.gate.x")],
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
    $("gate").innerHTML = `<span class="sq ${ok ? "live" : "off"}"></span>${ok ? t("l.open") : t("l.gated")}`;
  } else {
    $("gate").innerHTML = `<span class="sq off"></span>${t("l.unreach")}`;
  }
  update();
}

$("launchForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = $("name").value.trim(), symbol = $("symbol").value.trim().toUpperCase();
  const buyEth = Number($("buy").value) || 0;
  if (!E) return setStatus("ethers did not load. Check your connection and reload.", "err");
  if (!isAddr(C.feeRecipient)) return setStatus(t("l.e.fee"), "err");
  if (!name || !symbol) return setStatus(t("l.e.name"), "err");
  if (buyEth < 0.0001) return setStatus(t("l.e.buy"), "err");

  if (uploading) {
    setStatus(t("l.logo.wait"));
    await uploading;
  }
  const btn = $("launchBtn");
  btn.disabled = true;
  try {
    setStatus(t("l.s.conn"));
    const signer = await wallet.signer();
    const me = await signer.getAddress();
    const f = new E.Contract(C.factory, FACTORY_ABI, provider);
    const [fee, allowed, econ] = await Promise.all([f.launchFee(), f.canLaunch(me), f.previewLaunchEconomics(C.launchConfigId, ZERO)]);
    if (!allowed) throw new Error(t("l.c.gate.x"));

    const taxBps = Math.round(Math.min(Number(chain.maxTaxBps) / 100, Math.max(0, Number($("tax").value) || 0)) * 100);
    const strat = { market: form.market, isLong: form.isLong, leverage: form.lev };
    const desc = ($("desc").value.trim() + "\n\n" + strategyLine(strat)).trim();
    if (new TextEncoder().encode(desc).length > 2048) throw new Error(t("l.e.long"));
    const params = [
      name, symbol, $("logo").value.trim(), desc,
      [$("x").value.trim(), $("tg").value.trim(), "", $("web").value.trim(), ""],
      C.feeRecipient, taxBps, false, econ, E.hexlify(E.randomBytes(32)),
    ];
    const quoteIn = E.parseEther(String(buyEth));
    const value = fee + quoteIn;
    const router = new E.Contract(C.router, ROUTER_ABI, signer);
    const args = [params, C.launchConfigId, ZERO, quoteIn, 0n, me, [me]];

    setStatus(t("l.s.sim"));
    await router.launchAndBuy.staticCall(...args, { value });
    setStatus(t("l.s.confirm"));
    const tx = await router.launchAndBuy(...args, { value });
    setStatus(`${t("l.s.sent")} <a href="${C.explorer}/tx/${tx.hash}" target="_blank" rel="noopener">view tx</a>`);
    const rc = await tx.wait();
    const ev2 = rc.logs.map((l) => { try { return f.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "TokenLaunched");
    const token = ev2?.args?.token, curve = ev2?.args?.curve;
    if (token) {
      const mine = store.get("feeverage.launches", []);
      mine.unshift({ token, curve, deployer: me, block: rc.blockNumber, name, symbol, logo: $("logo").value.trim(), ...strat, at: Date.now(), tx: tx.hash });
      store.set("feeverage.launches", mine.slice(0, 50));
    }
    setStatus(`✓ ${esc(symbol)} ${t("l.s.live")} ${token ? `<a href="${tokenUrl(token)}">${t("l.s.open")}</a>` : ""}`, "ok");
  } catch (e) {
    setStatus(errMsg(e), "err");
  } finally {
    btn.disabled = false;
  }
});

wallet.onChange(() => refreshGate());
addEventListener("langchange", () => refreshGate());
onMarkets(() => {
  if (!$("markets").querySelector("button")) renderMarkets();
  update();
});
renderMarkets();
update();
