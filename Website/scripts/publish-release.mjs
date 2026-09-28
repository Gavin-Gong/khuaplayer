import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { artifactKey, CATALOG_KEY, parseCatalog } from "../cloudflare/catalog.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const site = path.join(root, "Website");
const { values } = parseArgs({ options: { bundle: { type: "string" }, environment: { type: "string" } } });
if (!values.bundle || !["staging", "production"].includes(values.environment)) {
  throw new Error("Usage: --bundle .build/Publishing/VERSION-BUILD --environment staging|production");
}
const bundle = path.resolve(root, values.bundle);
const env = values.environment;
const metadataBucket = env === "production" ? "khua-releases" : "khua-releases-staging";
const config = JSON.parse(await readFile(path.join(root, "Distribution/sparkle.json"), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const publication = JSON.parse(await readFile(path.join(bundle, "publication.json"), "utf8"));
const catalogBytes = await readFile(path.join(bundle, "catalog.json"));
const catalog = parseCatalog(JSON.parse(catalogBytes));
const release = catalog.releases[0];
const feedBytes = await readFile(path.join(bundle, "appcast.xml"));
const downloadBytes = await readFile(path.join(bundle, "download.dmg"));
if (publication.schemaVersion !== 1 || sha(catalogBytes) !== publication.catalogSHA256
    || sha(feedBytes) !== publication.feedSHA256 || sha(downloadBytes) !== release.sha256
    || publication.artifactSHA256 !== release.sha256 || downloadBytes.length !== release.sizeBytes
    || publication.artifactKey !== artifactKey(release) || publication.feedKey !== catalog.appcastKey
    || catalog.appcastKey !== `feeds/stable/${sha(feedBytes)}.xml`) {
  throw new Error("Prepared release was modified or is inconsistent");
}
const signer = path.join(root, "ThirdParty/sparkle-min/bin/sign_update");
for (const args of [[path.join(bundle, "download.dmg"), release.signature], [path.join(bundle, "appcast.xml")]]) {
  execFileSync(signer, ["--account", config.keychainAccount, "--verify", ...args], { stdio: "inherit" });
}
const wrangler = path.join(site, "node_modules/wrangler/bin/wrangler.js");
const wrangle = (args) => execFileSync(process.execPath, [wrangler, ...args, "--env", env], {
  cwd: site, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, CI: "true" },
});
wrangle(["whoami"]);
const temp = await mkdtemp(path.join(os.tmpdir(), "khua-publish-"));
let sequence = 0;
async function get(bucket, key) {
  const file = path.join(temp, String(sequence++));
  try {
    wrangle(["r2", "object", "get", `${bucket}/${key}`, "--remote", "--file", file]);
    return await readFile(file);
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (/specified key does not exist|object does not exist|NoSuchKey/i.test(output)) return null;
    throw new Error(`R2 read failed for ${bucket}/${key}: ${output}`);
  }
}
async function immutable(bucket, key, file, expectedHash, contentType) {
  const existing = await get(bucket, key);
  if (existing) {
    if (sha(existing) !== expectedHash) throw new Error(`Refusing to overwrite ${key}`);
    console.log(`Already verified: ${key}`);
    return;
  }
  wrangle(["r2", "object", "put", `${bucket}/${key}`, "--remote", "--file", file,
    "--content-type", contentType, "--cache-control", "public, max-age=31536000, immutable"]);
  const uploaded = await get(bucket, key);
  if (!uploaded || sha(uploaded) !== expectedHash) throw new Error(`Upload verification failed: ${key}`);
  console.log(`Uploaded and verified: ${key}`);
}
const canonicalHash = (bytes) => bytes ? sha(JSON.stringify(parseCatalog(JSON.parse(bytes)))) : null;
const lockPath = path.join(root, ".build/Publishing/publish.lock");
const lock = await open(lockPath, "wx");
try {
  const before = await get(metadataBucket, CATALOG_KEY);
  if (before && sha(before) === sha(catalogBytes)) {
    console.log("This exact catalog is already published.");
    process.exitCode = 0;
  } else {
    if (canonicalHash(before) !== publication.baseCatalogSHA256) {
      throw new Error("The channel changed since preparation. Re-prepare against its current catalog.");
    }
    if (before && parseCatalog(JSON.parse(before)).latestBuild >= release.build) {
      throw new Error("Refusing to downgrade the published channel");
    }
    // Both environments test the exact immutable public download. Staging only
    // promotes its isolated catalog/feed and never changes the production pointer.
    await immutable("khua-releases", publication.artifactKey, path.join(bundle, "download.dmg"), release.sha256, "application/x-apple-diskimage");
    const response = await fetch(release.url, { redirect: "error", signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw new Error(`Public download is unavailable (${response.status})`);
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > release.sizeBytes) throw new Error("Public download exceeds expected size");
      hash.update(chunk);
    }
    if (size !== release.sizeBytes || hash.digest("hex") !== release.sha256) throw new Error("Public download checksum mismatch");
    await immutable(metadataBucket, catalog.appcastKey, path.join(bundle, "appcast.xml"), publication.feedSHA256, "application/rss+xml; charset=utf-8");
    await immutable(metadataBucket, `catalogs/${publication.catalogSHA256}.json`, path.join(bundle, "catalog.json"), publication.catalogSHA256, "application/json; charset=utf-8");
    const current = await get(metadataBucket, CATALOG_KEY);
    if (canonicalHash(current) !== canonicalHash(before)) throw new Error("Concurrent publication detected; channel was not changed");
    // This is the only mutable object. Publish it last, after every referenced
    // object and the external download have passed verification.
    wrangle(["r2", "object", "put", `${metadataBucket}/${CATALOG_KEY}`, "--remote", "--file", path.join(bundle, "catalog.json"),
      "--content-type", "application/json; charset=utf-8", "--cache-control", "no-store"]);
    const after = await get(metadataBucket, CATALOG_KEY);
    if (!after || sha(after) !== sha(catalogBytes)) throw new Error("Published pointer verification failed");
    console.log(`Published ${release.version} (${release.build}) to ${env}.`);
  }
} finally {
  await lock.close();
  await unlink(lockPath);
}
