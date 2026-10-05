// /api/admin: saves edits made in /admin.html to Cloudflare KV. No GitHub involved.
//
// Needs, in the Cloudflare Pages project:
//   KV binding       SITE_KV         (Settings > Bindings)
//   Secret variable  ADMIN_PASSWORD  (Settings > Variables and Secrets)

const MAX_FILE_BYTES = 25 * 1024 * 1024; // Cloudflare KV limit per stored value
const FILE_NAME = /^[A-Za-z0-9._-]{1,100}\.(pdf|png|jpg|jpeg|webp)$/i;
const FILE_TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const FIELD_ID = /^(txt|link)-[a-z0-9-]{1,60}$/;
const SAFE_LINK = /^(https?:\/\/\S+|mailto:\S+|tel:[+0-9 ()-]+|\/[A-Za-z0-9._~\/%-]*|[A-Za-z0-9._-]+)$/i;

// GET = login check
export async function onRequestGet(context) {
  const denied = await guard(context);
  return denied || json({ ok: true }, 200);
}

export async function onRequestPut(context) {
  const denied = await guard(context);
  if (denied) return denied;

  const { request, env } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  if (type === "content") return saveContent(request, env);
  if (type === "file") return saveFile(request, env, url.searchParams.get("name") || "");
  return json({ error: "Unknown request." }, 400);
}

async function guard({ request, env }) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: "Setup incomplete: the ADMIN_PASSWORD variable is missing in Cloudflare." }, 500);
  }
  if (!env.SITE_KV) {
    return json({ error: "Setup incomplete: the SITE_KV storage binding is missing in Cloudflare." }, 500);
  }
  const given = request.headers.get("X-Admin-Password") || "";
  if (!(await safeEqual(given, env.ADMIN_PASSWORD))) {
    return json({ error: "Wrong password." }, 401);
  }
  return null;
}

async function saveContent(request, env) {
  let edits;
  try {
    edits = await request.json();
  } catch (e) {
    return json({ error: "Invalid data." }, 400);
  }
  if (!edits || typeof edits !== "object" || Array.isArray(edits)) {
    return json({ error: "Invalid data." }, 400);
  }
  const entries = Object.entries(edits);
  if (entries.length > 200) return json({ error: "Too many fields." }, 400);

  const clean = {};
  for (const [id, value] of entries) {
    if (!FIELD_ID.test(id) || typeof value !== "string" || value.length > 2000) {
      return json({ error: "Invalid value for " + id + "." }, 400);
    }
    if (id.startsWith("link-")) {
      const link = value.trim();
      if (!SAFE_LINK.test(link)) {
        return json({ error: "The link for " + id + " isn't valid. Use a full address starting with https://" }, 400);
      }
      clean[id] = link;
    } else {
      clean[id] = value;
    }
  }

  if (entries.length === 0) await env.SITE_KV.delete("content");
  else await env.SITE_KV.put("content", JSON.stringify(clean));
  return json({ ok: true, saved: entries.length }, 200);
}

async function saveFile(request, env, name) {
  const m = FILE_NAME.exec(name);
  if (!m) return json({ error: "File name not allowed. Use a PDF or image with a simple name." }, 400);

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_FILE_BYTES) return json({ error: "File is over 25 MB, the storage limit." }, 413);

  const data = await request.arrayBuffer();
  if (data.byteLength === 0) return json({ error: "The file is empty." }, 400);
  if (data.byteLength > MAX_FILE_BYTES) return json({ error: "File is over 25 MB, the storage limit." }, 413);

  await env.SITE_KV.put("file:" + name, data, { metadata: { type: FILE_TYPES[m[1].toLowerCase()] } });
  return json({ ok: true, url: "/files/" + name }, 200);
}

// Compares SHA-256 digests so the check takes the same time whether or not the guess is close.
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
