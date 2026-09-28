import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseCatalog } from "../cloudflare/catalog.ts";

const { values } = parseArgs({ options: { origin: { type: "string", default: "https://khua.app" } } });
const root = fileURLToPath(new URL("../../", import.meta.url));
const config = JSON.parse(await readFile(path.join(root, "Distribution/sparkle.json"), "utf8"));
const origin = new URL(values.origin).origin;
if (!origin.startsWith("https://")) throw new Error("Use an HTTPS deployment for this check");
const request = (url, init = {}) => fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60000), ...init });
const response = await request(`${origin}/api/releases.json`);
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type"), /application\/json/);
assert.match(response.headers.get("cache-control"), /no-store/);
const catalog = parseCatalog(await response.json());
const redirect = await request(`${origin}/download`);
assert.equal(redirect.status, 302);
assert.equal(redirect.headers.get("location"), catalog.releases[0].url);
assert.match(redirect.headers.get("cache-control"), /no-store/);
const publicKey = createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(config.publicKey, "base64")]),
  format: "der", type: "spki",
});
for (const release of catalog.releases) {
  assert.ok(release.sizeBytes < 256 * 1024 * 1024, "Verifier's explicit download limit exceeded");
  const download = await request(release.url);
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type"), /application\/x-apple-diskimage/);
  const chunks = [];
  let size = 0;
  for await (const chunk of download.body) {
    size += chunk.length;
    assert.ok(size <= release.sizeBytes, "Download larger than the catalog declared");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(size, release.sizeBytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), release.sha256);
  assert.ok(verify(null, bytes, publicKey, Buffer.from(release.signature, "base64")), "DMG signature rejected");
  const range = await request(release.url, { headers: { Range: "bytes=0-1023" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), `bytes 0-1023/${release.sizeBytes}`);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 1024));
  console.log(`Verified public download, Ed25519 signature, and ranges: ${release.version} (${release.build})`);
}
const feed = await request(`${origin}/updates/appcast.xml`);
assert.equal(feed.status, 200);
assert.match(feed.headers.get("content-type"), /application\/rss\+xml/);
assert.match(feed.headers.get("cache-control"), /no-transform/);
const feedBytes = Buffer.from(await feed.arrayBuffer());
assert.equal(`feeds/stable/${createHash("sha256").update(feedBytes).digest("hex")}.xml`, catalog.appcastKey);
const dir = await mkdtemp(path.join(root, ".build/Publishing/live-check-"));
const feedPath = path.join(dir, "appcast.xml");
await writeFile(feedPath, feedBytes);
const signer = path.join(root, "ThirdParty/sparkle-min/bin/sign_update");
execFileSync(signer, ["--account", config.keychainAccount, "--verify", feedPath], { stdio: "inherit" });
const alteredPath = path.join(dir, "altered-appcast.xml");
await writeFile(alteredPath, feedBytes.toString().replace("Khua Player updates", "Khua Player tampered"));
assert.throws(() => execFileSync(signer, ["--account", config.keychainAccount, "--verify", alteredPath], { stdio: "pipe" }), "A tampered feed must be rejected");
for (const route of ["/", "/releases", "/privacy.txt", "/license.txt"]) {
  assert.equal((await request(`${origin}${route}`)).status, 200, route);
}
assert.equal((await request(`${origin}/api/not-found`, { headers: { accept: "text/html" } })).status, 404);
assert.equal((await request(`${origin}/download`, { method: "POST" })).status, 405);
console.log(`Verified feed integrity, tampering rejection, and endpoint behavior: ${origin}`);
