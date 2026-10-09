// Pins a token's logo + metadata on flap.sh's IPFS (https://funcs.flap.sh/api/upload) and
// returns the CID used as `meta` at launch. Proxied through this site because the browser
// can't always call flap.sh's upload API directly (CORS, filtered networks).
const UPSTREAM = "https://funcs.flap.sh/api/upload";
const MAX = 6 * 1024 * 1024;

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "POST multipart/form-data" }));
  }
  const type = String(req.headers["content-type"] || "");
  if (!type.startsWith("multipart/form-data")) {
    res.statusCode = 415;
    return res.end(JSON.stringify({ error: "multipart/form-data required" }));
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX) { res.statusCode = 413; return res.end(JSON.stringify({ error: "too large" })); }
    chunks.push(c);
  }
  try {
    const r = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": type,
        origin: "https://flap.sh",
        referer: "https://flap.sh/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(40000),
    });
    const text = await r.text();
    res.statusCode = r.status;
    res.end(text.startsWith("{") ? text : JSON.stringify({ error: `upload ${r.status}: ${text.slice(0, 200)}` }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
