// Stores a token logo and returns a public, permanent image URL.
// Works with zero setup: it uses Vercel Blob when a Blob store is connected
// (BLOB_READ_WRITE_TOKEN), and otherwise free public image hosts.
// Open /api/upload in a browser to see which storage works.

const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX = 1024 * 1024; // 1 MB

async function viaBlob(buf, type) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("no Blob store connected");
  const { put } = await import("@vercel/blob");
  const b = await put(`logos/logo.${TYPES[type]}`, buf, { access: "public", contentType: type, addRandomSuffix: true });
  return b.url;
}

async function viaCatbox(buf, type) {
  const fd = new FormData();
  fd.append("reqtype", "fileupload");
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
  fd.append("source", new Blob([buf], { type }), `logo.${TYPES[type]}`);
  const r = await fetch("https://freeimage.host/api/1/upload", { method: "POST", body: fd, signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({}));
  const url = j?.image?.url;
  if (!r.ok || !/^https:\/\//.test(url || "")) throw new Error(`freeimage: ${j?.error?.message || r.status}`);
  return url;
}

const HOSTS = [["blob", viaBlob], ["catbox", viaCatbox], ["freeimage", viaFreeimage]];

async function store(buf, type) {
  const errors = [];
  for (const [name, fn] of HOSTS) {
    try {
      return { url: await fn(buf, type), host: name };
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
    const out = {};
    for (const [name, fn] of HOSTS) {
      try { out[name] = "OK " + (await fn(DOT, "image/png")); } catch (e) { out[name] = "FAILED " + (e?.message || e); }
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
    res.end(JSON.stringify(await store(Buffer.concat(chunks), type)));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}
