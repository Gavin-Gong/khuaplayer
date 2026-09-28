# Website and direct-download publishing

## Services

- `https://khua.app`: Workers Static Assets, worker `khua-web`.
- `https://khua.app/releases`: bilingual release history.
- `https://khua.app/download`: uncached redirect to the current verified DMG.
- `https://khua.app/api/releases.json`: current version and release history.
- `https://khua.app/updates/appcast.xml`: the signed Sparkle stable feed.
- `https://downloads.khua.app`: custom domain on the `khua-releases` R2 bucket.
- `khua-web-staging`: workers.dev preview, with isolated metadata in
  `khua-releases-staging`. Staging intentionally tests the exact public,
  content-addressed downloads; it cannot promote the production channel.

The website's original Sites packaging remains intact. Cloudflare uses the
separate `cloudflare/index.ts` entry point. Downloads and signed feeds use R2;
limited update-check installation statistics use an isolated D1 binding.
There is no persistent server, and no account token is shipped to browsers.
See [update-check statistics](UPDATE_USAGE.md) for migrations, retention, and
private aggregate reports. This does not enable website or download analytics.

## Website deployment

Run from `Website/` with Node 22.18+ or Node 24 LTS:

```sh
npm ci
npx wrangler whoami
npm run build
npm run check:worker
npm run test:sites
npm run test:releases
npm run test:usage
npx wrangler d1 migrations apply USAGE_DB --env staging --remote
npx wrangler deploy --env staging --dry-run
npx wrangler deploy --env staging
# Inspect the staging site, downloads, JSON, signed feed, and language toggle.
npx wrangler d1 migrations apply USAGE_DB --env production --remote
npx wrangler deploy --env production
```

`wrangler.jsonc` owns the domain, bindings, compatibility date, and caching
boundary. Only `dist/client` is public, never repository notes, source maps,
signing materials, or `.build`. Privacy and license text are copied into that
directory at build time, so these links work even before GitHub is public.
Do not change repository visibility as part of website deployment.
The repository is currently private. Source links are hidden and the source
section says the public release is being prepared. After verifying anonymous
GitHub access, build with `VITE_SOURCE_PUBLIC=true` to restore the original
source links and copy; no redesign or repository visibility mutation is needed.

## Prepare a release

First finish every Developer ID, notarization, and stapling step in the root
`RELEASING.md`. Preserve the app, final DMG, dSYMs, and notarization records.
Never edit a signed app or DMG to change its version or update configuration.

The public Sparkle key and canonical feed URL are in
`Distribution/sparkle.json`. The private key is stored in the macOS Keychain
under that file's `keychainAccount`. Keep a secure backup outside Git; losing
the key can prevent existing installations from accepting future releases.
Never put the private key in frontend environment variables or Wrangler vars.

Write release notes in `Distribution/notes/<version>.json` with `en` and `zh`
arrays. Version, build, minimum macOS, size, hashes, and signatures come from
the verified artifact, not from those notes. For example, from `Website/`:

```sh
npm run release:prepare -- \
  --release-dir .build/DeveloperID/Khua-0.6.0-10 \
  --notes Distribution/notes/0.6.0.json \
  --out .build/Publishing/0.6.0-10
```

All script paths are relative to the repository root. The output directory
must be new. Preparation makes no remote changes and reads the existing
production catalog by default. For the first publication only, pass `--initial`.
For a staged batch, `--previous-catalog .build/Publishing/<previous>/catalog.json`
uses an explicitly prepared predecessor. `--legacy` imports a verified older
download without updater configuration; it is never offered in Sparkle.

Preparation checks the inner app and DMG, Developer ID team/bundle identity,
stapled tickets, Gatekeeper, standalone distribution policy, update configuration,
and the Keychain public key. It signs the final DMG bytes and the appcast, then
verifies both signatures. Only public, allowlisted metadata enters the catalog.
Artifacts and generated catalogs remain ignored under `.build/Publishing`.

## Publish and promote

Use one publishing operator/job at a time. A local exclusive lock prevents
concurrent runs on this Mac; the script also detects stale catalog snapshots.
This is not a distributed lock: do not run publication concurrently on another
machine. Future CI should use one non-cancelling release concurrency group.

```sh
npm run release:publish -- --bundle .build/Publishing/0.6.0-10 --environment staging
# Verify the staging endpoints and app update behavior.
npm run release:publish -- --bundle .build/Publishing/0.6.0-10 --environment production
```

For a batch, publish each predecessor in order in both environments.
The same prepared bundle is used for staging and production. Publishing:

1. Re-verifies prepared file hashes and Sparkle signatures.
2. Checks that the channel still matches the preparation's base catalog.
3. Uploads the DMG to a version/build/SHA-256-addressed path. Existing bytes
   must match; changed binaries never reuse the same URL.
4. Downloads it through the public HTTPS domain and checks its size and SHA-256.
5. Uploads and verifies the immutable signed feed and catalog snapshot.
6. Switches `channels/stable.json` last, then verifies it again.

The Worker reads that one pointer for the website, download redirect, and
feed. It serves the feed bytes unchanged. Mutable endpoints are `no-store,
no-transform`; immutable objects have a one-year cache lifetime. Missing or
malformed releases fail closed, not as HTML or an unverified download.

A failed run before promotion may leave harmless unreferenced immutable
objects. Re-running the same prepared bundle safely resumes. Do not upload
entire release directories: submission archives, dSYMs, logs, or private
records must never enter the public bucket.

## Validation and limits

Check HTTPS status/content types, redirect target, full-download SHA-256,
byte-range support, signed appcast verification, and the app's Check for Updates
menu. Test a real older-update-enabled build upgrading to the next build on a
separate Mac/VM before claiming the complete installation path is validated.
Run `npm run release:verify` against production, or pass
`-- --origin https://<staging-worker>.workers.dev` for staging. This checks all
listed DMGs, Ed25519 signatures using the public key, byte-range downloads,
feed integrity, rejection of a tampered feed, and endpoint behavior.
The original 0.5.1 (9) cannot perform that test because its updater is inactive.
App Store builds remain independent and exclude Sparkle.

Do not decrease published version/build numbers or replace published artifacts.
Roll back code by publishing a higher version/build. Website-only deployments
may be rolled back separately using Cloudflare's deployment history without
changing the release catalog.

GitHub source commits/tags, GitHub Releases, and unattended CI publication are
separate steps; these scripts do not push, publish source, or alter visibility.
Use environment-scoped, least-privilege Cloudflare credentials for future CI,
not the local OAuth token. Apple signing and notarization run on macOS, not in
Workers. A GitHub Release can link to the same immutable R2 artifact.
