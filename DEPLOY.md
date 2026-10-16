# Deploying the SafeShare relay to Cloudflare

The relay is a Cloudflare Worker. It stores encrypted shares in a D1 database and serves the page
that opens share links. It only ever sees ciphertext: the decryption key is in the link's `#`
part, which browsers never send to the server.

Everything below fits in Cloudflare's free plan. It takes about 15 minutes the first time.

## What you need

- A Cloudflare account (free)
- Node.js 18 or newer (`node --version`)
- This repository: `git clone https://github.com/darflashxd/safeshare && cd safeshare/relay`

All commands below run inside the `relay/` folder.

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

It prints a `database_id`. Open `wrangler.toml` and replace the existing `database_id` under
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
npx wrangler@4 deploy
```

The output ends with your URL, for example `https://safeshare-relay.<your-subdomain>.workers.dev`,
and lists these bindings:

| Binding | What it does |
|---|---|
| `DB` | the D1 database with the encrypted shares |
| `UPLOAD_LIMITER` | max 10 new shares per minute per IP address |
| `READ_LIMITER` | max 60 link opens per minute per IP address |
| `ASSETS` | the share-link page (`viewer/`) |
| cron `17 3 * * *` | deletes expired shares once a day |

Shares are limited to 512 KB, which is plenty for a chat but useless for hosting files.

## 4. Check it works

From the repository root:

```bash
node bin/safeshare.js share examples/chat_original.txt --burn --relay https://safeshare-relay.<your-subdomain>.workers.dev
```

- Open the printed link: you should see the redacted chat.
- Reload it: it should say the link expired (burn after reading).
- Run the printed `curl … /api/revoke/…` command on a non-burn link: it should answer `revoked`.

## 5. Point the extension at your relay

If your URL is different from `https://safeshare-relay.bleedguard.workers.dev`, change the one
default in `extension/engine/crypto.js`:

```js
relayBaseUrl = "https://safeshare-relay.<your-subdomain>.workers.dev",
viewerBaseUrl = "https://safeshare-relay.<your-subdomain>.workers.dev"
```

The extension only runs on, and only talks to, the relay it knows (so no other `workers.dev` site
can talk to it). Replace `safeshare-relay.bleedguard.workers.dev` with your host in the same three
places too:

- `extension/manifest.json` and `extension/manifest.firefox.json`: `host_permissions` and
  `content_scripts.matches`
- `extension/content_script.js`: `VIEWER_ORIGINS`

Then rebuild the extension zips with `python tools/build_extension.py`.

For a quick test without rebuilding (upload only; the Continue button on the share page needs the
changes above), override it in the extension: on `chrome://extensions`, click
**service worker** under SafeShare and run
`chrome.storage.local.set({ safeshare_relay: "https://safeshare-relay.<your-subdomain>.workers.dev" })`.

## Updating later

`git pull`, then `npx wrangler@4 deploy` from `relay/`. Check the changelog for any database
step (like the `ALTER TABLE` above) before deploying.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Uploads fail with `table shares has no column named revoke_hash` | run the `ALTER TABLE` command in step 2 |
| `Authentication error` | `npx wrangler@4 login` again |
| `429 Too many requests` | wait a minute; the limits are in `wrangler.toml` under `[[ratelimits]]` |
| Link page loads but says not found | the share expired, was burned, or was revoked |
| See live errors | `npx wrangler@4 tail` while you reproduce the problem |
