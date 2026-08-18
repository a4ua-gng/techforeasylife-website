const ADMIN_API_ORIGIN = "https://tel-website-admin-api.xtremedivyangshu.workers.dev";
const PUBLIC_SITE_ORIGIN = "https://techforeasylife.in";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api-proxy" || url.pathname.startsWith("/api-proxy/")) {
        return await proxyAdminApi(request, env, url);
      }

      if (url.pathname === "/preview" || url.pathname.startsWith("/preview/")) {
        return await proxyPublicPreview(request, url);
      }

      const response = await env.ASSETS.fetch(request);
      return securedResponse(response, { frameMode: "deny" });
    } catch (error) {
      console.error(JSON.stringify({
        message: "TEL admin edge request failed",
        method: request.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error)
      }));
      return securedResponse(
        Response.json({ ok: false, error: "The admin edge service could not complete this request." }, { status: 502 }),
        { frameMode: "deny" }
      );
    }
  }
};

async function proxyAdminApi(request, env, sourceUrl) {
  const backendUrl = new URL(sourceUrl.pathname.slice("/api-proxy".length) || "/", ADMIN_API_ORIGIN);
  backendUrl.search = sourceUrl.search;
  const proxyRequest = new Request(backendUrl, request);
  const response = env.ADMIN_API?.fetch
    ? await env.ADMIN_API.fetch(proxyRequest)
    : await fetch(proxyRequest);
  return securedResponse(response, { frameMode: "deny" });
}

async function proxyPublicPreview(request, sourceUrl) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return securedResponse(
      Response.json({ ok: false, error: "Preview supports GET and HEAD requests only." }, { status: 405 }),
      { frameMode: "sameorigin" }
    );
  }

  const publicPath = sourceUrl.pathname.slice("/preview".length) || "/";
  const previewUrl = new URL(publicPath, PUBLIC_SITE_ORIGIN);
  previewUrl.search = sourceUrl.search;
  const headers = new Headers(request.headers);
  headers.delete("Authorization");
  headers.delete("Cookie");
  const response = await fetch(new Request(previewUrl, {
    method: request.method,
    headers,
    redirect: "follow"
  }));
  return securedResponse(response, { frameMode: "sameorigin" });
}

function securedResponse(response, { frameMode }) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", frameMode === "sameorigin" ? "SAMEORIGIN" : "DENY");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
