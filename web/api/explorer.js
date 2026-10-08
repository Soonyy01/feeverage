// Proxy for the Robinhood Chain explorer's log search, for visitors who can't reach it directly.
const EXPLORER = process.env.ROBINHOOD_EXPLORER || "https://robinhoodchain.blockscout.com";

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  const q = new URL(req.url, "http://x").searchParams;
  if (q.get("module") !== "logs" || q.get("action") !== "getLogs") {
    res.statusCode = 400;
    return res.end(JSON.stringify({ message: "only module=logs&action=getLogs" }));
  }
  const keep = new URLSearchParams();
  for (const k of ["module", "action", "address", "topic0", "fromBlock", "toBlock"]) if (q.get(k)) keep.set(k, q.get(k));
  try {
    const r = await fetch(`${EXPLORER}/api?${keep}`, { signal: AbortSignal.timeout(15000) });
    res.setHeader("cache-control", "public, s-maxage=10");
    res.statusCode = r.status;
    res.end(await r.text());
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ message: "explorer unreachable" }));
  }
}
