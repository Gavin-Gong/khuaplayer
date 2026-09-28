import { CATALOG_KEY, parseCatalog } from "./catalog.ts";

const headers = {
  "Cache-Control": "no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
};

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const dynamic = path === "/download" || path.startsWith("/api/") || path.startsWith("/updates/");
    if (!dynamic) return env.ASSETS.fetch(request);
    const head = request.method === "HEAD";
    const error = (message: string, status: number) => new Response(head ? null : message, { status, headers });
    if (!head && request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
    }
    if (!["/download", "/api/releases.json", "/updates/appcast.xml"].includes(path)) {
      return error("Not found", 404);
    }
    try {
      const object = await env.RELEASES.get(CATALOG_KEY);
      if (!object) return error("No release has been published yet.", 404);
      if (object.size > 512 * 1024) throw new Error("Catalog exceeds its size limit");
      const catalog = parseCatalog(await object.json());
      if (path === "/download") {
        return new Response(null, { status: 302, headers: { ...headers, Location: catalog.releases[0].url } });
      }
      if (path === "/api/releases.json") {
        return new Response(head ? null : JSON.stringify(catalog), {
          headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
        });
      }
      // The catalog atomically selects an immutable, already-signed feed. Never
      // regenerate XML at the edge: changing even whitespace invalidates its signature.
      const feed = await env.RELEASES.get(catalog.appcastKey);
      if (!feed) throw new Error("Published feed is missing");
      return new Response(head ? null : feed.body, {
        headers: { ...headers, "Content-Type": "application/rss+xml; charset=utf-8", ETag: feed.httpEtag },
      });
    } catch (cause) {
      console.error(JSON.stringify({ event: "release_read_failed", path, message: cause instanceof Error ? cause.message : "Unknown error" }));
      return error("Release information is temporarily unavailable. Please try again later.", 503);
    }
  },
} satisfies ExportedHandler<Env>;
