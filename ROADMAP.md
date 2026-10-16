# SafeShare roadmap

Updated 2026-10-16 after reviewing the 2.3.1 commits (MiniLM model, Tier-0 veto) and an
independent read-only audit. Black Hat Asia 2027 Arsenal call for tools reportedly closes
**2 Nov 2026** (confirm on blackhat.com). Reviewers judge the submission, so items marked
**before 2 Nov** go in the abstract; the rest can land before the conference (March 2027).

**Owners:** `me` = Claude in this repo · `you` = project owner · `friend` = co-developer /
Cloudflare account owner · `friends` = testers / labellers
**Status tags:** ✅ confirmed by reproducing it · 🔎 reported, still to verify

Done work is tracked in [TODO.md](TODO.md); this file is what's next.

> **Rule until P0 is closed:** don't present the extension or the npm package as
> production-ready. The CLI demo (`invert`, `redact`) works; the share path and packaging don't yet.

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

- [ ] Split the filter: one for the composer / SafeShare UI, a separate one for message
      extraction. User and assistant turns must both come through, in order. · `me`
- [ ] Tests on ChatGPT 2026 and Claude DOM fixtures: both roles extracted, in order. · `me`
- [ ] End-to-end test: full salary conversation → share output → `invert` recovers nothing. · `me`

### P0.2 Homoglyph text is re-exposed when the share result is built ✅
`heuristics.scan()` normalises look-alike characters (`heuristics.js:1157-1162`) and detects on
the normalised text. The share dialog then starts again from the **original** text and replaces
each detection's raw string (`extension/ui/modal.js:523-542`, `:536`). The normalised string
doesn't occur in the original, so nothing is replaced.

Reproduced: `mail me at аlice@example.com` (Cyrillic `а`) → scan output
`[user_861@protected.local]`, dialog rebuild `аlice@example.com` (leaked).

**Impact:** the first preview isn't proof that the link content is safe.

- [ ] Apply the same normalisation when building the final output, or map detections back to
      original offsets. · `me`
- [ ] Tests: homoglyph email, phone, key and NIK through the full share path. · `me`
- [ ] Re-scan the final share text right before encrypting, as a last check. · `me`

### P0.3 npm package can't load ✅
`bin/safeshare.js` requires `extension/engine/policy.js` (and `crypto.js` for `share`), but
`package.json` `files` lists neither. `npm pack --dry-run` has 8 files, without them.

- [ ] Add every required module to `files`. · `me`
- [ ] Test: `npm pack`, install the tarball in a temp folder, run `redact`, `invert`, `share`. · `me`

### P0.4 Proxy forwards unknown requests without redaction ✅
`bin/proxy.js:40-49` redacts only `POST …/chat/completions`; anything else, including
`/v1/responses`, goes upstream as is. The README says "every chat message is redacted".

- [ ] Reject (4xx) requests that carry messages on endpoints the proxy doesn't support; pass
      through only known-safe ones (e.g. model listing). · `me`
- [ ] Support `/v1/responses` and Anthropic Messages, or document them as unsupported. · `me`
- [ ] Test with a fake upstream. · `me`

### P0.5 Before-sending protection replaces every name and place ✅
`content_script.js:125-175`: in "Protect IDs + amounts" mode the MiniLM model's names and places
go to ChatGPT as generic `[REDACTED_NAME]` / `[REDACTED_LOCATION]`, with no check of whether they
belong to the writer. "Write a story about Geralt in Novigrad" is sent as
"…[REDACTED_NAME] in [REDACTED_LOCATION]". Same problem as the WildChat result (all names →
71% of real chats rewritten), worse because it changes what the AI receives. Not numbered, not
restored on the user's screen.

- [ ] Only names / places tied to the writer ("my wife …", "I live in …"), using the
      `PERSONAL_BEFORE` rules from `bin/safeshare.js` until a trained model replaces them. · `me`
- [ ] Numbered placeholders + on-screen restore (from commit `9bb9129` on `backup-local`). · `me`

### P0.6 Regressions from the dropped commits ✅
Commits `a293008`, `9bb9129`, `b6bdd00` were lost in a `git reset --hard origin/main` (kept on
branch `backup-local`). The manifest fix is re-applied (`12a9874`); still missing on `main`:

- [ ] Password rule takes prose as a password: "Change your password **regularly**",
      "password m-banking **bukan** …". · `me`
- [ ] OTP rule ("OTP 482913", "kode verifikasi: 4821") missing. · `me`
- [ ] Numbered placeholders + "your real values on your own screen" feature. · `me`
      (merge by hand: the friend's commits changed the same files)

### P0.7 Small security holes ✅
- [ ] Content script runs on **every** `*.workers.dev` / `*.pages.dev` site: any site there can
      detect the extension and use the Continue bridge to open ChatGPT with attacker text.
      Match only the official relay + localhost; accept `SAFESHARE_FORWARD_TO_AI` only from the
      real share page. · `me`
- [ ] `web_accessible_resources` exposes `models/*` to `<all_urls>`: any site can detect that
      SafeShare is installed. Only the offscreen page loads them, so remove it. · `me`
- [ ] Burn-after-read links are burned by link scanners (Outlook Safe Links, Defender,
      Teams/Slack previews that run JS). Add a "Click to open" step before fetching. · `me`

---

## P1 — claims and reliability don't match yet

- [ ] **NER doesn't protect share links.** MiniLM runs only before sending; the share dialog
      uses rules + pseudonymizer (`modal.js:284-349`), so "I live in Bandung." stays in a share.
      `MODELS_SETUP.md:12` ("name/address labels reach the share flow") is wrong for the current
      code. Either wire the model into sharing or fix the docs. · `me` ✅
- [ ] **Benchmark ≠ extension runtime.** `tools/sota/run_hybrid.py` uses the Hugging Face
      tokenizer, softmax probabilities and all labels; the extension (`offscreen.js`) uses its own
      tokenizer and sends **raw logits** to the thresholds in `span_arbiter.js:159-164`, and keeps
      only 8 labels. F1 0.848 (raw model) and 0.834 (simulated hybrid) are not the extension's F1.
      Fix the scoring (softmax before thresholds), test the runtime tokenizer against the HF one,
      and measure the real path. · `me` 🔎
- [ ] **Where does the MiniLM model come from?** No source, training data or licence documented.
      Its labels resemble ai4privacy's; if it was trained on ai4privacy, "0.85 on ai4privacy,
      beats Presidio" is tested on its own training distribution. Document origin + licence and
      add an out-of-distribution test (WildChat false positives, Indonesian text). · `friend` + `me`
- [ ] **Before-sending fails open for names.** NER times out after 400 ms
      (`content_script.js:71-91`) and the message goes out with rules only. Decide: wait longer,
      block with a notice, or say so in the UI. Firefox has no offscreen documents
      (`background.js:13-16`): test what happens there. · `me` 🔎
- [ ] **Local relay reports success when saving fails.** `relay/server_local.py:42-49` swallows
      write errors and still returns `201`; the share disappears on restart. Return an error;
      add an I/O failure test. · `me` ✅
- [ ] **Two shield settings.** The chip uses `safeshare_shield_mode`; the dialog's toggle writes
      `safeshare_pre_inference` (`modal.js:946-953`). The toggle can appear to switch protection
      off without doing so. Use one setting. · `me` ✅
- [ ] One test file fails: `test_symbolic_local_compute.js` (`CHF 120’000` vs `CHF 120'000`,
      locale formatting). · `me`

## Claims to narrow (README, abstract, RESULTS_SOTA)

- [ ] "removes **every** visible number that can be derived" → "removes numbers derivable through
      the supported transformations (ratios, periods, projections, sums/differences)"
      (`policy.js:117-175`, `pseudonymizer.js:267-351`). · `me`
- [ ] "0% false positives" applies to the tested CLI hard-negative set only, not all chats. · `me`
- [ ] WildChat showed no personal-finance inversion incident in the sample; keep saying so. · `me`
- [ ] Separate four numbers in docs: raw model, simulated hybrid, before-sending, share path. · `me`
- [ ] Tone down overclaiming wording: "Standard: Black Hat Asia 2027 & USENIX Security"
      (`span_arbiter.js`), "Weaponized Algebraic Side-Channel Attack"
      (`tools/poc_asca_inversion.py`), "Peer-Reviewed" (`tools/benchmark_distilbert_vs_minilm.py`).
      Translate `tools/eval/RESULTS_SOTA.md` to English. · `me`

---

## 1. Security hardening (before the conference)

### The host can read chats by changing the share page (most important)
The relay serves the page that decrypts the chat (`viewer/`). Whoever controls it (us,
Cloudflare, an account thief, any self-hoster) can change it to send the key and plaintext home.
"Server-blind" only holds while the host is honest.

- [ ] **Decrypt inside the extension** (`chrome-extension://…/viewer.html` fetches only
      ciphertext); hosted page stays as a labelled fallback for people without the extension. · `me`
- [ ] Content-Security-Policy and subresource integrity on the hosted page; publish file hashes. · `me`

### What the chat site itself can see
- [ ] Values restored on the user's screen are in the site's DOM (readable by its analytics /
      session replay): show them in a closed shadow DOM; state the limit. · `me`
- [ ] Move the amounts vault from the page's `sessionStorage` to `storage.session`. · `me`
- [ ] README: what you type is visible to the site before the shield rewrites it on send. · `me`

### Supply chain and accounts
- [ ] Chrome Web Store + Firefox Add-ons listings instead of unpacked zips. · `you`
- [ ] SHA-256 checksums for release zips. · `me`
- [ ] 2FA on GitHub and Cloudflare; protected `main`; signed commits. · `you` + `friend`
- [ ] Official relay on a dedicated project Cloudflare account, ideally `share.<domain>`. · `you` + `friend`
- [ ] Agree a workflow so commits aren't lost again (pull/rebase, no `reset --hard` over local
      work; `extension/manifest.json` is the Chrome manifest). · `you` + `friend`
- [ ] Large binaries (28 MB model + WASM, tokenizer JSONs): consider Git LFS or release assets. · `friend`
- [ ] Pin deploy/eval tool versions; keep zero npm dependencies. · `me`

### Self-hosting usability
- [ ] "Relay address" setting in the share dialog, with a warning for non-official relays. · `me`

### Attack list for the README (reference)

| # | Who | Attack | Possible today? | Fix / status |
|---|---|---|---|---|
| 1.1 | Host / Cloudflare / account thief | Modified share page steals key + chat | **Yes** | In-extension decryption (§1) |
| 1.2 | Host | Logs IPs, times, sizes, share IDs, user agents, who opens which link | Yes | Document; self-hosting for those who care |
| 1.3 | Host | Withholds or deletes shares, keeps a burn-after-read copy | Yes | Can't prevent; the copy stays encrypted |
| 1.4 | Host | Alters a share | No (AES-GCM, ID bound inside) | — |
| 1.5 | A malicious relay passed around ("use my relay") | Reads every link made through it (via 1.1) | Yes | Relay setting warns on non-official relays; in-extension decryption |
| 2.1 | Network eavesdropper (café Wi-Fi, ISP) | Reads traffic | No (HTTPS, ciphertext only) | — |
| 2.2 | HTTPS interception (company proxy, antivirus web shield, malware root cert) | Rewrites the share page | **Yes** | In-extension decryption |
| 2.3 | Anyone on the network | Uses a local `http://` relay exposed beyond 127.0.0.1 | Only if exposed | Keep localhost-only default; warn in DEPLOY/README |
| 2.4 | Look-alike relay domain | Fake share page | Yes | Official domain, store listing, in-extension decryption |
| 3.1 | Anyone with the link (forwarded, history, sync, screenshots) | Reads the share | By design | Expiry, burn-after-read, revoke |
| 3.2 | Link scanners (Safe Links, Defender, Teams/Slack previews) | Burn links before the recipient | Likely | "Click to open" (P0.7) |
| 3.3 | Recipient | Screenshot / copy / photo | Yes | Out of scope; anti-copy is deterrence only |
| 3.4 | Scrapers | Guess share IDs | No (122-bit IDs + rate limits) | — |
| 3.5 | Reader doing arithmetic / inference | Recover hidden values from the shared chat | Blocked for amounts and birth years | Dates, combinations of details, across turns, locations (§2) |
| 4.1 | Any `*.workers.dev` / `*.pages.dev` site | Fingerprint + Continue prompt-injection bait | **Yes** | P0.7 |
| 4.2 | Chat site's own scripts (analytics, session replay) | Read typed text and values restored on screen | Yes | Closed shadow DOM; state the limit |
| 4.3 | Chat site's own scripts | Read the amounts vault in page `sessionStorage` | Yes | Move to `storage.session` (§1) |
| 4.4 | A website | Imitates the extension's chip/buttons to mislead users | Possible, low impact | — |
| 4.5 | Another extension with "read all sites" | Reads everything on the page | Yes | Out of scope; state it |
| 4.6 | Any website | Detects the extension via `models/*` | **Yes** | P0.7 |
| 4.7 | Look-alike (homoglyph) characters | Bypass redaction in the share output | **Yes** | P0.2 |
| 5.1 | Whoever hands out a modified zip | Malicious extension reads all chats | **Yes** (biggest single risk) | Store listings + SHA-256 checksums |
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

- [ ] **A. Dates** (before 2 Nov): "[REDACTED_DATE] is a Tuesday, the day after my birthday on the
      14th" → candidate dates in a ±12-month window; defence hides weekdays, day numbers and
      offsets near a hidden date. · `me`
- [ ] **B. Combinations of details** (prototype before 2 Nov): "only female cardiologist at a
      50-bed hospital in Blitar" → estimated number of matching people from BPS statistics; warn
      below ~5 and offer one-click generalisation; cite k-anonymity / Sweeney. · `me`
- [ ] **C. Across turns** (before 2 Nov): hidden value recovered only from messages 2+5+7;
      separate benchmark row. Depends on P0.1. · `me`
- [ ] **D. Locations** (later): hide landmark + distance phrases near a hidden address. · `me`

## 3. InversionBench: measure the attack for real

- [ ] ~300 fictional personal prompts (ID + EN): salaries, loans, ages, travel dates, doses,
      combinations of details. · `me`
- [ ] Real replies from 3–4 current models. · `me` · **needs API keys**
- [ ] Redact with every tool in §4 + Presidio + a regex baseline; report recovery per tool and
      per inference type, and what's left after SafeShare. · `me`
- [ ] Publish dataset (fictional only) and scripts; update RESULTS.md and the abstract. · `me`

## 4. Test real redaction tools, disclose responsibly

Rules: fictional data only; follow each service's terms; no bypassing; call it a *limit of a class
of tools*, not a vulnerability or CVE.

- [ ] Harness: InversionBench through Presidio, scrubadub/philter, "anonymize before ChatGPT"
      extensions; then `invert`. · `me`
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

- [ ] Reframe the abstract: "redaction is broken for AI chats" (any redactor), 2025 indexing as
      the motivating example. **Only after P0 and the claim fixes.** · `me` · before 2 Nov
- [ ] Friend deploys the relay with [DEPLOY.md](DEPLOY.md) (incl. `ALTER TABLE`). · `friend`
- [ ] Run [TESTING.md](TESTING.md) on ChatGPT, Claude and DeepSeek against the live relay. · `you`
- [ ] 2–3 minute demo video. · `you`
- [ ] Presenter names and bios in `docs/ARSENAL_ABSTRACT.md`; push; Release with checksums;
      submit. · `you` · **by 2 Nov**
- [ ] Extension icon (16/48/128). · `me`
- [ ] "Paste a redacted chat, we'll try to break it" booth page, fully in-browser. · `me` · March

---

## Timeline

| When | What |
|---|---|
| Now – 20 Oct | **P0.1–P0.7** with regression tests |
| 20 – 25 Oct | P1 + claim fixes · §2A dates · §2C across turns |
| 25 Oct – 2 Nov | Live deploy · TESTING.md on 3 sites · video · bios · reframed abstract · **submit** |
| November | §1 in-extension decryption, shadow DOM, vault move · §4 harness · §5 data + first model |
| Early December | §4 disclosure emails sent |
| Dec – Feb | §5 model in browser · store listings · booth page · rehearse DEMO.md |
| March 2027 | Black Hat Asia, Singapore |

## Blocked on someone else

### From the co-developer (friend)
1. **MiniLM provenance:** base model and where it came from (Hugging Face repo or own training),
   training data and split, licence of the weights and data, how the vocabulary was pruned to
   19,730 tokens, and confirmation that the ai4privacy rows used for the 0.848 score were not in
   its training data.
2. **Intent behind `content_script.js:702`:** why user bubbles were added to the input/UI filter
   (e.g. to stop hydration on user messages?), so the P0.1 fix keeps that purpose.
3. **Runtime vs benchmark:** what the `span_arbiter` thresholds were calibrated on (softmax
   probabilities or raw logits), and whether the extension's tokenizer was checked against the
   Hugging Face one.
4. **Firefox:** intended behaviour of the NER step without offscreen documents.
5. **Git workflow:** no `reset --hard` over others' work; pull/rebase before push; who merges the
   two commits still on `backup-local`; `extension/manifest.json` is now the Chrome manifest.
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
