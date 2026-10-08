// Read-only Robinhood Chain RPC proxy for visitors whose network or browser can't reach
// the public endpoints directly. Wallet transactions never go through here.
const UPSTREAMS = [
  process.env.ROBINHOOD_RPC,
  "https://rpc.mainnet.chain.robinhood.com",
  "https://rpc.nodeflare.app/robinhood/public",
].filter(Boolean);

const ALLOWED = new Set([
  "eth_chainId", "net_version", "eth_blockNumber", "eth_call", "eth_getLogs", "eth_getBalance",
  "eth_getCode", "eth_getStorageAt", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas",
  "eth_feeHistory", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getTransactionByHash",
  "eth_getTransactionReceipt", "eth_getTransactionCount",
]);
const MAX = 256 * 1024;

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "POST JSON-RPC" }));
  }
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (raw.length > MAX) { res.statusCode = 413; return res.end("{}"); }
  }
  let body;
  try { body = JSON.parse(raw); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: "bad json" })); }
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > 20 || calls.some((c) => !ALLOWED.has(c?.method))) {
    res.statusCode = 403;
    return res.end(JSON.stringify({ jsonrpc: "2.0", id: calls[0]?.id ?? null, error: { code: -32601, message: "method not allowed" } }));
  }
  for (const url of UPSTREAMS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: raw, signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const txt = await r.text();
      JSON.parse(txt); // must be valid JSON
      return res.end(txt);
    } catch {}
  }
  res.statusCode = 502;
  res.end(JSON.stringify({ jsonrpc: "2.0", id: calls[0]?.id ?? null, error: { code: -32000, message: "Robinhood Chain RPC unreachable" } }));
}
