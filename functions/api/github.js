// Cloudflare Pages Function: /api/github
//
// Two secrets must be set in Cloudflare (Pages project > Settings > Variables and Secrets):
//   GITHUB_TOKEN    GitHub token with the "repo" scope
//   ADMIN_PASSWORD  the password for /admin.html (checked here, never sent to the browser)
//
// The editor calls this endpoint instead of GitHub, so neither secret appears in any public file.

const GITHUB_OWNER = "mahmoodfx";
const GITHUB_REPO = "mubasher-derivatives";
const GITHUB_BRANCH = "main";

// Only index.html and root-level PDFs/images can be read or written through the editor.
const ALLOWED_PATH = /^(index\.html|[A-Za-z0-9._-]+\.(pdf|png|jpg|jpeg|webp))$/i;

export async function onRequestGet(context) {
  return handle(context, "GET");
}

export async function onRequestPut(context) {
  return handle(context, "PUT");
}

async function handle({ request, env }, method) {
  if (!env.GITHUB_TOKEN || !env.ADMIN_PASSWORD) {
    return json({ error: "Server is missing GITHUB_TOKEN or ADMIN_PASSWORD." }, 500);
  }

  const given = request.headers.get("X-Admin-Password") || "";
  if (!(await safeEqual(given, env.ADMIN_PASSWORD))) {
    return json({ error: "Wrong password." }, 401);
  }

  const url = new URL(request.url);

  // Lightweight login check used by the admin page
  if (url.searchParams.get("check")) {
    return json({ ok: true }, 200);
  }

  const path = (url.searchParams.get("path") || "").replace(/^\/+/, "");
  if (!ALLOWED_PATH.test(path)) {
    return json({ error: "That file can't be edited here." }, 400);
  }

  const base = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const init = {
    method,
    headers: {
      "Authorization": `token ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "mubasher-derivatives-editor",
    },
  };

  let target = base;
  if (method === "GET") {
    target = `${base}?ref=${GITHUB_BRANCH}`;
  } else {
    init.body = await request.text();
    init.headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(target, init);
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return json({ error: "Could not reach GitHub: " + err.message }, 502);
  }
}

// Compares SHA-256 digests so the check takes the same time whether or not the password is close.
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
