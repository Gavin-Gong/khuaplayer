import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { artifactKey, DOWNLOAD_ORIGIN, parseCatalog, parseRelease, renderAppcast } from "../cloudflare/catalog.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { values } = parseArgs({ options: {
  "release-dir": { type: "string" }, notes: { type: "string" }, out: { type: "string" },
  "previous-catalog": { type: "string" }, initial: { type: "boolean", default: false },
  legacy: { type: "boolean", default: false },
} });
for (const name of ["release-dir", "notes", "out"]) {
  if (!values[name]) throw new Error(`--${name} is required (paths are relative to the repository root)`);
}
const resolve = (value) => path.resolve(root, value);
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const config = JSON.parse(await readFile(path.join(root, "Distribution/sparkle.json"), "utf8"));
const tool = (name) => path.join(root, "ThirdParty/sparkle-min/bin", name);
const account = ["--account", config.keychainAccount];
if (run(tool("generate_keys"), [...account, "-p"]) !== config.publicKey) {
  throw new Error("Keychain public key does not match Distribution/sparkle.json");
}

const releaseDir = await realpath(resolve(values["release-dir"]));
const app = path.join(releaseDir, "Khua.app");
const info = JSON.parse(run("/usr/bin/plutil", ["-convert", "json", "-o", "-", path.join(app, "Contents/Info.plist")]));
const version = info.CFBundleShortVersionString;
const build = Number(info.CFBundleVersion);
if (!/^\d+\.\d+\.\d+$/.test(version) || !Number.isSafeInteger(build) || build <= 0) {
  throw new Error("Invalid app version/build");
}
if (info.CFBundleIdentifier !== "app.khuaplayer.KhuaPlayer") throw new Error("Unexpected app bundle identifier");
const configured = info.SUFeedURL === config.feedUrl && info.SUPublicEDKey === config.publicKey
  && info.SURequireSignedFeed === true && info.SUVerifyUpdateBeforeExtraction === true;
if (!configured && (!values.legacy || info.SUFeedURL || info.SUPublicEDKey)) {
  throw new Error("The app must embed the current update configuration; --legacy only accepts an inactive updater");
}
if (configured && values.legacy) throw new Error("Configured apps must not be marked legacy");
const dmg = path.join(releaseDir, `Khua-${version}.dmg`);
run(path.join(root, "Scripts/lib/verify_developer_id_dmg.sh"), [
  "--dmg", dmg, "--team-id", "5F6WB999FZ", "--bundle-id", info.CFBundleIdentifier, "--source-app", app,
]);
run("xcrun", ["stapler", "validate", "-q", dmg]);
run("/usr/sbin/spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=2", dmg]);
run("/usr/bin/syspolicy_check", ["distribution", app]);

let previous = null;
if (values.initial && values["previous-catalog"]) throw new Error("Choose --initial or --previous-catalog, not both");
if (values["previous-catalog"]) {
  previous = parseCatalog(JSON.parse(await readFile(resolve(values["previous-catalog"]), "utf8")));
} else if (!values.initial) {
  const response = await fetch("https://khua.app/api/releases.json", { signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot read the current catalog (${response.status}); only the first release uses --initial`);
  previous = parseCatalog(await response.json());
}
if (previous && build <= previous.latestBuild) throw new Error("The new build must be higher than every published build");
if (previous) {
  const current = previous.releases[0].version.split(".").map(Number);
  const next = version.split(".").map(Number);
  const changed = next.findIndex((part, i) => part !== current[i]);
  if (changed >= 0 && next[changed] < current[changed]) throw new Error("Rollback code, not public version numbers");
}

const bytes = await readFile(dmg);
const signature = run(tool("sign_update"), [...account, "-p", dmg]);
run(tool("sign_update"), [...account, "--verify", dmg, signature]);
const release = parseRelease({
  version, build, releasedAt: new Date().toISOString(), minimumSystemVersion: info.LSMinimumSystemVersion,
  architecture: "arm64", sizeBytes: (await stat(dmg)).size, sha256: sha(bytes), signature,
  automaticUpdates: configured, notes: JSON.parse(await readFile(resolve(values.notes), "utf8")),
  url: `${DOWNLOAD_ORIGIN}/${artifactKey({ version, build, sha256: sha(bytes) })}`,
});
const out = resolve(values.out);
const publishingRoot = path.join(root, ".build", "Publishing");
if (!out.startsWith(publishingRoot + path.sep)) throw new Error("Output must be inside .build/Publishing/");
await mkdir(path.dirname(out), { recursive: true });
await mkdir(out); // Never replace a previously prepared release.
const releases = [release, ...(previous?.releases ?? [])];
await copyFile(dmg, path.join(out, "download.dmg"));
const feedPath = path.join(out, "appcast.xml");
await writeFile(feedPath, renderAppcast(releases));
run(tool("sign_update"), [...account, feedPath]);
run(tool("sign_update"), [...account, "--verify", feedPath]);
const feedSha = sha(await readFile(feedPath));
const catalog = parseCatalog({ schemaVersion: 1, channel: "stable", latestBuild: build,
  appcastKey: `feeds/stable/${feedSha}.xml`, releases });
const catalogText = JSON.stringify(catalog, null, 2) + "\n";
await writeFile(path.join(out, "catalog.json"), catalogText);
await writeFile(path.join(out, "publication.json"), JSON.stringify({
  schemaVersion: 1, baseCatalogSHA256: previous ? sha(JSON.stringify(previous)) : null,
  artifactKey: artifactKey(release), artifactSHA256: release.sha256,
  feedKey: catalog.appcastKey, feedSHA256: feedSha, catalogSHA256: sha(catalogText),
}, null, 2) + "\n");
console.log(`Prepared ${version} (${build}) in ${out}. No remote changes have been made.`);
