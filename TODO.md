# SafeShare — Arsenal prep TODO

What's next, with details and file references: **[ROADMAP.md](ROADMAP.md)**.

**Deadline: Black Hat Asia 2027 Arsenal call for tools closes 2 Nov 2026** (per search results;
blackhat.com was behind a bot check, so confirm on the official page). Notification 1 Dec 2026,
conference 2–3 Mar 2027, Singapore. Presenters must be available both days.

> **Status 2026-10-16:** the CLI demo works, but the extension's share path leaks (user messages
> dropped, homoglyph bypass) and the npm package can't load. Don't call the extension or npm
> package production-ready until the P0 list below is closed.

## P0 — fix first (details in ROADMAP.md)
- [ ] P0.1 User messages dropped when a chat is read for sharing (`content_script.js:702`)
- [ ] P0.2 Homoglyph text re-exposed when the share result is built (`modal.js:536`)
- [ ] P0.3 npm package missing `policy.js` and `crypto.js`
- [ ] P0.4 Proxy forwards non-`/chat/completions` requests unredacted
- [ ] P0.5 Before-sending replaces every name/place (not only the writer's), unnumbered
- [ ] P0.6 Restore lost fixes from `backup-local`: password rule, OTP rule, on-screen values
- [ ] P0.7 Extension on every `*.workers.dev`; `models/*` exposed to all sites; scanners burn links

## Done
- [x] False claims removed (Tier 2 = contextual rules, no "zero-knowledge" / "100%", handles gone, platform list matches manifest)
- [x] Relay fixed (UUID ids, no overwrite, hashed revoke token, POST-only revoke, CORS allowlist) + tests
- [x] Relay hardening: 512 KB cap, per-IP rate limits, daily cleanup cron; KV fallback and `/api/chat` removed
- [x] `DEPLOY.md` for the Cloudflare account owner
- [x] Repo cleaned (tests/, tools/, docs/archive/, builds and generated data out of git)
- [x] Attack CLI `safeshare invert` (amounts + birth years), and the `Rp 10.800.000` leak it exposed
- [x] Held-out evaluation: ai4privacy (vs Presidio, gitleaks), IndoNLU NERGrit, WildChat false positives — `tools/eval/RESULTS.md`
- [x] Over-redaction bugs found on WildChat fixed, with regression tests
- [x] Policy file, presets, CLI, OpenAI-compatible proxy (see P0.3 / P0.4 for gaps)
- [x] Reader profiles (public / trusted), range mode, Presidio integration (`names: personal`)
- [x] Threat model + "didn't the vendors fix this?" in README
- [x] Looked for the attack in 20,000 real WildChat chats: personal finance rare (0.05%), no leaks found
- [x] Labelling kit: `LABELLING.md`, 233-row sheet, agreement script
- [x] 2.3.1 (friend): local MiniLM Q4 NER in an offscreen page (no network), Tier-0 technical veto
      (CLI false positives 38% → 0% on the hard-negative set), international IDs, SOTA comparison
      (`tools/eval/RESULTS_SOTA.md`), `docs/RELATED_WORK.md`
- [x] `extension/manifest.json` is the Chrome manifest again (re-applied in `12a9874`)

## Left for you
- [ ] Ask friend: MiniLM model source, training data, licence (ROADMAP P1)
- [ ] Agree a git workflow with friend so local commits aren't lost (`backup-local` still holds 2 commits)
- [ ] `git push` once P0 is in
- [ ] Friend deploys with `DEPLOY.md` (incl. `ALTER TABLE`)
- [ ] TESTING.md on ChatGPT, Claude, DeepSeek; friends test the zip
- [ ] Friends fill `tools/eval/data/label_sheet.csv` + `LABELLING.md` (sheet stays private)
- [ ] API key(s) for InversionBench and training labels
- [ ] Confirm CFP dates and form fields; presenter bios in `docs/ARSENAL_ABSTRACT.md`; demo video; submit

## Worth doing before the talk
See ROADMAP.md §1–§6: in-extension decryption, new inferences (dates, combinations of details,
across turns), InversionBench, responsible disclosure, the "is this about the writer?" model,
booth page.
