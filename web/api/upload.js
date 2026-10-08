// Stores a token logo in Vercel Blob and returns its public URL.
// Needs a Blob store connected to this Vercel project (Storage → Blob → Connect),
// which sets BLOB_READ_WRITE_TOKEN automatically.
import { put } from "@vercel/blob";

const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX = 1024 * 1024; // 1 MB

export default async function handler(req, res) {
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
    const blob = await put(`logos/logo.${TYPES[type]}`, Buffer.concat(chunks), {
      access: "public",
      contentType: type,
      addRandomSuffix: true,
    });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ url: blob.url }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Upload storage is not set up: " + (e?.message || e) }));
  }
}
