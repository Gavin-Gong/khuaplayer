import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { parseUpdateUsage } from "../cloudflare/usage.ts";

const id = "86b713dd-e6ec-4b7b-b239-d88d6c02d2ff";
const secondID = "95cc3c08-7ee7-4223-af4d-476cd7ca9595";
const url = `https://khua.app/updates/appcast.xml?khua_usage=${id}&khua_usage_v=1`;
const headers = { "User-Agent": "Khua/0.6.1 Sparkle/2.9.6" };

test("accepts only bounded, unambiguous installation statistics on GET appcasts", () => {
  assert.deepEqual(parseUpdateUsage(new Request(url, { headers })), { installation: id, version: "0.6.1" });
  assert.equal(parseUpdateUsage(new Request(url.replace(id, id.toUpperCase()), { headers })).installation, id);
  for (const changed of [
    url.replace("appcast.xml", "unknown.xml"), url.replace(id, "not-an-id"),
    url.replace("khua_usage_v=1", "khua_usage_v=2"), `${url}&khua_usage=${id}`,
    `${url}&khua_usage_v=1`, `${url}&padding=${"a".repeat(2100)}`,
    "https://khua.app/updates/appcast.xml", url.replace(id, id.replace("4b7b", "1b7b")),
  ]) assert.equal(parseUpdateUsage(new Request(changed, { headers })), null);
  for (const method of ["HEAD", "POST", "OPTIONS"]) {
    assert.equal(parseUpdateUsage(new Request(url, { method, headers })), null);
  }
  assert.equal(parseUpdateUsage(new Request(url)), null);
  assert.equal(parseUpdateUsage(new Request(url, { headers: { "User-Agent": "browser" } })), null);
});

// The harness is never deployed. The application and SQL execute inside
// workerd against real local D1/R2 bindings, with controllable dates/failures.
const bundled = await build({
  stdin: { contents: `
    import worker from './cloudflare/index.ts';
    import {recordUpdateUsage, pruneUpdateUsage} from './cloudflare/usage.ts';
    export default { async fetch(request, env, ctx) {
      const path = new URL(request.url).pathname;
      if (path === '/_test/record') {
        await recordUpdateUsage(await request.json(), env, new Date(request.headers.get('X-Test-Date')));
        return new Response('ok');
      }
      if (path === '/_test/prune') {
        await worker.scheduled({ scheduledTime: Date.parse(request.headers.get('X-Test-Date')) }, env, ctx);
        return new Response('ok');
      }
      if (request.headers.has('X-Test-DB-Error')) env = { ...env, USAGE_DB: {prepare() {throw new Error('database unavailable');}} };
      if (request.headers.has('X-Test-Rate-Limit')) env = { ...env, USAGE_BUDGET: {limit: async () => ({success:false})} };
      if (request.headers.has('X-Test-No-Binding')) env = { ...env, USAGE_DB: undefined };
      const pending = [];
      const response = await worker.fetch(request, env, {waitUntil: p => pending.push(p)});
      await Promise.all(pending);
      return response;
    }};
  `, resolveDir: process.cwd(), sourcefile: "usage-test-harness.ts", loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022",
});

test("real D1 deduplication, rolling windows, retention, and update failure isolation", async (t) => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundled.outputFiles[0].text, compatibilityDate: "2026-09-28",
    d1Databases: ["USAGE_DB"], r2Buckets: ["RELEASES"],
    ratelimits: { USAGE_BUDGET: {namespace_id: "1", simple: {limit:100, period:60}} },
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("USAGE_DB");
  const schema = (await readFile(new URL("../migrations/0001_update_usage.sql", import.meta.url), "utf8"))
    .replace(/--[^\n]*/g, "");
  for (const statement of schema.split(";").filter(part => part.trim())) await db.prepare(statement).run();
  const bucket = await mf.getR2Bucket("RELEASES");
  const release = {
    version: "0.6.1", build:11, releasedAt:"2026-09-28T00:00:00Z", minimumSystemVersion:"14.0",
    architecture:"arm64", sizeBytes:123, sha256:"a".repeat(64), signature:"A".repeat(86)+"==",
    automaticUpdates:true, notes:{en:["Update statistics"],zh:["更新统计"]},
    url:`https://downloads.khua.app/releases/0.6.1/11/${"a".repeat(64)}/Khua-0.6.1.dmg`,
  };
  const feedKey = `feeds/stable/${"b".repeat(64)}.xml`;
  const signedBytes = "<?xml version=\"1.0\"?>\n<!-- opaque signed feed bytes -->\n";
  await bucket.put("channels/stable.json", JSON.stringify({schemaVersion:1,channel:"stable",latestBuild:11,appcastKey:feedKey,releases:[release]}));
  await bucket.put(feedKey, signedBytes);
  const count = async () => Number(await db.prepare("SELECT COUNT(*) AS n FROM update_installations").first("n"));

  for (let i = 0; i < 3; i++) {
    const response = await mf.dispatchFetch(url, { headers });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), signedBytes);
    assert.match(response.headers.get("cache-control"), /no-store, no-transform/);
  }
  assert.equal(await count(), 1);
  const row = await db.prepare("SELECT * FROM update_installations").first();
  assert.match(row.installation_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(row).includes(id));
  assert.deepEqual(Object.keys(row).sort(), ["day", "installation_hash", "version"]);
  await mf.dispatchFetch(url, {headers:{...headers,"User-Agent":"Khua/0.6.2 Sparkle/2.9.6"}});
  assert.equal(await count(), 1);
  assert.equal(await db.prepare("SELECT version FROM update_installations").first("version"), "0.6.2");
  for (const extra of [{"X-Test-DB-Error":"1"},{"X-Test-Rate-Limit":"1"},{"X-Test-No-Binding":"1"}]) {
    const response = await mf.dispatchFetch(url.replace(id,secondID), {headers:{...headers,...extra}});
    assert.equal(response.status, 200);
    assert.equal(await response.text(), signedBytes);
    assert.equal(await count(), 1);
  }
  for (const input of [new Request(url,{method:"HEAD",headers}),new Request(url.split("?")[0],{headers})]) {
    assert.equal((await mf.dispatchFetch(input.url, {method:input.method, headers:Object.fromEntries(input.headers)})).status, 200);
    assert.equal(await count(), 1);
  }
  await bucket.delete(feedKey);
  assert.equal((await mf.dispatchFetch(url.replace(id,secondID), {headers})).status,503);
  assert.equal(await count(),1);

  // Reset this isolated in-memory test database, not any deployed resource.
  await db.prepare("DELETE FROM update_installations").run();
  const record = async (installation, date, version="0.6.1") => {
    const r=await mf.dispatchFetch("https://test/_test/record",{method:"POST",headers:{"X-Test-Date":date},body:JSON.stringify({installation,version})});
    assert.equal(r.status,200);
  };
  await record(id,"2026-09-01T23:59:59Z");
  await record(id,"2026-09-02T00:00:00Z");
  await record(id,"2026-09-30T01:00:00Z");
  await record(secondID,"2026-09-30T01:00:00Z");
  await record(id,"2026-10-01T00:00:00Z","0.6.2");
  const prune=async()=>assert.equal((await mf.dispatchFetch("https://test/_test/prune",{headers:{"X-Test-Date":"2026-10-01T00:15:00Z"}})).status,200);
  await prune(); await prune();
  assert.equal(await count(),4);
  assert.equal(await db.prepare("SELECT COUNT(DISTINCT installation_hash) AS n FROM update_installations").first("n"),2);
  assert.equal(await db.prepare("SELECT MIN(day) AS day FROM update_installations").first("day"),"2026-09-02");
  assert.equal(await db.prepare("SELECT installations FROM update_daily_totals WHERE day='2026-09-01'").first("installations"),1);
  assert.equal(await db.prepare("SELECT installations FROM update_daily_totals WHERE day='2026-09-30'").first("installations"),2);
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM update_daily_totals WHERE day='2026-10-01'").first("n"),0);

  const reportSQL = (await readFile(new URL("../scripts/usage-report.sql", import.meta.url), "utf8"))
    .replace(/--[^\n]*/g, "").replaceAll("date('now'", "date('2026-10-01'");
  const reports = [];
  for (const statement of reportSQL.split(";").filter(part => part.trim())) {
    reports.push((await db.prepare(statement).all()).results);
  }
  assert.deepEqual(reports[0].map(row => row.installations), [1, 2, 2]);
  assert.deepEqual(reports[1], [
    {day: "2026-09-30", installations: 2},
    {day: "2026-09-02", installations: 1},
    {day: "2026-09-01", installations: 1},
  ]);
  assert.deepEqual(reports[2].sort((a, b) => a.version.localeCompare(b.version)), [
    {version: "0.6.1", installations: 1}, {version: "0.6.2", installations: 1},
  ]);
});
