import {
  $, C, E, KEY, NATIVE, PORTAL_ABI, TOKEN_ABI, TOKEN_TAXED_V3, ZERO, bars, chain, errMsg, esc, fmt, initShell, isAddr, market,
  onMarkets, provider, px, readChain, recordTrade, saltPrefix, store, strategyLine, t, tokenUrl, wallet,
} from "./core.js";

initShell();

const form = { market: "BTC", isLong: true, lev: 5 };

// ------------------------------------------------------------------ strategy pickers
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
$("tax").innerHTML = C.taxOptions.map((v) => `<option value="${v}" ${v === 3 ? "selected" : ""}>${v}%</option>`).join("");
["lev", "buy", "symbol", "tax"].forEach((id) => $(id).addEventListener("input", update));
$("tax").addEventListener("change", update);

// ------------------------------------------------------------------ logo: pick an image from the gallery
// Squared and shrunk in the browser right away. At launch it is pinned on IPFS together
// with the token's description through flap.sh, which is what wallets and explorers read.
let logoBlob = null;
const dropState = (txt, cls = "") => { $("dropState").textContent = txt; $("dropState").className = cls || "muted"; };

async function shrink(file) {
  if (file.type === "image/gif" && file.size <= 900 * 1024) return file; // small gifs stay animated
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const c = document.createElement("canvas");
  c.width = c.height = Math.min(512, side);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

async function useFile(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return dropState("png, jpg, webp, gif", "err");
  try {
    dropState("…");
    logoBlob = await shrink(file);
    $("logoPrev").style.backgroundImage = `url("${URL.createObjectURL(logoBlob)}")`;
    $("logoPrev").classList.add("has");
    dropState(`${t("l.logo.ok")} ✓ · ${t("l.logo.change")}`, "ok");
  } catch (e) {
    logoBlob = null;
    dropState(String(e.message || e), "err");
  }
}

// No image picked: draw a simple one from the ticker, in the site's colours.
async function defaultLogo(symbol) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#feea05"; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "#111"; g.lineWidth = 28; g.strokeRect(14, 14, 484, 484);
  g.fillStyle = "#111"; g.textAlign = "center"; g.textBaseline = "middle";
  const txt = (symbol || "?").slice(0, 4);
  g.font = `900 ${txt.length > 2 ? 150 : 230}px Archivo, "Arial Black", sans-serif`;
  g.fillText(txt, 256, 270);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

$("logoFile").addEventListener("change", (e) => useFile(e.target.files[0]));
const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => useFile(e.dataTransfer.files[0]));
addEventListener("paste", (e) => {
  const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
  if (f) useFile(f);
});

// Pins image + metadata on flap.sh's IPFS (through this site's server, see api/flapmeta.js).
async function uploadMeta({ file, description, twitter, telegram, website, creator }) {
  const fd = new FormData();
  fd.append("operations", JSON.stringify({
    query: "mutation Create($file: Upload!, $meta: MetadataInput!) { create(file: $file, meta: $meta) }",
    variables: { file: null, meta: { website: website || null, twitter: twitter || null, telegram: telegram || null, description, creator } },
  }));
  fd.append("map", JSON.stringify({ 0: ["variables.file"] }));
  fd.append("0", file, "logo." + (file.type.split("/")[1] || "png"));
  let lastErr = "";
  for (const url of ["api/flapmeta", C.flapUpload]) {
    try {
      const r = await fetch(url, { method: "POST", body: fd, signal: AbortSignal.timeout(45000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && typeof j?.data?.create === "string") return j.data.create;
      lastErr = j?.errors?.[0]?.message || j?.error || `HTTP ${r.status}`;
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(t("l.e.meta") + (lastErr ? ` (${lastErr})` : ""));
}

// flap.sh tax tokens must live at an address ending in 7777. The token is a minimal
// proxy deployed by the Portal with CREATE2, so the address follows from the salt.
// The search runs in a Web Worker (salt-worker.js), off the main thread.
const INIT_HASH = () => E.keccak256("0x3d602d80600a3d3981f3363d3d373d3d3d363d73" + C.taxTokenImpl.slice(2).toLowerCase() + "5af43d82803e903d91602b57fd5bf3");
function findSalt(strat) {
  const initHash = INIT_HASH();
  const prefix = E.hexlify(saltPrefix(strat));
  return new Promise((resolve) => {
    let w;
    try { w = new Worker("salt-worker.js"); } catch { return resolve(findSaltInline(initHash, prefix)); }
    w.onmessage = ({ data }) => { w.terminate(); resolve(data); };
    w.onerror = () => { w.terminate(); resolve(findSaltInline(initHash, prefix)); };
    w.postMessage({ portal: C.portal, initHash, prefix });
  });
}
async function findSaltInline(initHash, prefix) {
  const b = new Uint8Array(32);
  b.set(E.getBytes(prefix), 0);
  b.set(E.randomBytes(12), 16);
  for (let i = 0; ; i++) {
    b[28] = i >>> 24; b[29] = (i >>> 16) & 255; b[30] = (i >>> 8) & 255; b[31] = i & 255;
    const salt = E.hexlify(b);
    const addr = E.getCreate2Address(C.portal, salt, initHash);
    if (addr.toLowerCase().endsWith("7777")) return { salt, address: addr };
    if (i % 1500 === 0) await new Promise((r) => setTimeout(r, 0));
  }
}

// The address search doesn't depend on the name, so it runs in the background for the
// chosen position; by the time someone presses Launch it is usually already done.
const saltJobs = new Map();
const stratKey = (s) => `${s.market}:${s.isLong ? "L" : "S"}:${s.leverage}`;
const curStrat = () => ({ market: form.market, isLong: form.isLong, leverage: form.lev });
const nextSalt = (s = curStrat()) => {
  const k = stratKey(s);
  if (!saltJobs.has(k)) { if (saltJobs.size > 8) saltJobs.clear(); saltJobs.set(k, findSalt(s)); }
  return saltJobs.get(k);
};
let saltTimer = 0;
const warmSalt = () => { clearTimeout(saltTimer); saltTimer = setTimeout(() => nextSalt(), 500); };

// ------------------------------------------------------------------ summary
function update() {
  const maxL = Math.min(C.maxLeverage, market[form.market]?.maxLev ?? C.maxLeverage);
  $("lev").max = String(maxL);
  if (Number($("lev").value) > maxL) $("lev").value = String(maxL);
  form.lev = Number($("lev").value);
  warmSalt();
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
  $("sumBuy").textContent = `${fmt(buy, 4)} ${NATIVE}`;
  $("sumFee").textContent = `${$("tax").value}% ${t("l.tax.each")}`;
  $("sumTotal").textContent = `${fmt(buy, 4)} ${NATIVE} + gas`;
}

function setStatus(msg, kind = "") {
  $("launchStatus").className = "status " + kind;
  $("launchStatus").innerHTML = msg;
}

async function refreshGate() {
  await readChain();
  $("gate").innerHTML = chain.ok
    ? `<span class="sq live"></span>${t("l.open")}`
    : `<span class="sq off"></span>${t("l.unreach")}`;
  update();
}

// ------------------------------------------------------------------ launch
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

    const strat = { market: form.market, isLong: form.isLong, leverage: form.lev };
    const desc = ($("desc").value.trim() + "\n\n" + strategyLine(strat)).trim();
    if (desc.length > 1500) throw new Error(t("l.e.long"));

    setStatus(t("l.s.meta"));
    const file = logoBlob ?? (await defaultLogo(symbol));
    const [cid, { salt, address }] = await Promise.all([
      uploadMeta({ file, description: desc, twitter: $("x").value.trim(), telegram: $("tg").value.trim(), website: $("web").value.trim(), creator: me }),
      nextSalt(strat),
    ]);

    const taxBps = Number($("tax").value) * 100;
    const quoteAmt = E.parseEther(String(buyEth));
    const params = {
      name, symbol, meta: cid,
      dexThresh: 1, // FOUR_FIFTHS: lists on PancakeSwap at 80% of the curve
      salt,
      migratorType: 1, // V2_MIGRATOR (required for tax tokens)
      quoteToken: ZERO, quoteAmt,
      beneficiary: C.feeRecipient, // the tax (creator fees) goes to the operator that funds the position
      permitData: "0x", extensionID: E.ZeroHash, extensionData: "0x",
      dexId: 0, lpFeeProfile: 0,
      buyTaxRate: taxBps, sellTaxRate: taxBps,
      taxDuration: BigInt(365 * 24 * 3600), antiFarmerDuration: BigInt(24 * 3600),
      mktBps: 10000, deflationBps: 0, dividendBps: 0, lpBps: 0,
      minimumShareBalance: 0n, dividendToken: ZERO,
      commissionReceiver: C.feeRecipient,
      tokenVersion: TOKEN_TAXED_V3,
    };
    const portalW = new E.Contract(C.portal, PORTAL_ABI, signer);
    setStatus(t("l.s.sim"));
    await portalW.newTokenV6.staticCall(params, { value: quoteAmt });
    setStatus(t("l.s.confirm"));
    const tx = await portalW.newTokenV6(params, { value: quoteAmt });
    setStatus(`${t("l.s.sent")} <a href="${C.explorer}/tx/${tx.hash}" target="_blank" rel="noopener">view tx</a>`);
    saltJobs.delete(stratKey(strat)); // this address is taken now
    const rc = await tx.wait();
    const iface = new E.Interface(PORTAL_ABI);
    const ev2 = rc.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "TokenCreated");
    const token = ev2?.args?.token ?? address;

    const mine = store.get(KEY + "launches", []);
    mine.unshift({ token, deployer: me, block: rc.blockNumber, name, symbol, meta: cid, description: desc, ...strat, at: Date.now(), tx: tx.hash });
    store.set(KEY + "launches", mine.slice(0, 50));
    if (quoteAmt > 0n) {
      const got = await new E.Contract(token, TOKEN_ABI, provider).balanceOf(me).catch(() => 0n);
      recordTrade(me, { token, side: "buy", eth: buyEth, tokens: Number(E.formatEther(got)), tx: tx.hash, block: rc.blockNumber });
    }
    setStatus(`✓ ${esc(symbol)} ${t("l.s.live")} <a href="${tokenUrl(token)}">${t("l.s.open")}</a>`, "ok");
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
