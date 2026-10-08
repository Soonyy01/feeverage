// Stores a token logo and returns a public, permanent image URL.
// Works with zero setup: it uses Vercel Blob when a Blob store is connected
// (BLOB_READ_WRITE_TOKEN), and otherwise free public image hosts.
// Open /api/upload in a browser to see which storage works.

const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX = 1024 * 1024; // 1 MB

// Finds Blob credentials however the store was connected: a read-write token
// (any prefix), or the newer OIDC connection (store id + per-request OIDC token).
function blobAuth(req) {
  const env = process.env;
  const token = env.BLOB_READ_WRITE_TOKEN ||
    Object.entries(env).find(([k, v]) => k.endsWith("READ_WRITE_TOKEN") && String(v).startsWith("vercel_blob_rw_"))?.[1];
  if (token) return { token };
  const storeId = env.BLOB_STORE_ID || Object.entries(env).find(([k]) => k.endsWith("BLOB_STORE_ID") || k.endsWith("_STORE_ID"))?.[1];
  const oidcToken = req?.headers?.["x-vercel-oidc-token"] || env.VERCEL_OIDC_TOKEN;
  if (storeId && oidcToken) return { storeId, oidcToken };
  if (storeId) return { storeId };
  return null;
}

async function viaBlob(buf, type, req) {
  const auth = blobAuth(req);
  if (!auth) throw new Error("no Blob store connected to this project");
  const { put } = await import("@vercel/blob");
  const b = await put(`logos/logo.${TYPES[type]}`, buf, { access: "public", contentType: type, addRandomSuffix: true, ...auth });
  return b.url;
}

async function viaCatbox(buf, type) {
  const fd = new FormData();
  fd.append("reqtype", "fileupload");
  fd.append("userhash", "");
  fd.append("fileToUpload", new Blob([buf], { type }), `logo.${TYPES[type]}`);
  const r = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: fd, signal: AbortSignal.timeout(8000) });
  const txt = (await r.text()).trim();
  if (!r.ok || !/^https:\/\/files\.catbox\.moe\/\S+$/.test(txt)) throw new Error(`catbox: ${txt.slice(0, 80) || r.status}`);
  return txt;
}

async function viaFreeimage(buf, type) {
  const fd = new FormData();
  fd.append("key", "6d207e02198a847aa98d0a2a901485a5"); // public API key from freeimage.host docs
  fd.append("action", "upload");
  fd.append("format", "json");
  fd.append("source", Buffer.from(buf).toString("base64"));
  const r = await fetch("https://freeimage.host/api/1/upload", { method: "POST", body: fd, signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({}));
  const url = j?.image?.url;
  if (!r.ok || !/^https:\/\//.test(url || "")) throw new Error(`freeimage: ${j?.error?.message || r.status}`);
  return url;
}

// Only Blob: the free hosts refuse uploads from Vercel servers. When Blob is not connected,
// the launch page stores the logo on-chain instead (see api/logo.js).
const HOSTS = [["blob", viaBlob]];

async function store(buf, type, req) {
  const errors = [];
  for (const [name, fn] of HOSTS) {
    try {
      return { url: await fn(buf, type, req), host: name };
    } catch (e) {
      errors.push(`${name}: ${e?.message || e}`);
    }
  }
  throw new Error(errors.join(" | "));
}

// 1×1 transparent PNG used by the GET check.
const DOT = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");

  if (req.method === "GET") {
    const out = { blobEnv: Object.keys(process.env).filter((k) => /BLOB|OIDC|STORE/.test(k)) };
    for (const [name, fn] of HOSTS) {
      try { out[name] = "OK " + (await fn(DOT, "image/png", req)); } catch (e) { out[name] = "FAILED " + (e?.message || e); }
    }
    return res.end(JSON.stringify(out, null, 2));
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "POST an image" }));
  }
  const type = String(req.headers["content-type"] || "").split(";")[0].trim();
  if (!TYPES[type]) {
    res.statusCode = 415;
    return res.end(JSON.stringify({ error: "Use a png, jpg, webp or gif image" }));
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX) {
      res.statusCode = 413;
      return res.end(JSON.stringify({ error: "Image is larger than 1 MB" }));
    }
    chunks.push(c);
  }
  if (!size) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Empty file" }));
  }
  try {
    res.end(JSON.stringify(await store(Buffer.concat(chunks), type, req)));
  } catch (e) {
    console.error("logo upload failed:", e?.message || e);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
