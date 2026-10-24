# SafeShare — Arsenal prep TODO

What's next, with details and file references: **[ROADMAP.md](ROADMAP.md)**.

**Deadline: Black Hat Asia 2027 Arsenal call for tools closes 2 Nov 2026** (per search results;
blackhat.com was behind a bot check, so confirm on the official page). Notification 1 Dec 2026,
conference 2–3 Mar 2027, Singapore. Presenters must be available both days.

> **Status 2026-10-16 (evening):** all P0 fixes are in and the suite passes (31 files). Before
> calling the extension production-ready: check it on real ChatGPT / Claude pages (user turns in
> shares, homoglyph text) and open a share link with the extension installed (it should reopen
> inside the extension).

## P0 — fixed (details in ROADMAP.md)
- [x] P0.1 User messages dropped when a chat is read for sharing
- [x] P0.2 Homoglyph text re-exposed when the share result is built
- [x] P0.3 npm package missing `policy.js` and `crypto.js`
- [x] P0.4 Proxy forwards non-`/chat/completions` requests unredacted
- [x] P0.5 Before-sending replaces every name/place (not only the writer's), unnumbered
- [x] P0.6 Restore lost fixes from `backup-local`: password rule, OTP rule, on-screen values
- [x] P0.7 Extension on every `*.workers.dev`; `models/*` exposed to all sites; scanners burn links
- [ ] Browser check on ChatGPT and Claude: both roles in a share, homoglyph email hidden · `you`
- [ ] Open a relay link with the extension installed: it reopens as `chrome-extension://…/viewer/` · `you`

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

## Also done (2026-10-16)
- [x] P1: one shield setting, softmax NER scores, NER-not-ready notice, local relay save errors, CHF test, MODELS_SETUP
- [x] Claims narrowed; `RESULTS_SOTA.md` in English
- [x] Share links decrypt inside the extension; CSP on the hosted page; `dist/SHA256SUMS`; vault in `storage.session`; extension icon
- [x] Inference: dates (attack + defence), across turns, combinations (warning), landmarks near addresses

## Left for you
- [ ] Friend: redeploy the relay after this (viewer moved to `extension/viewer/`, `wrangler.toml` updated; CSP headers)
- [x] Model link + licence: MiniLM replaced by BERT-small INT8 (`47ede77`), recorded in `extension/models/MODEL_INFO.json`; training data still undocumented (ROADMAP)
- [ ] Friend: answer ROADMAP "From the co-developer" question 4 (Firefox); 2 and 3 answered and fixed
- [x] ~~MiniLM tokenizer check~~ obsolete: the shipped model is now BERT-small with the standard BERT vocab
- [x] Git workflow agreed with friend (no `reset --hard` over others' work; pull/rebase before push)
- [ ] `git push` once P0 is in
- [ ] Friend deploys with `DEPLOY.md` (incl. `ALTER TABLE`)
- [ ] TESTING.md on ChatGPT, Claude, DeepSeek; friends test the zip
- [ ] Friends fill `tools/eval/data/label_sheet.csv` + `LABELLING.md` (sheet stays private)
- [ ] API key(s) for InversionBench and training labels
- [ ] Confirm CFP dates and form fields; presenter bios in the abstract (local `docs/ARSENAL_ABSTRACT.md`, not in the repo); demo video; submit

## Worth doing before the talk
See ROADMAP.md §1–§6: in-extension decryption, new inferences (dates, combinations of details,
across turns), InversionBench, responsible disclosure, the "is this about the writer?" model,
booth page.
