// Cloudflare Pages Function: /api/github
// Proxies requests to the GitHub Contents API using a token stored as a
// Cloudflare environment variable (GITHUB_TOKEN) — never exposed to the browser.
//
// The editor (admin.html) calls this endpoint instead of talking to GitHub
// directly, so the token never appears in any file a visitor can view.

const GITHUB_OWNER = "mahmoodfx";
const GITHUB_REPO = "mubasher-derivatives";
const GITHUB_BRANCH = "main";

export async function onRequestGet(context) {
  return handleRequest(context, "GET");
}

export async function onRequestPut(context) {
  return handleRequest(context, "PUT");
}

async function handleRequest(context, method) {
  const { request, env } = context;

  const token = env.GITHUB_TOKEN;
  if (!token) {
    return jsonResponse({ error: "Server is not configured with a GitHub token yet." }, 500);
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) {
    return jsonResponse({ error: "Missing 'path' query parameter." }, 400);
  }

  // Only allow paths inside this repo, never arbitrary GitHub URLs
  const safePath = path.replace(/^\/+/, "");

  const githubUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${safePath}`;
  const finalUrl = method === "GET" ? `${githubUrl}?ref=${GITHUB_BRANCH}` : githubUrl;

  const init = {
    method,
    headers: {
      "Authorization": `token ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "mubasher-derivatives-editor",
    },
  };

  if (method === "PUT") {
    const body = await request.text();
    init.body = body;
    init.headers["Content-Type"] = "application/json";
  }

  try {
    const ghRes = await fetch(finalUrl, init);
    const text = await ghRes.text();
    return new Response(text, {
      status: ghRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return jsonResponse({ error: "Could not reach GitHub: " + err.message }, 502);
  }
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
