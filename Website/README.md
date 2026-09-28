# Khua Website

The official bilingual landing page for Khua. It is intentionally isolated from the macOS app source so the website can be developed and deployed independently.

## Local development

```bash
npm install
npm run dev
```

The site defaults to English and includes a Simplified Chinese toggle.

## Download link

The default download destination is `/download`, which resolves the current
release from R2. `/releases` and the homepage version badge read the same
catalog. To override the download destination, set:

```bash
VITE_DOWNLOAD_URL=https://example.com/khua-download
```

## Verification

```bash
npm run build
npm run test:sites
npm run check:worker
npm run test:releases
```

The production client is emitted to `dist/client`. Signed app bundles, DMGs, and ZIP archives belong in the release workflow and should not be committed to this folder.

See [Cloudflare deployment and publishing](DEPLOYMENT.md) for `khua.app`, R2,
signed appcasts, staging, and production promotion. `npm run dev:cloudflare`
serves the full Worker locally after a build; Vite alone previews the design
but does not provide the R2-backed release API.
