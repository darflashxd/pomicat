# Deploying the Blackline relay to Cloudflare

Production Blackline config: `relay/wrangler.blackline.toml`. From `relay/`, use
`npx wrangler@4 deploy --config wrangler.blackline.toml --name blackline-relay`.
It shares the existing D1 and rate-limit namespaces, runs the Worker before
static assets for security headers, and adds no cleanup cron. `wrangler.toml`
still targets the legacy SafeShare Worker: do not use it for a Blackline deploy.

Previously SafeShare. Existing Worker/D1 names, URLs and configuration keys below
stay unchanged for compatibility. Rebranding the extension does not deploy this
Worker or move existing shares. Do not recreate the database for the rename.

The relay is a Cloudflare Worker. It stores encrypted shares in a D1 database and serves the page
that opens share links. Its API receives ciphertext: the decryption key is in the link's `#`
part, which browsers do not include in HTTP requests. Hosted decryption still trusts the host's
served code; a modified hosted viewer could read that fragment and plaintext.

## Existing relay compatibility and rollback

The Blackline and legacy SafeShare Workers share the existing D1 database and rate-limiter
namespaces. No data copy is needed. Limits are approximate per-location counters, not global quotas.
Keep cleanup cron on the legacy Worker; the Blackline config deliberately adds no duplicate cron.

Keep both hosts permitted while older links circulate. A rollback changes client defaults or
deploys reviewed code; do not restore an old database snapshot, which could resurrect burned or
revoked shares. Do not delete an endpoint that existing links still use. Updating Git does not
deploy either Worker. Decryption inside the extension and hosted fallback have different trust models.

Everything below fits in Cloudflare's free plan. It takes about 15 minutes the first time.

## What you need

- A Cloudflare account (free)
- Node.js 18 or newer (`node --version`)
- This repository: `git clone https://github.com/darflashxd/safeshare && cd safeshare/relay`

All commands below run inside the `relay/` folder. They target the Blackline config explicitly;
use the legacy config only when deliberately updating the legacy Worker.

## 1. Log in

```bash
npx wrangler@4 login
```

A browser tab opens; approve access. Check with `npx wrangler@4 whoami`.

## 2. Create the database (first deploy only)

Skip this step if `safeshare-db` already exists in your account (it's listed by
`npx wrangler@4 d1 list`).

```bash
npx wrangler@4 d1 create safeshare-db
```

It prints a `database_id`. Open `wrangler.blackline.toml` and replace the existing `database_id` under
`[[d1_databases]]` with yours. Then create the table:

```bash
npx wrangler@4 d1 execute safeshare-db --remote --file schema.sql
```

### Upgrading a relay that was deployed before October 2026

Older versions had no revoke token. Add the column **before** deploying the new code, or every
upload will fail:

```bash
npx wrangler@4 d1 execute safeshare-db --remote --command "ALTER TABLE shares ADD COLUMN revoke_hash TEXT;"
```

If it says the column already exists, that's fine.

## 3. Deploy

```bash
npx wrangler@4 deploy --config wrangler.blackline.toml
```

The output ends with your URL, for example `https://safeshare-relay.<your-subdomain>.workers.dev`,
and lists these bindings:

| Binding | What it does |
|---|---|
| `DB` | the D1 database with the encrypted shares |
| `UPLOAD_LIMITER` | max 10 new shares per minute per IP address |
| `READ_LIMITER` | max 60 link opens per minute per IP address |
| `ASSETS` | the share-link page (`extension/viewer/`) |
| legacy Worker cron `17 3 * * *` | deletes expired shares once a day; do not duplicate on the new Worker |

Shares are limited to 512 KiB ciphertext. Larger DOCX copies must be downloaded instead.

## 4. Check it works

From the repository root:

```bash
node bin/safeshare.js share examples/chat_original.txt --burn --relay https://safeshare-relay.<your-subdomain>.workers.dev
```

- Open the printed link: you should see the redacted chat.
- Reload it: it should say the link expired (burn after reading).
- Run the printed `curl … /api/revoke/…` command on a non-burn link: it should answer `revoked`.

## 5. Point the extension at your relay

If your URL is different from the official relay hosts, change the
default in `extension/engine/crypto.js`:

```js
relayBaseUrl = "https://safeshare-relay.<your-subdomain>.workers.dev",
viewerBaseUrl = "https://safeshare-relay.<your-subdomain>.workers.dev"
```

The extension only runs on, and only talks to, the relay it knows (so no other `workers.dev` site
can talk to it). Replace `safeshare-relay.bleedguard.workers.dev` with your host in the same three
places too:

- `extension/relay_hosts.js`: default/allowed origins
- `extension/manifest.json` and `extension/manifest.firefox.json`: `host_permissions`,
  `content_scripts.matches` and extension-page CSP `connect-src`
- `extension/content_script.js`: `VIEWER_ORIGINS`
- `extension/word/publish.js`: fallback default if the shared host module is unavailable

Then rebuild the extension zips with `python tools/build_extension.py`.

For a quick test without rebuilding (upload only; the Continue button on the share page needs the
changes above), override it in the extension: on `chrome://extensions`, click
**service worker** under SafeShare and run
`chrome.storage.local.set({ safeshare_relay: "https://safeshare-relay.<your-subdomain>.workers.dev" })`.

## Updating later

`git pull`, then `npx wrangler@4 deploy --config wrangler.blackline.toml` from `relay/`. Check the changelog for any database
step (like the `ALTER TABLE` above) before deploying.

If a release adds a relay host to `extension/manifest.json`, also reload the unpacked extension
in `chrome://extensions` and approve the new host. Chrome withholds new host permissions from an
already-loaded extension; until it is reloaded, uploads fail with `RELOAD_REQUIRED` and relay
links fall back to the web viewer.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Uploads fail with `table shares has no column named revoke_hash` | run the `ALTER TABLE` command in step 2 |
| `Authentication error` | `npx wrangler@4 login` again |
| `429 Too many requests` | wait a minute; the limits are in `wrangler.toml` under `[[ratelimits]]` |
| Link page loads but says not found | the share expired, was burned, or was revoked |
| Link opens blank after an extension update | reload the unpacked extension and approve the relay host |
| Word says `Reload required` | reload the extension; the new relay host was not granted yet |
| See live errors | `npx wrangler@4 tail` while you reproduce the problem |
