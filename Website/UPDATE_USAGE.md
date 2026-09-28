# Update-check installation statistics

This measures unique installations that successfully check the official
Sparkle feed, not people, sessions, watch time, all app launches, or true
playback DAU/MAU. It starts with 0.6.1 (11); older clients are not backfilled.
Short sessions, offline users, disabled automatic checks, rate limiting, and
failed checks can be missed. A reset installation token can overcount; cloned
preferences can undercount. Treat requests as untrusted, not billing evidence.

## Contract

- No new app controls, consent prompts, SDKs, or heartbeat requests.
- Automatic checks stay enabled by default, with Sparkle's existing cadence.
  Manual checks send the same fields. Switching automatic checks off stops
  automatic requests, not user-initiated requests.
- The app lazily creates a UUID in local preferences and attaches `khua_usage`
  and format version `khua_usage_v=1` only to the exact official HTTPS feed.
  The version is read from Sparkle's existing `Khua/<version> Sparkle/<version>`
  User-Agent. No hardware-derived identifier is used.
- Only successful GET appcasts with valid fields are counted. HEAD, old clients,
  unrelated routes, malformed input, and feed errors do not create rows.
- D1 primary key `(day, installation_hash)` counts once per UTC date, even when
  the app updates that day. The row retains the last observed app version.
- Seven/thirty-day totals use `COUNT(DISTINCT installation_hash)`, not a sum of
  daily counts. Today's count is partial. Version distribution uses each
  installation's most recent observed version in the selected window.
- The server stores a domain-separated SHA-256 hash, UTC date, and app version.
  No raw tokens, IPs, exact times, full headers, files, or playback events.
- `ctx.waitUntil` keeps statistics outside the response's critical path.
  Database failures and the per-location rate-limit budget drop measurements,
  never block updates or change the original signed feed bytes.

## Deployment

Production D1 is `khua-update-usage`; staging D1 is
`khua-update-usage-staging`. They are isolated from each other and from local
tests. Database IDs are binding identifiers, not credentials. Apply migrations
before deploying the corresponding Worker:

```sh
npm ci
npm run check:worker
npm run test:releases
npm run test:usage
npx wrangler d1 migrations apply USAGE_DB --env staging --remote
npm run deploy:staging
# Exercise duplicate synthetic IDs in staging only; verify unchanged feed bytes.
npx wrangler d1 migrations apply USAGE_DB --env production --remote
npm run deploy:production
```

Statistics are private. There is no public dashboard or statistics API. From
`Website/`, run `npm run usage:report` with authorized Cloudflare credentials,
or use the D1 dashboard with `scripts/usage-report.sql`. This prints only
aggregate counts. Keep credentials out of the repository and browser code.

## Retention and operations

The `00:15 UTC` daily scheduled handler finalizes closed-day aggregate totals,
then deletes installation rows older than the last 30 UTC dates in one D1
transaction. Reruns are idempotent. Aggregates contain only dates and counts.
Check `update_usage_retention_complete` / `update_usage_retention_failed` in
Workers logs; a failed job must be rerun before restoring normal retention.
After a backup restore, rerun retention before using the restored database.
Cloudflare Time Travel backups have their own provider-managed retention.

Application logs must never contain tokens, query strings, full headers, or
SQL error details. Wrangler disables automatic invocation logs and traces and
enables query-string redaction. Do not enable request Logpush or a Tail Worker
that captures token-bearing URLs without a separate data-handling review.
The rate-limit binding is a per-location database load guard, not an exact
global spending limit and not bot authentication. Watch D1 usage and dropped
write error events before expanding volume or interpreting counts as complete.

To stop server-side collection, deploy the Worker without its `USAGE_DB`
binding (retain the database pending a reviewed retention/deletion decision).
The handler fails open for updates and skips statistics. No app re-release is
required to stop ingestion. Website and download analytics are separate and
are not enabled by this change.
