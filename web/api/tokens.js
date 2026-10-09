// The launch list: Launched events of the Feeverage router, one fixed block segment per request.
//   GET /api/tokens?router=0x…&start=<routerBlock>&seg=<n>
// Segment n covers blocks [start + n·SEG, start + (n+1)·SEG − 1]. A finished segment never
// changes, so the CDN keeps it for a year: every visitor sees the same list and only the newest
// segment is ever read from the chain.
//   GET /api/tokens?ping=1 → which BNB Chain endpoints this server can reach.
import { ethers } from "ethers";

export const SEG = 100_000;
// Endpoints that serve eth_getLogs for BNB Chain (checked with ?ping=1).
const RPCS = [process.env.BSC_RPC, "https://bsc-rpc.publicnode.com", "https://bsc.drpc.org"].filter(Boolean);
const NT6 = "(string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion)";
const R = new ethers.Interface([
  `function launch(${NT6} p,string market,bool isLong,uint8 leverage) payable returns (address token)`,
  "event Launched(address indexed token,address indexed creator,string market,bool isLong,uint8 leverage,uint16 taxBps,string name,string symbol,string meta)",
]);
const TOPIC = R.getEvent("Launched").topicHash;

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

async function ping() {
  return Promise.all(RPCS.map(async (url) => {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }), signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return { url, ok: true, latest: Number(j.result), ms: Date.now() - t0 };
    } catch (e) {
      return { url, ok: false, error: String(e?.message || e).slice(0, 120), ms: Date.now() - t0 };
    }
  }));
}

export function toToken(l) {
  const ev = R.parseLog(l);
  if (!ev || ev.name !== "Launched") return null;
  const a = ev.args;
  return { token: ethers.getAddress(a.token), deployer: a.creator, market: a.market, isLong: a.isLong, leverage: Number(a.leverage), taxBps: Number(a.taxBps),
    name: a.name, symbol: a.symbol, meta: a.meta, block: Number(l.blockNumber), tx: l.transactionHash };
}

export async function segment(router, a, b) {
  const parts = [];
  for (let x = a; x <= b; x += 10_000) parts.push([x, Math.min(b, x + 9_999)]);
  const logs = (await Promise.all(parts.map(([x, y]) => rpc("eth_getLogs", [{ address: router, topics: [TOPIC], fromBlock: ethers.toQuantity(x), toBlock: ethers.toQuantity(y) }])))).flat();
  return logs.map((l) => { try { return toToken(l); } catch { return null; } }).filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  res.setHeader("access-control-allow-origin", "*");
  const q = new URL(req.url, "http://x").searchParams;
  if (q.get("ping")) { res.setHeader("cache-control", "no-store"); return res.end(JSON.stringify(await ping(), null, 1)); }
  const router = String(q.get("router") || "").toLowerCase();
  const start = Number(q.get("start"));
  const seg = Number(q.get("seg"));
  if (!/^0x[0-9a-f]{40}$/.test(router) || !Number.isSafeInteger(start) || start <= 0 || !Number.isSafeInteger(seg) || seg < 0) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "router, start and seg are required" }));
  }
  // Always answer within ~9 s; the browser reads the chain itself when this server can't.
  deadline = Date.now() + 9000;
  try {
    const latest = Number(await rpc("eth_blockNumber", []));
    const a = start + seg * SEG;
    if (a > latest) { res.setHeader("cache-control", "no-store"); return res.end(JSON.stringify({ seg, from: a, to: a - 1, latest, final: false, tokens: [] })); }
    const end = a + SEG - 1;
    const b = Math.min(end, latest);
    const tokens = await Promise.race([segment(router, a, b), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 9500))]);
    // Final once the whole segment is at least ~1 minute old (no reorg can touch it).
    const final = end <= latest - 150;
    res.setHeader("cache-control", final ? "public, max-age=31536000, s-maxage=31536000, immutable" : "public, s-maxage=3, stale-while-revalidate=10");
    res.end(JSON.stringify({ seg, from: a, to: b, latest, final, tokens }));
  } catch (e) {
    res.statusCode = 503;
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
