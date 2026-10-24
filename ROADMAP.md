# SafeShare roadmap

Updated 2026-10-16 after reviewing the 2.3.1 commits (MiniLM model, Tier-0 veto) and an
independent read-only audit. Black Hat Asia 2027 Arsenal call for tools reportedly closes
**2 Nov 2026** (confirm on blackhat.com). Reviewers judge the submission, so items marked
**before 2 Nov** go in the abstract; the rest can land before the conference (March 2027).

**Owners:** `me` = done in this repo · `you` = project owner · `friend` = co-developer /
Cloudflare account owner · `friends` = testers / labellers
**Status tags:** ✅ confirmed by reproducing it · 🔎 reported, still to verify

Done work is tracked in [TODO.md](TODO.md); this file is what's next.

> **P0 fixes are in (2026-10-16, commits `f484f89`..`24cfe6b`).** Still open before calling the
> extension production-ready: the browser checks on real ChatGPT / Claude pages (P0.1, P0.2) and
> a manual run of share links opening inside the extension (§1).
>
> **2026-10-18:** checked on real ChatGPT and DeepSeek through Claude in Chrome (on-screen values,
> chip menu, ChatGPT's new streamed layout fixed). Security audit fixes and the new features below
> are in; #2 (LLM attacker) and #4 (tool comparison) are tracked in
> [docs/ATTACK_BENCH_PLAN.md](docs/ATTACK_BENCH_PLAN.md).

## Done 2026-10-17 – 18 (summary)

- [x] Security audit (live tests): no code injection into the share dialog or viewer; link
      scanners can't fake the "Open" click; websites can't message the background worker.
- [x] Fixed: invisible characters (tag characters, bidi controls) hid keys/IDs from every rule;
      hidden "smuggled" instructions reached the next AI through Continue, outgoing messages and the
      viewer; background upload/revoke accepted any relay address; protection failed **open** on
      an engine error (now holds the message).
- [x] Only matched parts change (offset map): Cyrillic/Greek, emoji and ligatures stay as typed.
- [x] Share dialog: maybe-review context score + top-5 list, attack check (SafeShare's own attacks
      on the text about to be shared), revoke-on-reshare, sharer-only originals (encrypted with the
      link key, extension only).
- [x] Before sending: off by default (opt-in), "Keep debug details" switch, public IPs hidden
      (also inside URLs), per-chat restore map, values stay visible after switching protection off.
- [x] Site health check: warns when a chat site's layout changes and SafeShare can't read it.
- [x] Final audit (18 Oct): no secrets in git history (only fictional test values); zip and npm
      package contain only what they should; no dependencies; minimal permissions; fixed a path
      traversal in the local relay (`/../viewer_redirect.js`).
- [x] Settings (protection mode, debug switch, categories) moved from the chat site's localStorage
      to extension storage (`engine/settings.js`); a page script can no longer switch protection off
      or set the reader to "Someone I trust" (checked live on all three sites, 18 Oct).
- [x] Firefox manifest has a `browser_specific_settings.gecko.id` (`safeshare@research.local`).
- [x] 18 Oct live round: tabs left open after an extension reload say "SafeShare was updated:
      refresh this tab" (and still protect sends); the share review no longer suggests field labels
      ("NIK") or "SafeShare" as names; on-screen sums keep the site's markup and escape formula text
      (`tests/fixtures/hydration_sanitize.html`).
- [x] Bugs found on real ChatGPT: formulas split across streamed spans, address rule running across
      sentences, `@` in prose redacted.

---

## P0 — leaks and breakage (fix before any demo, release or submission)

### P0.1 User messages are dropped when a chat is read for sharing ✅
`extension/content_script.js:702`: the input/UI filter `isPromptInputOrUIElement()` now also
rejects user bubbles (`[data-user-message-bubble='true']`, `[data-testid='user-message']`,
`[data-message-author-role='user']`). Extraction (`:772-796`) therefore keeps only assistant
blocks, and returns as soon as it finds any.

**Impact:** shared chats contain answers without questions. Without the user's own amounts the
inversion defence doesn't know what to hide: in a salary example, `USD 1,000`, `USD 12,000` and
`20%` stay visible and `invert` recovers `USD 5,000`. (A failure of the pipeline, not evidence
that every real chat leaks.)

- [x] Split the filter: one for the composer / SafeShare UI, a separate one for message
      extraction. User and assistant turns must both come through, in order. · `me`
- [x] Tests on ChatGPT 2026 and Claude DOM fixtures: both roles extracted, in order. · `me`
      Covered by `tests/fixtures/extraction_integrity.html` (friend).
- [x] End-to-end test: full salary conversation → share output → `invert` recovers nothing. · `me`
      `tests/maybe.test.js`: 4-turn Indonesian chat through the share dialog; `invert` and the
      dialog's attack check find nothing (24 Oct).

### P0.2 Homoglyph text is re-exposed when the share result is built ✅
`heuristics.scan()` normalises look-alike characters (`heuristics.js:1157-1162`) and detects on
the normalised text. The share dialog then starts again from the **original** text and replaces
each detection's raw string (`extension/ui/modal.js:523-542`, `:536`). The normalised string
doesn't occur in the original, so nothing is replaced.

Reproduced: `mail me at аlice@example.com` (Cyrillic `а`) → scan output
`[user_861@protected.local]`, dialog rebuild `аlice@example.com` (leaked).

**Impact:** the first preview isn't proof that the link content is safe.

- [x] Apply the same normalisation when building the final output, or map detections back to
      original offsets. · `me`
- [x] Tests: homoglyph email, phone, key and NIK through the full share path. · `me`
      `tests/maybe.test.js`: Cyrillic email; fullwidth phone and NIK; Cyrillic-letter key (24 Oct).
- [x] Re-scan the final share text right before encrypting, as a last check. · `me`

### P0.3 npm package can't load ✅
`bin/safeshare.js` requires `extension/engine/policy.js` (and `crypto.js` for `share`), but
`package.json` `files` lists neither. `npm pack --dry-run` has 8 files, without them.

- [x] Add every required module to `files`. · `me`
- [x] Test: `npm pack`, install the tarball in a temp folder, run `redact`, `invert` (`tests/package.test.js`). · `me`

### P0.4 Proxy forwards unknown requests without redaction ✅
`bin/proxy.js:40-49` redacts only `POST …/chat/completions`; anything else, including
`/v1/responses`, goes upstream as is. The README says "every chat message is redacted".

- [x] Reject (4xx) requests that carry messages on endpoints the proxy doesn't support; pass
      through only known-safe ones (e.g. model listing). · `me`
- [x] Support `/v1/responses` and Anthropic Messages (any other request with a body: 403). · `me`
- [x] Test with a fake upstream. · `me`

### P0.5 Before-sending protection replaces every name and place ✅
`content_script.js:125-175`: in "Protect IDs + amounts" mode the MiniLM model's names and places
go to ChatGPT as generic `[REDACTED_NAME]` / `[REDACTED_LOCATION]`, with no check of whether they
belong to the writer. "Write a story about Geralt in Novigrad" is sent as
"…[REDACTED_NAME] in [REDACTED_LOCATION]". Same problem as the WildChat result (all names →
71% of real chats rewritten), worse because it changes what the AI receives. Not numbered, not
restored on the user's screen.

- [x] Only names / places tied to the writer ("my wife …", "I live in …"), using the
      `PERSONAL_BEFORE` rules from `bin/safeshare.js` until a trained model replaces them. · `me`
- [x] Numbered placeholders + on-screen restore (closed shadow DOM, from `9bb9129`). · `me`

### P0.6 Regressions from the dropped commits ✅
Commits `a293008`, `9bb9129`, `b6bdd00` were lost in a `git reset --hard origin/main` (kept on
branch `backup-local`). The manifest fix is re-applied (`12a9874`); still missing on `main`:

- [x] Password rule takes prose as a password: "Change your password **regularly**",
      "password m-banking **bukan** …". · `me`
- [x] OTP rule ("OTP 482913", "kode verifikasi: 4821") missing. · `me`
- [x] Numbered placeholders + "your real values on your own screen" feature. · `me`
      (merge by hand: the friend's commits changed the same files)

### P0.7 Small security holes ✅
- [x] Content script runs on **every** `*.workers.dev` / `*.pages.dev` site: any site there can
      detect the extension and use the Continue bridge to open ChatGPT with attacker text.
      Match only the official relay + localhost; accept `SAFESHARE_FORWARD_TO_AI` only from the
      real share page. · `me`
- [x] `web_accessible_resources` exposes `models/*` to `<all_urls>`: any site can detect that
      SafeShare is installed. Only the offscreen page loads them, so remove it. · `me`
- [x] Burn-after-read links are burned by link scanners (Outlook Safe Links, Defender,
      Teams/Slack previews that run JS). Add a "Click to open" step before fetching. · `me`

---

## P1 — claims and reliability don't match yet

- [x] **NER doesn't protect share links.** MiniLM runs only before sending; the share dialog
      uses rules + pseudonymizer (`modal.js:284-349`), so "I live in Bandung." stays in a share.
      `MODELS_SETUP.md:12` ("name/address labels reach the share flow") is wrong for the current
      code. Either wire the model into sharing or fix the docs. · `me` ✅
- [ ] **Benchmark ≠ extension runtime.** `tools/sota/run_hybrid.py` uses the Hugging Face
      tokenizer, softmax probabilities and all labels; the extension (`offscreen.js`) uses its own
      tokenizer and sends **raw logits** to the thresholds in `span_arbiter.js:159-164`, and keeps
      only 8 labels. F1 0.848 (raw model) and 0.834 (simulated hybrid) are not the extension's F1.
      Fix the scoring (softmax before thresholds), test the runtime tokenizer against the HF one,
      and measure the real path. · `me` 🔎
      Softmax and tokenizer done (see co-developer question 3); a measurement of the real path
      and an id-for-id check against the HF tokenizer still to do.
- [x] **Model source and licence.** MiniLM was replaced by BERT-small INT8 in `47ede77`;
      `extension/models/MODEL_INFO.json` records the repository (gravitee-io/bert-small-pii-detection),
      revision, Apache-2.0 licence and weight hash.
- [ ] **Model training data.** Not documented upstream. If it overlaps ai4privacy, scores on
      ai4privacy measure its own training distribution: keep the out-of-distribution checks
      (WildChat false positives, Indonesian text) as the headline numbers. · `friend` + `me`
- [ ] **Before-sending fails open for names.** NER times out after 400 ms
      (`content_script.js:71-91`) and the message goes out with rules only. Decide: wait longer,
      block with a notice, or say so in the UI. Firefox has no offscreen documents
      (`background.js:13-16`): test what happens there. · `me` 🔎
      Now said in the UI (chip: "Sent without the name/place check"). Firefox: still to test.
- [x] **Local relay reports success when saving fails.** `relay/server_local.py:42-49` swallows
      write errors and still returns `201`; the share disappears on restart. Return an error;
      add an I/O failure test. · `me` ✅
- [x] **Two shield settings.** The chip uses `safeshare_shield_mode`; the dialog's toggle writes
      `safeshare_pre_inference` (`modal.js:946-953`). The toggle can appear to switch protection
      off without doing so. Use one setting. · `me` ✅
- [x] One test file fails: `test_symbolic_local_compute.js` (`CHF 120’000` vs `CHF 120'000`,
      locale formatting). · `me`

## Claims to narrow (README, abstract, RESULTS_SOTA)

- [x] "removes **every** visible number that can be derived" → "removes numbers derivable through
      the supported transformations (ratios, periods, projections, sums/differences)"
      (`policy.js:117-175`, `pseudonymizer.js:267-351`). · `me`
- [x] "0% false positives" applies to the tested CLI hard-negative set only, not all chats. · `me`
- [x] WildChat showed no personal-finance inversion incident in the sample; keep saying so. · `me`
- [x] Separate four numbers in docs: raw model, simulated hybrid, before-sending, share path. · `me`
- [x] Tone down overclaiming wording: "Standard: Black Hat Asia 2027 & USENIX Security"
      (`span_arbiter.js`), "Weaponized Algebraic Side-Channel Attack"
      (`tools/poc_asca_inversion.py`), "Peer-Reviewed" (`tools/benchmark_distilbert_vs_minilm.py`).
      Translate `tools/eval/RESULTS_SOTA.md` to English. · `me`

---

## 1. Security hardening (before the conference)

### The host can read chats by changing the share page (most important)
The relay serves the page that decrypts the chat (`viewer/`). Whoever controls it (us,
Cloudflare, an account thief, any self-hoster) can change it to send the key and plaintext home.
"Server-blind" only holds while the host is honest.

- [x] **Decrypt inside the extension** (`chrome-extension://…/viewer.html` fetches only
      ciphertext); hosted page stays as a labelled fallback for people without the extension. · `me`
- [x] Content-Security-Policy on the hosted page; file hashes in `dist/SHA256SUMS`. (SRI skipped: the
      host serves the HTML too, so it could change the hashes; the extension's own copy is the fix.) · `me`

### What the chat site itself can see
- [x] Values restored on the user's screen are in the site's DOM (readable by its analytics /
      session replay): show them in a closed shadow DOM; state the limit. · `me`
      Done for IDs, names and places; restored amounts are still page text (stated in README).
- [x] Move the amounts vault from the page's `sessionStorage` to `storage.session`. · `me`
- [x] README: what you type is visible to the site before the shield rewrites it on send. · `me`

### Supply chain and accounts
- [ ] Chrome Web Store + Firefox Add-ons listings instead of unpacked zips. · `you`
- [x] SHA-256 checksums for release zips. · `me`
- [ ] 2FA on GitHub and Cloudflare; protected `main`; signed commits. · `you` + `friend`
- [ ] Official relay on a dedicated project Cloudflare account, ideally `share.<domain>`. · `you` + `friend`
- [x] Agree a workflow so commits aren't lost again (pull/rebase, no `reset --hard` over local
      work; `extension/manifest.json` is the Chrome manifest). · `you` + `friend`
- [ ] Large binaries (28 MB model + WASM, tokenizer JSONs): consider Git LFS or release assets. · `friend`
- [ ] Pin deploy/eval tool versions; keep zero npm dependencies. · `me` (needs the versions
      your friend deploys with; not guessed)

### Self-hosting usability
- [ ] ~~"Relay address" setting in the share dialog~~ Replaced: the extension now only talks to
      the official relay + localhost (P0.7), so another relay is a code change listed in
      DEPLOY.md §5 rather than a setting anyone can be talked into. Revisit with optional host
      permissions if self-hosting gets common. · `me`

### Attack list for the README (reference)

| # | Who | Attack | Possible today? | Fix / status |
|---|---|---|---|---|
| 1.1 | Host / Cloudflare / account thief | Modified share page steals key + chat | Only for people without the extension | In-extension decryption (done) |
| 1.2 | Host | Logs IPs, times, sizes, share IDs, user agents, who opens which link | Yes | Document; self-hosting for those who care |
| 1.3 | Host | Withholds or deletes shares, keeps a burn-after-read copy | Yes | Can't prevent; the copy stays encrypted |
| 1.4 | Host | Alters a share | No (AES-GCM, ID bound inside) | — |
| 1.5 | A malicious relay passed around ("use my relay") | Reads every link made through it (via 1.1) | Yes | Relay setting warns on non-official relays; in-extension decryption |
| 2.1 | Network eavesdropper (café Wi-Fi, ISP) | Reads traffic | No (HTTPS, ciphertext only) | — |
| 2.2 | HTTPS interception (company proxy, antivirus web shield, malware root cert) | Rewrites the share page | Only without the extension | In-extension decryption (done) |
| 2.3 | Anyone on the network | Uses a local `http://` relay exposed beyond 127.0.0.1 | Only if exposed | Keep localhost-only default; warn in DEPLOY/README |
| 2.4 | Look-alike relay domain | Fake share page | Yes | Official domain, store listing, in-extension decryption |
| 3.1 | Anyone with the link (forwarded, history, sync, screenshots) | Reads the share | By design | Expiry, burn-after-read, revoke |
| 3.2 | Link scanners (Safe Links, Defender, Teams/Slack previews) | Burn links before the recipient | No | "Click to open" (done) |
| 3.3 | Recipient | Screenshot / copy / photo | Yes | Out of scope; anti-copy is deterrence only |
| 3.4 | Scrapers | Guess share IDs | No (122-bit IDs + rate limits) | — |
| 3.5 | Reader doing arithmetic / inference | Recover hidden values from the shared chat | Blocked for amounts, birth years, dates (supported clues) | Combinations warn only; locations defence only (§2) |
| 4.1 | Any `*.workers.dev` / `*.pages.dev` site | Fingerprint + Continue prompt-injection bait | No | P0.7 (done) |
| 4.2 | Chat site's own scripts (analytics, session replay) | Read typed text and values restored on screen | Typed text and amounts: yes | Closed shadow DOM for IDs/names/places (done); limit stated |
| 4.3 | Chat site's own scripts | Read the amounts vault in page `sessionStorage` | No | Moved to `storage.session` (done) |
| 4.4 | A website | Imitates the extension's chip/buttons to mislead users | Possible, low impact | — |
| 4.5 | Another extension with "read all sites" | Reads everything on the page | Yes | Out of scope; state it |
| 4.6 | Any website | Detects the extension via `models/*` | No | P0.7 (done) |
| 4.7 | Look-alike (homoglyph) characters | Bypass redaction in the share output | No | P0.2 (done) |
| 5.1 | Whoever hands out a modified zip | Malicious extension reads all chats | **Yes** (biggest single risk) | SHA-256 checksums (done); store listings |
| 5.2 | GitHub account / repo takeover | Pushes malicious code | Possible | 2FA, protected `main`, signed commits |
| 5.3 | Cloudflare account takeover | Replaces relay and share page | Possible | 2FA, project account, in-extension decryption |
| 5.4 | Malicious dependency | Code in a package we install | Low (zero npm deps in extension/CLI; bundled ONNX runtime) | Keep zero deps; pin the bundled runtime version |
| 5.5 | Deploy / eval tooling (`npx wrangler`, pip) | Compromised build tool | Low (build time only) | Pin versions |
| 5.6 | A malicious fork published as "SafeShare" | Users install the wrong one | Possible | Official store listings and domain |

Out of scope: malware or a compromised browser on the user's machine, other extensions reading
all pages, what the AI vendor already received before SafeShare was installed, physical access
to an unlocked device.

---

## 2. More kinds of inference

Each needs an attack (in `invert`), a defence, tests and a benchmark row, like the birth-year one.

- [x] **A. Dates** (before 2 Nov; `inferDates`, `tests/inference.test.js`; benchmark: `tools/eval/RESULTS.md` §8, naive 40/40 narrowed, share dialog 0/40): "[REDACTED_DATE] is a Tuesday, the day after my birthday on the
      14th" → candidate dates in a ±12-month window; defence hides weekdays, day numbers and
      offsets near a hidden date. · `me`
- [ ] **B. Combinations of details** (prototype before 2 Nov): "only female cardiologist at a
      50-bed hospital in Blitar" → estimated number of matching people from BPS statistics; warn
      below ~5 and offer one-click generalisation; cite k-anonymity / Sweeney. · `me`
      Prototype done: `quasiIdentifiers()` warns in `invert`. Still to do: population estimate
      (needs BPS tables), warning in the share dialog, one-click generalisation.
- [x] **C. Across turns** (before 2 Nov): hidden value recovered only from messages 2+5+7;
      separate benchmark row. Depends on P0.1. · `me`
- [x] **D. Locations** (later): hide landmark + distance phrases near a hidden address. · `me`

## 3. InversionBench: measure the attack for real

Detailed steps, owners and needs: [docs/ATTACK_BENCH_PLAN.md](docs/ATTACK_BENCH_PLAN.md) (#2).

- [x] Harness `tools/attack_bench/run.js`: 40 fictional chats, redactors none / naive / Presidio /
      SafeShare, arithmetic attacker. Baseline (English): naive 53% leaked, Presidio 100% (left visible), SafeShare 0%
      (`tools/attack_bench/RESULTS.md`). · `me`
- [x] LLM attacker (`--llm` API / `--llm-cli` OpenCode / `--llm-claude` Claude Code), 3 models · `me`
  - [x] One model: DeepSeek V4 Pro (`9router/ds/deepseek-v4-pro`) via `--llm-cli`, no
        OpenAI/Anthropic key. 40 English chats: naive 100% leaked, Presidio 100% left
        visible, SafeShare 0% (`tools/attack_bench/RESULTS_LLM.md`).
  - [x] Two more models (25 Oct): Claude Sonnet 5.5 and Haiku 5.5 via `--llm-claude`, plus Sonnet
        on 40 Indonesian chats. Every model: naive 100% leaked, Presidio 100%, SafeShare 0%
        (Indonesian Presidio hid 87% of salaries; the LLM recovered 88% of those).
  - [ ] An OpenAI or Google model (third vendor).

- [ ] ~300 fictional personal prompts (ID + EN): salaries, loans, ages, travel dates, doses,
      combinations of details. · `me`
- [ ] Real replies from 2–3 current models instead of templated ones. · `me` · **needs API keys**
- [ ] Redact with every tool in §4 + Presidio + a regex baseline; report recovery per tool and
      per inference type, and what's left after SafeShare. · `me`
- [ ] Publish dataset (fictional only) and scripts; update RESULTS.md and the abstract. · `me`

## 4. Test real redaction tools, disclose responsibly

Detailed steps, owners and needs: [docs/ATTACK_BENCH_PLAN.md](docs/ATTACK_BENCH_PLAN.md) (#4).

Rules: fictional data only; follow each service's terms; no bypassing; call it a *limit of a class
of tools*, not a vulnerability or CVE.

- [x] Harness with Presidio + naive baseline (`tools/attack_bench/run.js`). · `me`
- [ ] Add scrubadub / Philter / regex baseline · `me` · **needs your tool list + OK to download**
- [ ] "Anonymise before ChatGPT" extensions/SaaS: you install, we run fictional chats through
      them via Claude in Chrome · `you` + `me`
- [ ] Cloud services (Google SDP, AWS Comprehend PII, Azure PII) via free tiers. · `you`
- [ ] Disclosure: GitHub issues for open source; notes to security contacts for the rest, **by
      early December** (~90 days before March); keep a log. · `you`

## 5. Trained "is this about the writer?" model

- [ ] Test set: friends fill `label_sheet.csv` (2 people each; kappa > 0.6). · `friends`
- [ ] Training set: LLM-labelled WildChat (~5–10k), checked against friends' labels; ConfAIde /
      PrivacyLens; synthetic "mine vs not mine" pairs. · `me` · **needs an API key**
- [ ] Small multilingual encoder, vocabulary trimmed to EN + ID, 8-bit, 30–60 MB; can share the
      offscreen runtime the MiniLM NER already uses. · `me`
- [ ] Evaluate vs rules on friends' labels, ai4privacy names, WildChat % touched. · `me`
- [ ] Gate P0.5 (names before sending) and sharing with it; rules stay as fallback. · `me`

## 6. Submission and booth

- [x] Reframe the abstract: "redaction is broken for AI chats", extension-first, with the LLM
      attacker, arithmetic and dates results (local `docs/ARSENAL_ABSTRACT.md`, not in the repo; 24 Oct). · `me`
- [x] Friend deploys the relay with [DEPLOY.md](DEPLOY.md) (incl. `ALTER TABLE`). · `friend`
      Live and serving CSP on share pages (checked 24 Oct), but the viewer is the ~20 Oct build:
      redeploy after the next push so the 21–24 Oct viewer changes go live.
- [ ] Run [TESTING.md](TESTING.md) on ChatGPT, Claude and DeepSeek against the live relay. · `you`
- [ ] 2–3 minute demo video. · `you`
- [ ] Presenter names and bios in the abstract (local `docs/ARSENAL_ABSTRACT.md`); push; Release with checksums;
      submit. · `you` · **by 2 Nov**
- [x] Extension icon (16/48/128). · `me`
- [ ] "Paste a redacted chat, we'll try to break it" booth page, fully in-browser. · `me` · March

---

## Timeline

| When | What |
|---|---|
| ~~Now – 20 Oct~~ | ~~**P0.1–P0.7** with regression tests~~ done 16 Oct |
| ~~20 – 25 Oct~~ | ~~P1 + claim fixes · §2A dates · §2C across turns~~ done 16–18 Oct |
| 18 – 25 Oct | #2 LLM attacker (needs key) · #4 open-source tools · friend: redeploy relay, model licence |
| 25 Oct – 2 Nov | Live deploy · TESTING.md on 3 sites · video · bios · reframed abstract · **submit** |
| November | §1 in-extension decryption, shadow DOM, vault move · §4 harness · §5 data + first model |
| Early December | §4 disclosure emails sent |
| Dec – Feb | §5 model in browser · store listings · booth page · rehearse DEMO.md |
| March 2027 | Black Hat Asia, Singapore |

## Blocked on someone else

### From the co-developer (friend)

Answers so far (2026-10-16): **1 = from Hugging Face** (details still needed) · **2 = user
messages belong in shares (fixed)** · **3 = do the fix (done)** · **4 = awaiting answer** ·
**5 = agreed**.

1. **MiniLM provenance** — *answer: downloaded from Hugging Face.* Still needed:
   - [ ] the exact model link (`huggingface.co/<owner>/<model>`) and the licence on its page
   - [ ] what it was trained on (its model card says), and whether that includes ai4privacy:
         if yes, our 0.848 on ai4privacy is measured on data like its training data, and the
         README/abstract must say so instead of "beats Presidio"
   - [ ] whether it was changed after download (vocabulary pruned to 19,730 tokens, 4-bit
         quantised): which script did it, so others can reproduce it
   - [ ] add all of this to `MODELS_SETUP.md` and credit the original authors
2. **Why user messages are in the input-box filter** (`content_script.js:702`) — *answer: user
   messages are supposed to be in shares.* Fixed in `f484f89` (sharing reads both roles; the
   on-screen number display still skips your own bubbles).
   The filter was meant to skip the chat input box and SafeShare's own buttons. It now also
   skips every **user message bubble**. Side effect: when a chat is read for sharing, only the
   AI's replies are kept, so shared chats lose the questions and the user's own amounts (P0.1).
   - [x] Was skipping user bubbles on purpose (e.g. to stop the number display from rewriting
         your own messages, or to avoid reading the half-typed draft)? If so, we keep that
         purpose but apply it only where it's needed, not to sharing.
3. **Model scores: probability vs raw score** — *answer: do the fix. Done.*
   The model outputs a raw score per word ("logit", any number, e.g. -3.2 or 7.5). The
   benchmark converts these to probabilities between 0 and 1 (softmax) before comparing with
   thresholds like `0.35`. The extension (`offscreen.js` → `span_arbiter.js`) compares the
   **raw** scores with the same thresholds. A raw score of 0.4 can mean ~20% or ~60% depending
   on the other scores, so the extension may hide more or less than the benchmark says. The
   extension also splits words into tokens with its own code instead of the original tokenizer.
   - [x] Scores: softmax probabilities in `offscreen.js` (`2ce96b4`), as the benchmark used.
   - [x] Tokenizer: `extension/engine/wordpiece.js` now follows the original uncased
         BertTokenizer (the vocab has no capitals and no accented entries, so: lowercase, strip
         accents, split punctuation incl. `_` and CJK, drop zero-width characters, >100-char
         words = [UNK]). The old code broke "José" into "Jos" + "é" and dropped `_`. Checked with
         the shipped model in onnxruntime: names, streets, cities found.
   - [x] Long messages: overlapping 128-piece windows; before, everything after ~126 pieces was
         never checked.
   - [ ] Byte-for-byte comparison with the HF tokenizer's ids: needs
         `training/model_output/minilm_q4/tokenizer.json` (only on the co-developer's machine).
   - [ ] Re-measure the arbiter rows in `RESULTS_SOTA.md` with these fixes.
   Fix either way: apply softmax in `offscreen.js`, check tokenizer output matches, and measure
   the extension's real path (P1).
4. **Firefox** — *open.*
   The model runs in an "offscreen document", a hidden page that only Chrome has. Firefox has
   no offscreen documents (`background.js:13-16` returns early), so on Firefox the model never
   runs and before-sending protection uses rules only, without any notice.
   - [ ] Intended: Firefox = rules only (then the UI should say so), or run the model in
         Firefox's background page (possible, needs testing)?
5. **Git workflow** — *agreed:* no `reset --hard` over others' work; pull/rebase before push;
   `extension/manifest.json` is the Chrome manifest. The two commits on `backup-local`
   (password/OTP/on-screen values, and this roadmap's first version) get merged by hand into
   `main` as part of P0.6.
6. **Cloudflare:** deploy with DEPLOY.md (incl. `ALTER TABLE`); move the official relay to a
   project account with 2FA and both of you as members; optional domain.
7. **Repo binaries:** Git LFS or release assets for the 28 MB model + WASM and tokenizer files.
8. **Submission:** co-presenter or not, bio, availability both conference days.

### From you
1. API key(s) (OpenAI, Anthropic or Gemini; one is enough to start) for InversionBench and the
   training labels.
2. **Decision:** OK to test third-party redaction tools with fictional data and report findings
   (§4)? Yes / no.
3. Cloud accounts (Google / AWS / Azure free tiers) for §4; store developer accounts (§1).
4. Presenter bios, demo video, submission.

### From friends (testers / labellers)
1. Label `tools/eval/data/label_sheet.csv` with `LABELLING.md` (2 people per sheet).
2. Run `TESTING.md` on their own machines once P0 is fixed.
