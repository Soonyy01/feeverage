// Server-side discovery of this site's launches, so visitors don't have to scan the chain
// from their own (often filtered) network. Reads Robinhood Chain from Vercel's servers:
//   TokenLaunched logs on the factory -> keep tokens whose creator fees go to ?fee=<operator>
//   and whose description carries the "feeverage:" strategy tag.
// GET /api/tokens?fee=0x...&from=<startBlock>
import { ethers } from "ethers";

const RPCS = [process.env.ROBINHOOD_RPC, "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean);
const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const F = new ethers.Interface([
  "event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)",
  "function getLaunchedToken(address) view returns ((address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists))",
]);
const T = new ethers.Interface([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function description() view returns (string)",
  "function getTokenInfo() view returns (address tokenDeployer,string tokenLogo,string tokenDescription,(string twitter,string telegram,string discord,string website,string farcaster) tokenSocials)",
]);
const TOPIC = F.getEvent("TokenLaunched").topicHash;
const TAG = /feeverage:[A-Z0-9]{1,12}:[LS]:\d{1,2}\b/;

async function rpc(method, params) {
  let err;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { err = e; }
  }
  throw err;
}
const call = async (to, iface, fn, args = []) => iface.decodeFunctionResult(fn, await rpc("eth_call", [{ to, data: iface.encodeFunctionData(fn, args) }, "latest"]));

// Kept between requests while the function instance stays warm.
const cache = globalThis.__feevTokens ??= { scanned: 0, launches: new Map(), verdict: new Map() };

async function scan(from, to) {
  let span = 50_000;
  let start = Math.max(from, cache.scanned + 1);
  while (start <= to) {
    const end = Math.min(to, start + span - 1);
    try {
      const logs = await rpc("eth_getLogs", [{ address: FACTORY, topics: [TOPIC], fromBlock: ethers.toQuantity(start), toBlock: ethers.toQuantity(end) }]);
      for (const l of logs) {
        const ev = F.parseLog(l);
        cache.launches.set(ev.args.token.toLowerCase(), { token: ev.args.token, curve: ev.args.curve, deployer: ev.args.deployer, block: Number(l.blockNumber) });
      }
      cache.scanned = end;
      start = end + 1;
    } catch (e) {
      if (span <= 1000) throw e;
      span = Math.floor(span / 5);
    }
  }
}

async function inspect(x, fee) {
  const key = x.token.toLowerCase() + ":" + fee;
  if (cache.verdict.has(key)) return cache.verdict.get(key);
  let out = null;
  const [info] = await call(FACTORY, F, "getLaunchedToken", [x.token]);
  if (info.creatorFeeRecipient.toLowerCase() === fee) {
    let meta;
    try {
      const r = await call(x.token, T, "getTokenInfo");
      meta = { logo: r[1], description: r[2], socials: { twitter: r[3][0], telegram: r[3][1], website: r[3][3] } };
    } catch {
      meta = { logo: "", description: (await call(x.token, T, "description").catch(() => [""]))[0], socials: {} };
    }
    if (TAG.test(meta.description || "")) {
      const [[name], [symbol]] = await Promise.all([call(x.token, T, "name"), call(x.token, T, "symbol")]);
      out = { ...x, curve: info.curve, deployer: info.deployer, name, symbol, ...meta };
    }
  }
  cache.verdict.set(key, out);
  return out;
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  const q = new URL(req.url, "http://x").searchParams;
  const fee = String(q.get("fee") || "").toLowerCase();
  const from = Number(q.get("from") || process.env.START_BLOCK || 83_500_000);
  if (!/^0x[0-9a-f]{40}$/.test(fee)) { res.statusCode = 400; return res.end(JSON.stringify({ error: "fee=0x… required" })); }
  try {
    if (cache.scanned < from - 1) cache.scanned = from - 1;
    const latest = Number(await rpc("eth_blockNumber", []));
    await scan(from, latest);
    const list = [...cache.launches.values()].filter((x) => x.block >= from);
    const found = [];
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (i < list.length) {
        const x = list[i++];
        try { const t = await inspect(x, fee); if (t) found.push(t); } catch {}
      }
    }));
    found.sort((a, b) => b.block - a.block);
    res.setHeader("cache-control", "public, s-maxage=15, stale-while-revalidate=60");
    res.end(JSON.stringify({ latest, scannedLaunches: list.length, tokens: found }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
