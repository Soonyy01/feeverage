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
// ------------------------------------------------------------------ logo: pick an image from the gallery
// The image is squared and shrunk in the browser right away (no upload, nothing to wait for).
// At launch it is stored permanently: in the site's Blob storage when that is connected,
// otherwise on Robinhood Chain itself (one small extra transaction), served by /api/logo.
let logoBlob = null;
const setLogo = (url) => {
  $("logo").value = url;
  $("logoPrev").style.backgroundImage = url ? `url("${url.replace(/"/g, "")}")` : "";
  $("logoPrev").classList.toggle("has", Boolean(url));
};
const dropState = (txt, cls = "") => { $("dropState").textContent = txt; $("dropState").className = cls || "muted"; };

const LOGO_MAX = 16 * 1024; // keeps the on-chain copy cheap
async function shrink(file) {
  if (file.type === "image/gif" && file.size <= LOGO_MAX) return file; // small gifs stay animated
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  let last = null;
  for (const px of [256, 200, 160, 128]) {
    const c = document.createElement("canvas");
    c.width = c.height = Math.min(px, side);
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, c.width, c.height);
    for (const q of [0.9, 0.8, 0.7, 0.55, 0.4]) {
      let b = await new Promise((r) => c.toBlob(r, "image/webp", q));
      if (!b || b.type !== "image/webp") b = await new Promise((r) => c.toBlob(r, "image/jpeg", q)); // Safari
      last = b;
      if (b && b.size <= LOGO_MAX) return b;
    }
  }
  return last;
}

async function useFile(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return dropState("png, jpg, webp, gif", "err");
  try {
    dropState("…");
    logoBlob = await shrink(file);
    $("logo").value = "";
    $("logoPrev").style.backgroundImage = `url("${URL.createObjectURL(logoBlob)}")`;
    $("logoPrev").classList.add("has");
    dropState(`${t("l.logo.ok")} ✓ · ${t("l.logo.change")}`, "ok");
  } catch (e) {
    logoBlob = null;
    dropState(String(e.message || e), "err");
  }
}

// Turns the picked image into a permanent public URL. Called only when launching.
const MIME = { "image/png": 1, "image/jpeg": 2, "image/webp": 3, "image/gif": 4 };
async function storeLogo(signer, me) {
  // 1) Blob storage, if the site has it (free, instant).
  try {
    const r = await fetch("api/upload", { method: "POST", headers: { "content-type": logoBlob.type }, body: logoBlob, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) return j.url;
  } catch {}
  // 2) On-chain: the image bytes ride in a 0-ETH transaction to yourself.
  setStatus(t("l.s.logo"));
  const bytes = new Uint8Array(await logoBlob.arrayBuffer());
  const data = E.concat([E.toUtf8Bytes("FEEVLOGO"), new Uint8Array([MIME[logoBlob.type] ?? 3]), bytes]);
  const tx = await signer.sendTransaction({ to: me, value: 0n, data });
  await tx.wait();
  return `${location.origin}/api/logo?tx=${tx.hash}`;
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
  if (!linkMode) logoBlob = null;
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

function renderChecks() {}

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
  if (!(buyEth >= 0)) return setStatus(t("l.e.buy"), "err");

  const btn = $("launchBtn");
  btn.disabled = true;
  try {
    setStatus(t("l.s.conn"));
    const signer = await wallet.signer();
    const me = await signer.getAddress();
    const f = new E.Contract(C.factory, FACTORY_ABI, provider);
    const [fee, allowed, econ] = await Promise.all([f.launchFee(), f.canLaunch(me), f.previewLaunchEconomics(C.launchConfigId, ZERO)]);
    if (!allowed) throw new Error(t("l.c.gate.x"));
    if (!linkMode && logoBlob && !$("logo").value) $("logo").value = await storeLogo(signer, me);

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
    let tx;
    if (quoteIn > 0n) {
      // Launch + your first buy in one transaction.
      const router = new E.Contract(C.router, ROUTER_ABI, signer);
      const args = [params, C.launchConfigId, ZERO, quoteIn, 0n, me, [me]];
      setStatus(t("l.s.sim"));
      await router.launchAndBuy.staticCall(...args, { value: fee + quoteIn });
      setStatus(t("l.s.confirm"));
      tx = await router.launchAndBuy(...args, { value: fee + quoteIn });
    } else {
      // Launch only, straight on the factory: you pay just the launch fee.
      const fs = new E.Contract(C.factory, FACTORY_ABI, signer);
      const args = [params, C.launchConfigId, ZERO];
      setStatus(t("l.s.sim"));
      await fs.launchToken.staticCall(...args, { value: fee });
      setStatus(t("l.s.confirm"));
      tx = await fs.launchToken(...args, { value: fee });
    }
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
