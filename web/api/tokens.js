// Index of this site's launches on BNB Chain, one fixed block segment per request.
//   GET /api/tokens?fee=0x…&start=<startBlock>&seg=<n>
// Segment n covers blocks [start + n·SEG, start + (n+1)·SEG − 1]. For each segment:
//   1. TokenCreated logs of the launch Portal
//   2. keep tax tokens whose tax goes to `fee` (Tax Token Helper, batched with Multicall3)
//   3. strategy from the launch transaction's salt, the IPFS description, or the known list
// A finished segment never changes, so it is cached by the CDN for a year: every visitor sees
// the same list, and only the newest segment is ever read from the chain.
import { ethers } from "ethers";

export const SEG = 50_000;
const RPCS = [process.env.BSC_RPC, "https://bsc-rpc.publicnode.com", "https://bsc.drpc.org", "https://binance.llamarpc.com", "https://1rpc.io/bnb", "https://bsc.blockpi.network/v1/rpc/public", "https://bsc.meowrpc.com"].filter(Boolean);
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const HELPER = "0x53841c73217735F37BC1775538b03b23feFD8346";
const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";
const GATEWAYS = ["https://flap.mypinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://gateway.pinata.cloud/ipfs/"];
// Tokens launched before the strategy was written into the salt.
const KNOWN = { "0x28ba97127772f81fc000beb38160e85150c97777": "BNB:L:3" };

const P = new ethers.Interface([
  "event TokenCreated(uint256 ts,address creator,uint256 nonce,address token,string name,string symbol,string meta)",
  "function newTokenV6((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion) params) payable returns (address)",
]);
const H = new ethers.Interface(["function getTaxTokenInfo(address taxToken) view returns ((uint16 marketBps,uint16 deflationBps,uint16 lpBps,uint16 dividendBps,uint16 taxRate,uint256 burntTokenAmount,uint256 totalQuoteSentToDividend,uint256 totalQuoteAddedToLiquidity,uint256 totalTokenAddedToLiquidity,uint256 totalQuoteSentToMarketing,address marketingWallet,address quoteToken,uint256 minimumShareBalance))"]);
const M = new ethers.Interface(["function aggregate3((address target,bool allowFailure,bytes callData)[] calls) view returns ((bool success,bytes returnData)[])"]);
const TOPIC = P.getEvent("TokenCreated").topicHash;
const TAG = /feeverage:([A-Z0-9]{1,12}):([LS]):(\d{1,2})\b/;

let good = 0;
let deadline = Infinity;
async function rpc(method, params) {
  let err;
  for (let k = 0; k < RPCS.length; k++) {
    if (Date.now() > deadline) throw new Error("time budget used");
    const i = (good + k) % RPCS.length;
    try {
      const r = await fetch(RPCS[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      if (j.result === undefined) throw new Error("empty");
      good = i;
      return j.result;
    } catch (e) { err = e; }
  }
  throw err;
}

// /api/tokens?ping=1 → which BNB Chain endpoints this server can reach, and how fast.
async function ping() {
  return Promise.all(RPCS.map(async (url) => {
    const t0 = Date.now();
    try {
      const call = async (method, params) => {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(5000) });
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        return j.result;
      };
      const latest = Number(await call("eth_blockNumber", []));
      const logs = await call("eth_getLogs", [{ address: PORTAL, topics: [TOPIC], fromBlock: ethers.toQuantity(latest - 2000), toBlock: ethers.toQuantity(latest) }]);
      return { url, ok: true, latest, launches2000: logs.length, ms: Date.now() - t0 };
    } catch (e) {
      return { url, ok: false, error: String(e?.message || e).slice(0, 120), ms: Date.now() - t0 };
    }
  }));
}

async function logs(a, b) {
  try {
    return await rpc("eth_getLogs", [{ address: PORTAL, topics: [TOPIC], fromBlock: ethers.toQuantity(a), toBlock: ethers.toQuantity(b) }]);
  } catch (e) {
    if (b - a < 500) throw e;
    const m = Math.floor((a + b) / 2);
    return [...(await logs(a, m)), ...(await logs(m + 1, b))];
  }
}

async function feeFilter(list, fee) {
  const out = [];
  for (let i = 0; i < list.length; i += 150) {
    const chunk = list.slice(i, i + 150);
    const data = M.encodeFunctionData("aggregate3", [chunk.map((x) => ({ target: HELPER, allowFailure: true, callData: H.encodeFunctionData("getTaxTokenInfo", [x.token]) }))]);
    const [res] = M.decodeFunctionResult("aggregate3", await rpc("eth_call", [{ to: MULTICALL, data }, "latest"]));
    res.forEach((r, k) => {
      try { if (r.success && H.decodeFunctionResult("getTaxTokenInfo", r.returnData)[0].marketingWallet.toLowerCase() === fee) out.push(chunk[k]); } catch {}
    });
  }
  return out;
}

async function saltTag(tx) {
  try {
    const t = await rpc("eth_getTransactionByHash", [tx]);
    const b = ethers.getBytes(P.decodeFunctionData("newTokenV6", t.input)[0].salt);
    if (ethers.toUtf8String(b.slice(0, 4)) !== "FEEV" || ![0x4c, 0x53].includes(b[4])) return null;
    const market = ethers.toUtf8String(b.slice(6, 16)).replace(/\0+$/, "");
    return /^[A-Z0-9]{1,10}$/.test(market) && b[5] ? `feeverage:${market}:${b[4] === 0x4c ? "L" : "S"}:${b[5]}` : null;
  } catch {
    return null;
  }
}

async function meta(cid) {
  try {
    return await Promise.any(GATEWAYS.map(async (gw) => {
      const r = await fetch(gw + cid, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const img = j.image ? (/^https?:/.test(j.image) ? j.image : gw + String(j.image).replace(/^ipfs:\/\//, "")) : "";
      return { description: String(j.description ?? ""), logo: img, socials: { twitter: j.twitter ?? "", telegram: j.telegram ?? "", website: j.website ?? "" } };
    }));
  } catch {
    return null;
  }
}

export async function segment(fee, a, b) {
  const raw = await logs(a, b);
  const cands = [];
  for (const l of raw) {
    try {
      const ev = P.parseLog(l);
      cands.push({ token: ev.args.token, deployer: ev.args.creator, name: ev.args.name, symbol: ev.args.symbol, meta: ev.args.meta, block: Number(l.blockNumber), tx: l.transactionHash });
    } catch {}
  }
  const ours = await feeFilter(cands, fee);
  const tokens = await Promise.all(ours.map(async (x) => {
    const [salt, m] = await Promise.all([saltTag(x.tx), meta(x.meta)]);
    const known = KNOWN[x.token.toLowerCase()] ? "feeverage:" + KNOWN[x.token.toLowerCase()] : null;
    const desc = m?.description ?? "";
    const tag = TAG.exec(desc)?.[0] ?? salt ?? known;
    return { ...x, description: desc, logo: m?.logo ?? null, socials: m?.socials ?? {}, tag };
  }));
  return { tokens, candidates: cands.length };
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  res.setHeader("access-control-allow-origin", "*");
  const q = new URL(req.url, "http://x").searchParams;
  if (q.get("ping")) { res.setHeader("cache-control", "no-store"); return res.end(JSON.stringify(await ping(), null, 1)); }
  const fee = String(q.get("fee") || "").toLowerCase();
  const start = Number(q.get("start"));
  const seg = Number(q.get("seg"));
  if (!/^0x[0-9a-f]{40}$/.test(fee) || !Number.isSafeInteger(start) || start <= 0 || !Number.isSafeInteger(seg) || seg < 0) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "fee, start and seg are required" }));
  }
  // Always answer within ~9 s; the browser reads the chain itself when this server can't.
  deadline = Date.now() + 9000;
  try {
    const latest = Number(await rpc("eth_blockNumber", []));
    const a = start + seg * SEG;
    if (a > latest) { res.setHeader("cache-control", "no-store"); return res.end(JSON.stringify({ seg, from: a, to: a - 1, latest, final: false, tokens: [] })); }
    const end = a + SEG - 1;
    const b = Math.min(end, latest);
    const out = await Promise.race([segment(fee, a, b), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 9500))]);
    // Final once the whole segment is at least ~1 minute old (no reorg can touch it).
    const final = end <= latest - 150 && out.tokens.every((x) => x.tag);
    res.setHeader("cache-control", final ? "public, max-age=31536000, s-maxage=31536000, immutable" : "public, s-maxage=4, stale-while-revalidate=10");
    res.end(JSON.stringify({ seg, from: a, to: b, latest, final, tokens: out.tokens }));
  } catch (e) {
    res.statusCode = 503;
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
