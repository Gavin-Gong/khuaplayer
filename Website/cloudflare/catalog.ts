export const CATALOG_KEY = "channels/stable.json";
export const DOWNLOAD_ORIGIN = "https://downloads.khua.app";

export type Release = {
  version: string;
  build: number;
  releasedAt: string;
  minimumSystemVersion: string;
  architecture: "arm64";
  url: string;
  sizeBytes: number;
  sha256: string;
  signature: string;
  automaticUpdates: boolean;
  notes: { en: string[]; zh: string[] };
};

export type Catalog = {
  schemaVersion: 1;
  channel: "stable";
  latestBuild: number;
  appcastKey: string;
  releases: Release[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Expected an object");
  }
  return value;
}

function string(value: unknown, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length > 4096 || (pattern && !pattern.test(value))) {
    throw new Error("Invalid release string");
  }
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Expected a positive integer");
  }
  return value;
}

function notes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
    throw new Error("Release notes are required");
  }
  return value.map((line: unknown) => string(line, /\S/));
}

export function artifactKey(release: Pick<Release, "version" | "build" | "sha256">): string {
  return `releases/${release.version}/${release.build}/${release.sha256}/Khua-${release.version}.dmg`;
}

export function parseRelease(value: unknown): Release {
  const r = record(value);
  const n = record(r.notes);
  const version = string(r.version, /^\d+\.\d+\.\d+$/);
  const build = positiveInteger(r.build);
  const sha256 = string(r.sha256, /^[a-f0-9]{64}$/);
  const url = string(r.url);
  if (url !== `${DOWNLOAD_ORIGIN}/${artifactKey({ version, build, sha256 })}`) {
    throw new Error("Download URL must match the immutable Khua artifact path");
  }
  if (r.architecture !== "arm64" || typeof r.automaticUpdates !== "boolean") {
    throw new Error("Unsupported release configuration");
  }
  const releasedAt = string(r.releasedAt);
  if (!Number.isFinite(Date.parse(releasedAt))) throw new Error("Invalid release date");
  return {
    version, build, sha256, url, releasedAt,
    minimumSystemVersion: string(r.minimumSystemVersion, /^\d+(\.\d+){0,2}$/),
    architecture: r.architecture,
    sizeBytes: positiveInteger(r.sizeBytes),
    signature: string(r.signature, /^[A-Za-z0-9+/]{86}==$/),
    automaticUpdates: r.automaticUpdates,
    notes: { en: notes(n.en), zh: notes(n.zh) },
  };
}

export function parseCatalog(value: unknown): Catalog {
  const c = record(value);
  if (c.schemaVersion !== 1 || c.channel !== "stable" || !Array.isArray(c.releases)
      || c.releases.length === 0 || c.releases.length > 200) {
    throw new Error("Invalid release catalog");
  }
  const releases = c.releases.map(parseRelease);
  if (releases.some((r, i) => i > 0 && r.build >= releases[i - 1].build)) {
    throw new Error("Builds must be unique and strictly descending");
  }
  const latestBuild = positiveInteger(c.latestBuild);
  if (latestBuild !== releases[0].build) throw new Error("Latest build must lead the catalog");
  return {
    schemaVersion: 1, channel: "stable", latestBuild, releases,
    appcastKey: string(c.appcastKey, /^feeds\/stable\/[a-f0-9]{64}\.xml$/),
  };
}

function xml(value: string | number): string {
  return String(value).replace(/[<>&"']/g, (char) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
  })[char] ?? char);
}

// Only update-enabled builds can be offered by Sparkle. Legacy downloads stay
// in the website history without ever removing updater support from an app.
export function renderAppcast(releases: Release[]): string {
  const items = releases.filter((r) => r.automaticUpdates).map((r) => `    <item>
      <title>Khua Player ${xml(r.version)}</title>
      <link>https://khua.app/releases</link>
      <pubDate>${xml(new Date(r.releasedAt).toUTCString())}</pubDate>
      <sparkle:version>${r.build}</sparkle:version>
      <sparkle:shortVersionString>${xml(r.version)}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>${xml(r.minimumSystemVersion)}</sparkle:minimumSystemVersion>
      <sparkle:hardwareRequirements>arm64</sparkle:hardwareRequirements>
      <description>${xml(r.notes.en.join("\n"))}</description>
      <enclosure url="${xml(r.url)}" length="${r.sizeBytes}" type="application/octet-stream" sparkle:edSignature="${xml(r.signature)}" />
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Khua Player updates</title>
    <link>https://khua.app</link>
    <description>Signed stable updates for Khua Player.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
}
