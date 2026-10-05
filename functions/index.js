// Serves index.html with any edits saved from /admin.html applied on top.
// Edits live in Cloudflare KV (binding SITE_KV, key "content").
// If KV isn't set up yet, or has no edits, the page is served exactly as stored in the repo.

export async function onRequestGet({ request, env, next }) {
  const url = new URL(request.url);
  if (url.searchParams.has("raw") || !env.SITE_KV) return next();

  let edits = null;
  try {
    edits = await env.SITE_KV.get("content", { type: "json", cacheTtl: 60 });
  } catch (e) {
    return next();
  }
  if (!edits || typeof edits !== "object" || Object.keys(edits).length === 0) return next();

  // Fresh request so a cached browser copy can't turn this into an empty 304 reply
  const page = await env.ASSETS.fetch(new Request(url.origin + "/", { method: "GET" }));

  const rewriter = new HTMLRewriter();
  for (const [id, value] of Object.entries(edits)) {
    if (!/^(txt|link)-[a-z0-9-]+$/.test(id) || typeof value !== "string") continue;
    if (id.startsWith("txt-")) {
      rewriter.on("#" + id, { element(el) { el.setInnerContent(value); } });
    } else {
      rewriter.on("#" + id, { element(el) { el.setAttribute("href", value); } });
    }
  }

  const out = rewriter.transform(page);
  const headers = new Headers(out.headers);
  headers.delete("etag");
  headers.set("Cache-Control", "no-cache");
  return new Response(out.body, { status: out.status, headers });
}
