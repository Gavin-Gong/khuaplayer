// Update checks measure active installations, not people or playback activity.
// No IP-based identity, raw-token storage, additional client request, or SDK.
export type UpdateUsage = { installation: string; version: string };

export function parseUpdateUsage(request: Request): UpdateUsage | null {
  if (request.method !== "GET" || request.url.length > 2048) return null;
  const url = new URL(request.url);
  if (url.pathname !== "/updates/appcast.xml") return null;
  const ids = url.searchParams.getAll("khua_usage");
  const schemas = url.searchParams.getAll("khua_usage_v");
  if (ids.length !== 1 || schemas.length !== 1 || schemas[0] !== "1") return null;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(ids[0])) return null;
  // Sparkle already sends the app version. UA validation is only an input
  // filter: a public endpoint cannot prove a request came from a genuine app.
  const agent = request.headers.get("User-Agent") ?? "";
  if (agent.length > 200) return null;
  const version = /^Khua\/(\d{1,3}\.\d{1,3}\.\d{1,3}) Sparkle\/[\d.]+$/.exec(agent)?.[1];
  return version ? { installation: ids[0].toLowerCase(), version } : null;
}

export function utcDate(now: Date): string { return now.toISOString().slice(0, 10); }

export async function recordUpdateUsage(usage: UpdateUsage, env: Env, now = new Date()): Promise<void> {
  // Limit optional database work only, never the signed feed. This is a
  // per-location load guard, not a global quota or authentication mechanism.
  if (!env.USAGE_DB || !env.USAGE_BUDGET) return;
  if (!(await env.USAGE_BUDGET.limit({ key: "khua-update-usage-v1" })).success) return;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`khua-update-usage-v1:${usage.installation}`));
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  await env.USAGE_DB.prepare(`
    INSERT INTO update_installations (day, installation_hash, version) VALUES (?, ?, ?)
    ON CONFLICT(day, installation_hash) DO UPDATE SET version = excluded.version
    WHERE version != excluded.version
  `).bind(utcDate(now), hash, usage.version).run();
}

export async function pruneUpdateUsage(db: D1Database, now = new Date()): Promise<void> {
  const today = utcDate(now);
  const cutoff = utcDate(new Date(now.getTime() - 29 * 86400_000));
  // Finalize closed days before pruning in one transaction. Reruns are safe,
  // including after a delayed scheduled run. Totals contain no installation ID.
  await db.batch([
    db.prepare(`INSERT INTO update_daily_totals (day, installations)
      SELECT day, COUNT(*) FROM update_installations WHERE day < ? GROUP BY day
      ON CONFLICT(day) DO UPDATE SET installations = excluded.installations`).bind(today),
    db.prepare("DELETE FROM update_installations WHERE day < ?").bind(cutoff),
  ]);
}
