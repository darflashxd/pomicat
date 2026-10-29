# Blackline rename

Blackline is the new product name for SafeShare. Version 2.5.5 changes active UI,
extension titles and package filenames; it is not a new extension identity.

## What stays compatible

- Firefox ID remains `safeshare@research.local`. Chrome's existing unpacked folder
  and distribution identity are unchanged. Update the same installation.
- Preferences, relay override, placeholder maps, encrypted originals, continuation
  and revoke controls keep their existing storage keys.
- New default relay is `https://blackline-relay.bleedguard.workers.dev`; the old
  `https://safeshare-relay.bleedguard.workers.dev` remains supported. Payloads,
  cryptography and the watermark key are unchanged. Existing links remain valid
  until their original expiry or revocation.
- Repository remains `darflashxd/safeshare`, npm package remains `safeshare-ai`.
  Both `blackline` and `safeshare` CLI commands point to the same implementation.
- Internal JS names, CSS/DOM selectors, message actions and environment variables
  retain legacy names. Changing them is not needed for a visible rename.

## Packages and screenshots

Run `python tools/build_extension.py` for Blackline-named 2.5.5 ZIPs and SHA256SUMS.
Do not overwrite the old SafeShare release assets or tags. Published 2.5.4 ZIPs
remain old builds until a separate release is made.

The generic shield icon is retained: it has no name or initials. Existing dated
screenshots/GIF are evidence of SafeShare builds, not current Blackline captures.
New product screenshots must be labelled with their build and fictional fixture.

## Deployment and naming caveat

Cloudflare now has a separate Blackline Worker, sharing the existing D1. The old
Worker is unchanged. Both hosts support old-format ciphertext; new clients default
to Blackline unless a user explicitly configured a relay override. GitHub/npm
resources have not been renamed. See BLACKLINE_RELAY_MIGRATION.md for evidence.

An initial name search found existing BlackLine software and Blackline Safety
brands. This is not trademark clearance or a claim that store/package/domain
names are available. No third-party logo is used. Public naming review remains a
release gate.

Run `node tests/rebrand.test.js`, the normal Node suite, browser regressions and
tests on extracted packages. Full upgrade testing on a persistent user profile
is separate from static compatibility checks; do not claim it from this test alone.

## Checks performed

- MCP Chromium: the existing unpacked installation changed from SafeShare 2.5.4
  to Blackline 2.5.5 with the same extension ID. A digest over all storage.local
  values was identical before and immediately after reloading. No values or keys
  were migrated. This does not prove live revoke/restore for every saved link.
- Local Chromium/Firefox: Word and recipient viewer titles/brand show Blackline
  without page errors. A separate Chromium extension profile retained synthetic
  legacy settings, relay override, encrypted-original entry and revoke entry
  across a browser restart, with the same extension ID.
- The old generic shield icon remains. Historical screenshots are not silently
  relabelled as captures of Blackline. Repo/package/domain availability is not
  claimed; the name collision described above still needs public-release review.
- Chrome/Firefox ZIPs were built locally and checked against source, model bytes
  and SHA256SUMS. Word review and brand tests passed using the extracted Chrome
  package in both browser engines; the packaged extension restart test used
  Chromium. This is not a signed Firefox installation or public release test.
