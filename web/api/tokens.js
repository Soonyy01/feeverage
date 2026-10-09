// Server-side discovery of this site's launches on flap.sh (BNB Chain).
//   1. TokenCreated logs on the flap.sh Portal (every launch on flap.sh)
//   2. keep tax tokens whose tax goes to ?fee=<operator> (Tax Token Helper, batched via Multicall3)
//   3. keep those whose IPFS description carries the "feeverage:" strategy tag
// GET /api/tokens?fee=0x...&from=<startBlock>
import { ethers } from "ethers";

const RPCS = [process.env.BSC_RPC, "https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org", "https://bsc-dataseed1.binance.org"].filter(Boolean);
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

async function rpc(method, params) {
  let err;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { err = e; }
  }
  throw err;
}

// Kept between requests while the function instance stays warm.
const cache = globalThis.__feevBsc ??= { scanned: 0, from: 0, launches: [], verdict: new Map() };

async function scan(to, deadline) {
  let span = 5000;
  while (cache.scanned < to && Date.now() < deadline) {
    const start = cache.scanned + 1, end = Math.min(to, start + span - 1);
    try {
      const logs = await rpc("eth_getLogs", [{ address: PORTAL, topics: [TOPIC], fromBlock: ethers.toQuantity(start), toBlock: ethers.toQuantity(end) }]);
      for (const l of logs) {
        try {
          const ev = P.parseLog(l);
          cache.launches.push({ token: ev.args.token, deployer: ev.args.creator, name: ev.args.name, symbol: ev.args.symbol, meta: ev.args.meta, block: Number(l.blockNumber) });
        } catch {}
      }
      cache.scanned = end;
      if (span < 5000) span = Math.min(5000, span * 2);
    } catch (e) {
      if (span <= 250) throw e;
      span = Math.floor(span / 4);
    }
  }
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
    // Without a start block, look back about four days.
    const from = Number(q.get("from") || process.env.START_BLOCK || 0) || Math.max(0, latest - 450_000);
    if (cache.from !== from) { cache.from = from; cache.scanned = from - 1; cache.launches = []; }
    await scan(latest, deadline);
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
    const done = cache.scanned >= latest;
    res.setHeader("cache-control", done ? "public, s-maxage=15, stale-while-revalidate=60" : "no-store");
    res.end(JSON.stringify({ latest, scannedTo: cache.scanned, complete: done, launches: cache.launches.length, tokens }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
