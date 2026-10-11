# SafeShare — Arsenal prep TODO

**Deadline: Black Hat Asia 2027 Arsenal call for tools closes 2 Nov 2026** (per search results;
blackhat.com was behind a bot check, so confirm on the official page). Notification 1 Dec 2026,
conference 2–3 Mar 2027, Singapore. Presenters must be available both days.

## Done
- [x] False claims removed (Tier 2 = contextual rules, no "zero-knowledge" / "100%", handles gone, platform list matches manifest)
- [x] Relay fixed (UUID ids, no overwrite, hashed revoke token, POST-only revoke, CORS allowlist) + tests
- [x] Repo cleaned (tests/, tools/, docs/archive/, builds and generated data out of git)
- [x] Attack CLI `safeshare invert`, and the `Rp 10.800.000` leak it exposed
- [x] Held-out evaluation: ai4privacy (vs Presidio, gitleaks), IndoNLU NERGrit, WildChat false positives — `tools/eval/RESULTS.md`
- [x] Ten over-redaction bugs found on WildChat fixed, with regression tests
- [x] Policy file, presets, npm package, CLI, OpenAI-compatible proxy
- [x] Viewer reframed as deterrence
- [x] Booth demo (`DEMO.md`), offline `share` flow verified in a browser, `docs/demo.gif`
- [x] 2.3.0: reader profiles (public / trusted), range mode for amounts, Presidio integration with `names: personal`; in CLI and extension
- [x] Release zips rebuilt: `dist/SafeShare-2.3.0-{chrome,firefox}.zip`; notes in `CHANGELOG.md`

## Left for you
- [ ] `git push` (committed locally, not pushed)
- [ ] GitHub Release v2.3.0: upload the two zips from `dist/`, paste `CHANGELOG.md` 2.3.0 (and 2.2.0) as notes
- [ ] Cloudflare: `wrangler login`, then `ALTER TABLE shares ADD COLUMN revoke_hash TEXT;` and `wrangler deploy`
- [ ] Confirm CFP dates and form fields on blackhat.com
- [ ] Fill presenter names and bios in `docs/ARSENAL_ABSTRACT.md`, then submit

## Worth doing before the talk (from the evaluation)
- [x] Positioning: inversion layer on top of an entity detector; `--presidio` matches Presidio (0.78 vs 0.79) and blocks `invert`
- [ ] After acceptance: train a "does this name / number belong to the user?" classifier (label WildChat + ConfAIde/PrivacyLens), replacing the `names: personal` rules; report on both ai4privacy and WildChat
- [ ] Indonesian names and places with Presidio (needs a multilingual spaCy model, e.g. xx_ent_wiki_sm)
- [ ] Remaining over-redaction on real chats: fiction character names, health terms in research text, maths walkthroughs
- [ ] Not covered: casual @handles, text in images, HAR cookies, quasi-identifier combinations
