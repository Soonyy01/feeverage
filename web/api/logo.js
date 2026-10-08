// Serves a token logo that was stored on Robinhood Chain.
// The launch page sends the image bytes as the data of a 0-ETH transaction to the creator's
// own address: "FEEVLOGO" + 1 byte image type + image bytes. This reads that transaction
// back and returns the image, so the logo is permanent and needs no storage service.
// URL: /api/logo?tx=0x<transaction hash>

const RPCS = [process.env.ROBINHOOD_RPC, "https://rpc.mainnet.chain.robinhood.com", "https://rpc.nodeflare.app/robinhood/public"].filter(Boolean);
const MAGIC = Buffer.from("FEEVLOGO");
const TYPES = { 1: "image/png", 2: "image/jpeg", 3: "image/webp", 4: "image/gif" };

export default async function handler(req, res) {
  const tx = String(new URL(req.url, "http://x").searchParams.get("tx") || "");
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) {
    res.statusCode = 400;
    return res.end("missing ?tx=0x…");
  }
  try {
    let input = null;
    for (const url of RPCS) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: [tx] }),
          signal: AbortSignal.timeout(10000),
        });
        input = (await r.json())?.result?.input ?? null;
        if (input) break;
      } catch {}
    }
    if (!input) {
      res.statusCode = 404;
      res.setHeader("cache-control", "public, max-age=30");
      return res.end("logo not found (yet)");
    }
    const buf = Buffer.from(input.slice(2), "hex");
    if (buf.length < 10 || !buf.subarray(0, 8).equals(MAGIC) || !TYPES[buf[8]]) {
      res.statusCode = 415;
      return res.end("not a logo transaction");
    }
    res.setHeader("content-type", TYPES[buf[8]]);
    res.setHeader("access-control-allow-origin", "*");
    // A transaction never changes: cache forever on the CDN and in browsers.
    res.setHeader("cache-control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.end(buf.subarray(9));
  } catch (e) {
    res.statusCode = 502;
    res.end("rpc error: " + (e?.message || e));
  }
}
