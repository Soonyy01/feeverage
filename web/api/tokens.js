// Server-side discovery of this site's launches on flap.sh (BNB Chain).
//   1. TokenCreated logs on the flap.sh Portal (every launch on flap.sh)
//   2. keep tax tokens whose tax goes to ?fee=<operator> (Tax Token Helper, batched via Multicall3)
//   3. keep those whose IPFS description carries the "feeverage:" strategy tag
// GET /api/tokens?fee=0x...&from=<startBlock>
import { ethers } from "ethers";

const RPCS = [process.env.BSC_RPC, "https://bsc-rpc.publicnode.com", "https://bsc.drpc.org", "https://1rpc.io/bnb", "https://binance.llamarpc.com", "https://bsc-dataseed.bnbchain.org"].filter(Boolean);
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const HELPER = "0x53841c73217735F37BC1775538b03b23feFD8346";
const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";
const IPFS = "https://flap.mypinata.cloud/ipfs/";
const P = new ethers.Interface(["event TokenCreated(uint256 ts,address creator,uint256 nonce,address token,string name,string symbol,string meta)"]);
const H = new ethers.Interface(["function getTaxTokenInfo(address taxToken) view returns ((uint16 marketBps,uint16 deflationBps,uint16 lpBps,uint16 dividendBps,uint16 taxRate,uint256 burntTokenAmount,uint256 totalQuoteSentToDividend,uint256 totalQuoteAddedToLiquidity,uint256 totalTokenAddedToLiquidity,uint256 totalQuoteSentToMarketing,address marketingWallet,address quoteToken,uint256 minimumShareBalance))"]);
const M = new ethers.Interface(["function aggregate3((address target,bool allowFailure,bytes callData)[] calls) view returns ((bool success,bytes returnData)[])"]);
const TOPIC = P.getEvent("TokenCreated").topicHash;
const TAG = /feeverage:[A-Z0-9]{1,12}:[LS]:\d{1,2}\b/;
const BUDGET_MS = 45_000;

// Public BNB Chain endpoints that serve eth_getLogs (bsc-dataseed does not, so it is last).
let good = 0;
async function rpc(method, params) {
  let err;
  for (let k = 0; k < RPCS.length; k++) {
    const i = (good + k) % RPCS.length;
    try {
      const r = await fetch(RPCS[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      good = i;
      return j.result;
    } catch (e) { err = e; }
  }
  throw err;
}

// Kept between requests while the function instance stays warm.
// Covered range is [lo, hi]. New blocks are read first, then older ones, so the newest
// launches show up on the very first request even when the history is long.
const cache = globalThis.__feevBsc2 ??= { from: -1, lo: 0, hi: 0, launches: [], seen: new Set(), verdict: new Map() };

async function logs(start, end) {
  try {
    return await rpc("eth_getLogs", [{ address: PORTAL, topics: [TOPIC], fromBlock: ethers.toQuantity(start), toBlock: ethers.toQuantity(end) }]);
  } catch (e) {
    if (end - start < 200) throw e;
    const mid = Math.floor((start + end) / 2);
    return [...(await logs(start, mid)), ...(await logs(mid + 1, end))];
  }
}

function keep(list) {
  for (const l of list) {
    try {
      const ev = P.parseLog(l);
      const key = ev.args.token.toLowerCase();
      if (cache.seen.has(key)) continue;
      cache.seen.add(key);
      cache.launches.push({ token: ev.args.token, deployer: ev.args.creator, name: ev.args.name, symbol: ev.args.symbol, meta: ev.args.meta, block: Number(l.blockNumber) });
    } catch {}
  }
}

const SPAN = 5000;
async function scan(from, latest, deadline) {
  if (cache.from !== from) Object.assign(cache, { from, lo: latest + 1, hi: latest, launches: [], seen: new Set() });
  while (cache.hi < latest && Date.now() < deadline) {
    const end = Math.min(latest, cache.hi + SPAN);
    keep(await logs(cache.hi + 1, end));
    cache.hi = end;
  }
  while (cache.lo > from && Date.now() < deadline) {
    const start = Math.max(from, cache.lo - SPAN);
    keep(await logs(start, cache.lo - 1));
    cache.lo = start;
  }
  return cache.lo <= from && cache.hi >= latest;
}

// Which candidates send their tax to our operator? One Multicall3 call per 150 tokens.
async function filterByFee(list, fee) {
  const todo = list.filter((x) => !cache.verdict.has(x.token.toLowerCase() + fee));
  for (let i = 0; i < todo.length; i += 150) {
    const chunk = todo.slice(i, i + 150);
    const data = M.encodeFunctionData("aggregate3", [chunk.map((x) => ({ target: HELPER, allowFailure: true, callData: H.encodeFunctionData("getTaxTokenInfo", [x.token]) }))]);
    const [res] = M.decodeFunctionResult("aggregate3", await rpc("eth_call", [{ to: MULTICALL, data }, "latest"]));
    res.forEach((r, k) => {
      let ours = false;
      if (r.success) {
        try { ours = H.decodeFunctionResult("getTaxTokenInfo", r.returnData)[0].marketingWallet.toLowerCase() === fee; } catch {}
      }
      cache.verdict.set(chunk[k].token.toLowerCase() + fee, ours ? "fee" : false);
    });
  }
  return list.filter((x) => cache.verdict.get(x.token.toLowerCase() + fee));
}

async function meta(cid) {
  try {
    const r = await fetch(IPFS + cid, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const img = j.image ? (/^https?:/.test(j.image) ? j.image : IPFS + String(j.image).replace(/^ipfs:\/\//, "")) : "";
    return { description: j.description ?? "", logo: img, socials: { twitter: j.twitter ?? "", telegram: j.telegram ?? "", website: j.website ?? "" } };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  const q = new URL(req.url, "http://x").searchParams;
  const fee = String(q.get("fee") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(fee)) { res.statusCode = 400; return res.end(JSON.stringify({ error: "fee=0x… required" })); }
  const deadline = Date.now() + BUDGET_MS;
  try {
    const latest = Number(await rpc("eth_blockNumber", []));
    // Without a start block, look back ~450k blocks, fixed once per instance so the cache holds.
    const asked = Number(q.get("from") || process.env.START_BLOCK || 0);
    const from = asked || (cache.from >= 0 && !cache.asked ? cache.from : Math.max(0, latest - 450_000));
    cache.asked = !!asked;
    let done = false;
    try { done = await scan(from, latest, deadline); } catch {} // keep what was read so far
    const ours = await filterByFee(cache.launches, fee);
    const tokens = [];
    await Promise.all(ours.map(async (x) => {
      const key = x.token.toLowerCase() + fee;
      let v = cache.verdict.get(key);
      if (v === "fee") {
        const m = await meta(x.meta);
        if (!m) return; // IPFS slow: try again next time
        v = TAG.test(m.description) ? { ...x, ...m } : false;
        cache.verdict.set(key, v);
      }
      if (v) tokens.push(v);
    }));
    tokens.sort((a, b) => b.block - a.block);
    res.setHeader("cache-control", done ? "public, s-maxage=15, stale-while-revalidate=60" : "no-store");
    res.end(JSON.stringify({ latest, covered: [cache.lo, cache.hi], complete: done, launches: cache.launches.length, tokens }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
