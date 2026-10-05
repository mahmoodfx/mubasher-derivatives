// Serves files uploaded through /admin.html from Cloudflare KV at /files/<name>.

export async function onRequestGet({ params, env }) {
  const name = String(params.name || "");
  if (!env.SITE_KV || !/^[A-Za-z0-9._-]{1,110}$/.test(name)) {
    return new Response("Not found", { status: 404 });
  }
  const { value, metadata } = await env.SITE_KV.getWithMetadata("file:" + name, { type: "stream" });
  if (!value) return new Response("Not found", { status: 404 });

  return new Response(value, {
    headers: {
      "Content-Type": (metadata && metadata.type) || "application/octet-stream",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
