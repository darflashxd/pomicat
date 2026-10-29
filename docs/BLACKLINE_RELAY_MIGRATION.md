# Blackline relay migration — 28 October 2026

New endpoint: https://blackline-relay.bleedguard.workers.dev

## Deployment

- New config: relay/wrangler.blackline.toml. Account verified with Wrangler OAuth.
- Current Blackline version: 00371dd9-6d3c-4ed7-9398-032ef75cb7f0.
- Existing safeshare-relay remains on 9d020d63-e319-4735-8e4b-6dd04c3e68ec.
  It was not redeployed, renamed or deleted.
- DB binding uses the same safeshare-db UUID. Read-only PRAGMA verified id primary
  key and ciphertext/expiry/burn/view_count/revoke_hash columns with zero rows read
  or written. No schema migration, database recreation or data copy was performed.
- Rate limiter namespaces remain 1001/1002. Counters are approximate and local to
  Cloudflare locations, not a strict global quota. No extra cron on the new Worker.
- Worker-first asset routing adds CSP, no-store, no-referrer and nosniff on root,
  scripts, CSS and share routes. Preview URLs are disabled in the new config.

## Live synthetic checks

MCP Playwright without the Blackline extension:
- Five routes checked: /, /app.js, /style.css, /v/<synthetic UUID>, /v/app.js.
  All returned 200 with the required security headers.
- A small encrypted fictional chat opened through the real click gate and showed
  Blackline. The same share decrypted via the old host, was revoked there, and
  returned 404 on the new host afterward.
- Concurrent burn retrieval, one request per host: exactly one 200 and one 404.
- Generated 1,089-byte DOCX v4: recipient preview and downloaded bytes matched;
  test document revoked after checking. No real chat or document was uploaded.
- Test chat shares were revoked (or burned); no bulk SQL cleanup was used.

Scripts: tools/smoke_blackline_cloud_mcp.js and tools/smoke_blackline_doc_mcp.js.
They are opt-in public smoke tests, not CI jobs; they create tiny synthetic shares.

Final local checks: 64/64 Node test files passed. HR delayed-model, DOCX privacy,
Word review and brand/storage restart checks passed in Chromium and Firefox as
applicable. Extracted Chrome ZIP was used for Word/brand checks in both engines;
actual extension restart/storage check used Chromium. Both package manifests,
bundled source/model bytes and local SHA256SUMS were verified. These checks do
not establish signed Firefox installation or live Word tenant compatibility.

## Client cutover and rollback

Both hostnames are permitted explicitly in manifests, CSP and background checks.
Chat and Word publish default to Blackline. Existing safeshare_relay overrides,
revocation records, encrypted originals and extension IDs are unchanged.
Viewer crypto format is unchanged; only the encrypting client's default URL changed.

Rollback means pointing defaults back to the old host while retaining both-host
support. Do not delete the new Worker once links may have circulated. Do not
restore an old DB snapshot: that could resurrect revoked/burned links.

GitHub repository was not renamed. No GitHub release is implied by deployment.
The old host still serves the previous SafeShare branding/header behavior until
a separate reviewed deployment. Live expiry waiting, signed Firefox installation,
and recovery of every historical originals entry are not claimed by these checks.

## Client reload after a host change

Adding a relay host to a manifest does not grant it to an already-loaded unpacked extension.
Chrome keeps the previous service worker and withholds the new host until the extension is
reloaded and the permission is approved. Before 2.5.6 this produced two failures: a relay page
stopped by `viewer_redirect.js` stayed blank, and Word uploads reported "Link was not created".

2.5.6 and later:

- `relay_hosts.js` is the single allowlist shared by the background, the redirect script and Word;
- `viewer_redirect.js` falls back to the relay's web viewer (`?web=1`) when the handoff fails;
- uploads fail with `RELOAD_REQUIRED` and an explicit instruction instead of a generic message.

After editing host permissions: reload the extension, confirm the new host under
`chrome://extensions` → Details, then retest one chat link and one Word link.
