# Manual test checklist (Chrome)

## v2.4.1 local check (2026-10-26)

- Node: **52/52** regression tests passed locally (`npm test`), including new viewer-Markdown,
  chat-id, vault-promotion, and percentage-false-positive cases.
- Live ChatGPT (Chromium 155, unpacked v2.4.1): a `\texttt{<S1>}` reply hydrated to
  `$2,400 / $1,440 / $960 / $4,800`; the `🔒 1 value protected` note survived a reload; the
  `local-chatgpt:<uuid>` → server-UUID route swap kept the same vault entry.
- Hosted viewer (local relay, extension disabled): headings, table, lists, and the fixed
  **Continue** bar rendered; `spend 15% on hobbies` stayed visible after the short-expense fix.
- Not re-verified here: live Claude and DeepSeek after login, and Firefox runtime after the
  2.4.1 package build. Treat those as open until run.

## GitHub readiness checks (2026-10-25)

Local remediation on base `1af71c1`: the model-runtime review harness now checks
the current preselected-suggestion policy and button `aria-pressed` state instead
of the old unchecked-checkbox UI. The publication failure fixture also targets
the current review button. Stale model results now display the text-changed warning.

Windows local checks passed: Node 48/48 (after remediation), evaluator self-checks,
Chromium and Firefox credential/lifecycle fixtures, both hosted local relay browser
checks, and real Chromium extension ONNX inference plus share-dialog checks.
These results do not establish Linux CI success, live vendor compatibility, or
held-out detection accuracy. Verify the pushed commit in GitHub Actions separately.

Release package check on 2026-10-26: extracted 2.4.0 Chrome and Firefox ZIPs passed
actual ONNX inference and share-dialog checks (Chromium 149 and Firefox 158).
Apache-2.0 section 4(d)'s omitted notice text was restored against the official
license; the existing copyright is retained.

## Release regression additions (2026-10-21)

`manual_redact.test.js` covers URI-password echoes, prose-punctuation echoes, embedded
punctuation selections, adjacent salary corrections (including a financial assistant reply),
English earnings/slang, EIN/Medicare label variants, dot-grouped cards and public/MAC controls.
`local_compute_stress.test.js` checks unary negative multiplication. `submit_lifecycle.html`
also verifies a multiline English earnings prompt is protected and replayed once.
These are development regressions, not evidence of arbitrary paraphrase or formula coverage.

Local release check on 2026-10-21 (base `ce6f4b4` plus uncommitted remediation):
Node 46/46, evaluator self-checks, Chromium/Firefox fixture suites and local relay browser
lifecycles passed (Playwright Firefox 142). Fresh 2.4.0 ZIPs were built; extracted Chrome and Firefox packages passed actual
ONNX/WASM inference and share-dialog smoke checks (Chromium 141, installed Firefox 158).
Firefox harness now requests graceful shutdown before cleaning its temporary profile.
These results do not verify logged-in vendor layouts, remote CI or remote relay deployment.

## English demonstration and local link release gate

`node tools/attack_bench/english.js` prints the 160-case fictional English challenge without
writing results. Add `--out <local-report.json>` for a detailed report. See
`tools/attack_bench/ENGLISH_RESULTS.md` for denominators, false hypotheses and the deliberately
reported base64 limitation. This is a CLI experiment, not a browser-model benchmark or holdout.

`node tests/relay_lifecycle.test.js` starts an isolated local relay and checks actual encrypted
roundtrip, concurrent burn reads (exactly one success), wrong/correct revoke tokens, POST-only
revocation and expiry. It never contacts the public relay. Temporary storage is removed afterward.

`python tools/eval/relay_browser.py` and `--browser firefox` exercise the hosted viewer with actual
local ciphertext: no payload read before opening, ignored synthetic click, trusted click decryption,
burn and revoke. Browser traffic stays local and uncaught page errors fail the test. This is not
the extension-hosted viewer or a logged-in chat-site test. CLI and hosted viewer use production code;
fixture checks of preview/encryption are separate. See `DEMO.md` for the English rehearsal.

## Share workflow lifecycle regressions

`python tools/eval/credential_browser.py` (or `--browser firefox`) runs the production scripts
against local fixtures. All fixture traffic is restricted to the local origin; uncaught page
JavaScript errors fail the run. Additional fixtures:

- `submit_lifecycle.html`: pending NER plus rapid clicks, edited draft, navigation, replay-delay
  double click, immediate next draft, and native form submission. A changed composer/chat/mode cancels the pending send;
  users must review and send again. The draft is not overwritten by the old result.
- `extraction_integrity.html`: mixed legacy/modern role layouts, ordered turns, multi-block
  answers, headings/tables/code and composer exclusion. This does not prove all historical or
  virtualized turns are present in a vendor site's DOM.
- `model_lifecycle.html`: old scans cannot continue after close/reopen, late responses cannot
  populate new review state, changed scan text is marked stale, manual choices survive, and model
  failures unlock controls without claiming a clean result. Closing during encryption cancels
  the subsequent upload. An already in-flight network upload cannot be recalled by closing UI.
- `maybe_review.html`: publication locks/snapshots before awaiting earlier-link revocation;
  repeat clicks during that wait cannot publish twice. DOM preview equals decrypted turns.

Live vendor checks attempted on 2026-10-20: Claude/DeepSeek required login; ChatGPT was logged
out and SafeShare was not installed in the interactive browser. No vendor prompts were sent and
these sites are NOT considered end-to-end verified by the fixture results.

To test a built/extracted package instead of the source extension, set
`SAFESHARE_EXTENSION_DIR` to that package's directory before running `chrome_ner.py` or
`firefox_ner.py`. The Firefox harness rejects a Chromium manifest. Clear the variable afterward
to return to source testing. These harnesses use temporary profiles and never upload shares.

## Model-upgrade correction checks

`node tests/ner_decoder.test.js` exercises the actual decoder with controlled logits: English
names containing `Di Yang`, repeated Indonesian marker words and mixed messages must never
disable the full scan. Native PERSON/LOCATION labels remain intact. `ner_client.test.js` checks
malformed/partial responses, transport failure and checked-empty results. The real Chrome/Firefox
model harness runs mixed-message name coverage and checked-empty tests too.

Model quality is English-focused. Removing the old language-word bypass can expose noisy
non-English suggestions; this is not fixed by pretending those messages were checked with no hits.
Historical baseline benchmark tools read MiniLM from git commit `fb35c63` into an external
experiment folder and verify identity instead of relabelling the current BERT file as MiniLM.
Run those tools from a repository with that commit available (full history, not a shallow clone).

Chrome users loading the repository folder must reload the extension and refresh chat tabs after
pulling. Firefox uses a built Firefox ZIP (its manifest is installed as manifest.json); `dist/` is
ignored and is NOT downloaded by git pull. Build with Python or obtain a separately published
release asset. Extension inference itself needs neither Python nor a separate model download.

## Credential boundary regression

`node tests/credential_boundaries.test.js` checks exact original value spans, preserved surrounding
text, and the production CLI on credential, grouped identifier, address and coordinate cases.
`python tools/eval/credential_browser.py` runs the production content script and share preview
three times in Playwright Chromium. It checks all/off/amounts modes, raw-text sharing, and DOM
preview equality with the decrypted payload via fake relay messaging; no real shares are uploaded.
It also runs the existing maybe/range/hydration-sanitizer browser fixtures.
Requires Playwright and its Chromium browser. For interactive inspection, serve the repository
and open `/tests/fixtures/credential_review.html`; the result must begin with `PASS:`.

GitHub Actions is configured to run the Node suite and this browser regression separately;
remote execution must be checked after push. These checks do not measure multilingual NER
accuracy or verify logged-in vendor layouts. Bounded support now covers EN/ID digit-word OTP,
anchored letter-spaced email, integer Indonesian amounts, and six grouped IBAN countries
(DE/GB/FR/NL/ES/IT). This is not universal language or international identifier support.
Contextual detection excludes hard-identifier spans in the original text before numeric analysis.
Remaining work: comprehensive model holdout, full shared span arbitration/NER integration,
broader address/ID/command grammars, and real-site lifecycle verification.

Financial replacement tests include hyphen/slash/dot/Unicode identifiers containing a known
salary. Every financial base/derived regex replacement is checked at its actual match boundary,
not only at regex construction; solver numeric lexing uses the same boundary check. Heuristic
overlap tests verify that losing candidates cannot silently expose their sensitive remainder.
Browser fixture traffic is restricted to the temporary local server origin; external attempts fail.

The Chrome/Firefox model harness also prints nine development diagnostics (not held-out accuracy),
with additional EN names and benign security/technical sentences. Current runtime covers the two
ID name components as one span and suggests an entity on one benign EN technical sentence. Do not
interpret smoke success as a clean false-positive rate; model/thresholds remain unchanged pending
a real holdout.

## English-first positional evaluation

`python tools/eval/test_score.py` checks the evaluator and runs the production heuristic scanner
on `tests/fixtures/english_credentials.jsonl`, also loaded by the browser fixture. This is a
development regression corpus, NOT a held-out benchmark. `run_safeshare.js --heuristics-trace`
exports value-only edits, converting JavaScript UTF-16 positions to Python code-point offsets.
Unsupported trace/context transformations fail instead of inventing positions.

`score.py` rejects missing/duplicate/extra IDs and malformed or inconsistent edits. With edit
traces it reports full-span recall, character coverage, partial spans, exact-span P/R and changed
non-sensitive characters. The old value-absence/token-count scores remain labelled diagnostics
for cross-tool compatibility: they can pass a partial mask and must not support security claims.
Trace coverage does not prove resistance to arbitrary encoded re-emission or inference. Full
CLI/model/solver edit provenance and an independently annotated holdout remain unfinished.

## Cross-browser local model and banking review

Build fresh packages with `python tools/build_extension.py`. Chrome loads `extension/manifest.json`;
Firefox loads `manifest.json` from an extracted Firefox ZIP, not the Chrome source manifest.

- In both browsers, use fictional checking/savings/loan IDs and click each badge. Only the chosen
  ID should appear, across all its occurrences; card last-four digits must never become money ranges.
- Expiration `08/27` and the same month-name echo near card context should be hidden together.
  Unrelated conference dates and `[have address ready]` must stay unchanged.
- Click **Check names and other PII with local model** in the share dialog. It should report
  loading/checking, then checked, and add unchecked model suggestions. Check one to hide it.
- Model errors/timeouts must display unavailable status, not "no candidates" as if a scan succeeded.
  Re-run after changing the reviewed text. Do not interpret model scores as calibrated probabilities.

Automated real-browser checks (isolated temporary profiles, fictional data, no relay upload):
`python tools/eval/firefox_ner.py` uses installed Firefox and stdlib Marionette transport;
`python tools/eval/chrome_ner.py` uses an existing Playwright Chromium installation. These test
actual packaged ONNX/WASM inference and share-dialog ID clicks/model suggestions. They do not
prove held-out accuracy or verify the DOM of logged-in vendor sites.

## Experimental “Maybe sensitive” share review

Test in Chrome and Firefox, with both reader profiles. Use fictional data only.

- Open the share dialog on `access_token: OddSecret42` followed by an assistant echo of
  `OddSecret42`. Both should be hidden by one checked suggestion.
- Untick it: both reappear. Creating the link asks about visible possible credentials;
  cancelling must not upload anything. Recheck and publish: viewer text matches the preview.
- Try `Z8kL2mN7pQ4rS9tU6vW3xY`: suggestion starts unchecked. Docker `-p 8080:80`, Git hashes
  in Git commands and existing placeholders should not become suggestions.
- Use Tab/Space to operate checkboxes, including after the preview rebuild. Candidate labels
  announce the reason and count; focus stays on the checkbox. Long lists remain scrollable.
- Close and reopen: decisions reset. Disable the network: scanning still works; a failed
  publication unlocks controls without losing the review.

Automated checks: `node tests/maybe.test.js` (offline encrypt/decrypt with fake relay messaging)
and `node tools/eval/maybe.js` (fictional development screen, not held-out accuracy).

Real DOM self-check: serve the repository with `python -m http.server 8791 --bind 127.0.0.1`,
then open `http://127.0.0.1:8791/tests/fixtures/maybe_review.html`. It must end with `PASS`.
This fixture uses fake relay messaging and never uploads a share. It checks distinct amount
badges, reset, overlapping selections, numeric credentials, variable exclusions, checkbox focus,
control locking, failed-publication recovery and decrypted content against the actual DOM preview.
Run in Chrome and Firefox; this does not replace testing the installed extensions on chat sites.

On-screen sums: open `/tests/fixtures/hydration_sanitize.html` on that same server. It must end
with `PASS`: the site's own answer markup is kept, while `javascript:` / `data:` links, script,
svg, form and iframe tags, `on*` handlers and markup in formula text never reach the page.

For IDR range/toggle and formatting checks, open `/tests/fixtures/range_review.html` on that
same local server. It must report `PASS`: one KaTeX representation, readable headings/tables,
clickable ranges, revealed IDR amounts staying visible, and no buttons with unavailable originals.
Arithmetic LaTeX is simplified to readable text; full TeX layout is not supported. Revealing an
exact amount intentionally can make another hidden amount inferable.

Everything runs on your laptop with fake data. Tick each box; if something fails, note the site,
the test number and what you saw (a screenshot helps).

Automated tests cover the engine, relay, CLI and proxy: the current working-tree run ends with `47/47 passed` (the count includes the local license test).
This list covers what needs a real browser and your logged-in chat accounts.

## 0. Setup (once, ~5 min)

1. Start the local relay and leave the window open:
   ```bash
   python relay/server_local.py
   ```
2. Chrome → `chrome://extensions` → turn on **Developer mode** (top right) → **Load unpacked** →
   pick the `extension` folder of this repo (not a zip, not the repo root).
3. Point the extension at the local relay: on the SafeShare card click **service worker**, and in
   the console that opens run:
   ```js
   chrome.storage.local.set({ safeshare_relay: "http://127.0.0.1:8787" })
   ```
   (Back to Cloudflare later: `chrome.storage.local.remove("safeshare_relay")`.)
4. Open ChatGPT (also Claude, DeepSeek later) and **refresh the tab**.

After any code change: click the reload ↻ on the SafeShare card, then **close and reopen** the
chat tabs (an old copy keeps running in a tab that was open during the reload). Check the page
console (F12): it should say `[SafeShare-AI] Extension content script active (v2.4.1).` If you see
`[REDACTED_NIK]` instead of `[NIK_1]` in a sent message, the tab is still running old code.

Quick check without ChatGPT: `python -m http.server 8790 --bind 127.0.0.1` in the repo, open
`http://127.0.0.1:8790/tests/fixtures/fake_chat.html` in an Incognito window (the page loads the
current scripts itself; no name model there), type into the box and click Send.

Where to look when something is off: the chat page's console (F12) shows `[SafeShare-AI]` lines;
the name model's console is under the SafeShare card → **Inspect views: offscreen.html**.

## 1. Protection before sending (ChatGPT, then Claude and DeepSeek)

Use a **new chat** for each prompt. The chip above the input box shows what will happen; click it
to pick a mode. Keep **Protect IDs + amounts** unless the test says otherwise.

**1a. Personal details**

> Hi, I am Rina Kusuma and I live in Bandung. My wife Sarah and I want to plan our savings. My
> salary is $5,000 a month and my NIK is 3201012304950001. If we save 20%, how much per month
> and per year?

- [ ] While typing, the chip says "🛡️ 2 items will be protected" (salary + NIK)
- [ ] Your sent message reads roughly: "Hi, I am [NAME_1] and I live in [PLACE_1]. My wife
      [NAME_2] … salary is <S1> a month and my NIK is [NIK_1] …", followed by a
      "[PRIVACY PROTOCOL: Treat <S1> as an exact fixed parameter…]" note (that's what the AI received)
- [ ] If the names are still there and the chip briefly says "Sent without the name/place check
      (local model not ready)": the model was loading. Send another prompt and check again; note
      it if it keeps happening
- [ ] In the answer, `[NIK_1]` / `[NAME_1]` show the real values in blue with a dashed underline;
      hovering says "Only on your screen. The AI received [NIK_1]."
- [ ] Amounts in the answer show real computed numbers on your screen (e.g. $1,000 / $12,000)
- [ ] Under your own message: "🔒 N values protected · show". Clicking lists `[NIK_1] = …` and
      `<S1> = …`; your message itself keeps the placeholders, and the share dialog never shows the note

**1b. Fiction is left alone**

> Write a short story about Geralt travelling to Novigrad.

- [ ] Sent exactly as typed (no [NAME_…] / [PLACE_…])

**1c. Passwords and OTP**

> Password m-banking aku Sup3rRahasia9 kesimpen di notes. Tadi dapet OTP 482913 dari bank.

- [ ] Sent as "Password m-banking aku [PASSWORD_1] kesimpen di notes. Tadi dapet OTP [OTP_1] dari bank."

> I change my password regularly. Is that enough?

- [ ] Sent exactly as typed (prose is not a password)

**1d. Look-alike characters** (copy this exactly: the first `а` in the email is Cyrillic)

> Mail me at аlice@example.com or call +62 812 3456 7890.

- [ ] Sent as "Mail me at [EMAIL_1] or call [PHONE_1]."

**1e. A name late in a long message** (the model used to stop reading after ~100 words)

> Paste any ~200-word paragraph first (e.g. a news article), then add: "Also, my friend Sarah
> Connor needs advice."

- [ ] "Sarah Connor" is sent as [NAME_…]

**1f. Modes**

- [ ] Chip → **Protect amounts only**, send 1a again: NIK and names go through, the salary is <S1>
- [ ] Chip → **Off**: sent exactly as typed
- [ ] Open the SafeShare share dialog: its before-sending toggle matches the chip (off/on), and
      switching it changes the chip too

## 2. Sharing a chat

Sharing is tested on a chat that still has real values in it, so set the chip to **Off**, open a
new chat, send prompt 1a, wait for the answer, then click the **SafeShare** button.

- [ ] The dialog's "Original" side shows **both** your message and the answer, in order
- [ ] The redacted side hides Rina, Sarah, Bandung, the salary, the NIK, and the answer's derived
      amounts ($1,000 / $4,000 / $12,000 or whatever it computed)
- [ ] "20%" is still visible (ratios are kept on purpose)
- [ ] **Amounts → Show as range**: the salary becomes a band like "$5k–$10k"; derived amounts stay hidden
- [ ] **Reader → Someone I trust**: names and amounts come back; the NIK stays hidden
- [ ] **Customize Items** → untick one item: it reappears in the preview

Look-alike email in a share: chip **Off**, new chat, send 1d, click SafeShare:

- [ ] The email is hidden on the redacted side

A chat that was protected before sending (any chat from section 1 with the chip on):

- [ ] The dialog title says "Nothing new to hide · placeholders are kept as they are" (or hides
      only new things); the placeholders stay placeholders

## 3. The link

Back in the 1a share dialog (chip-Off chat), choose **Expires after: 24 hours** → **Create Private Link**.

- [ ] The link starts with `http://127.0.0.1:8787/v/`, and the relay window prints `Stored encrypted payload`
- [ ] Open it in a **normal** tab: the address changes to `chrome-extension://…/viewer/index.html?relay=…`
      and the card says "Opened inside the SafeShare extension…"
- [ ] Click **Open conversation**: the chat shows exactly the redacted version
- [ ] Open the same link in an **Incognito** window (extension off there): it stays on
      `127.0.0.1:8787`, says "Decrypted by this page, served by the relay…", and works after the click
- [ ] Before clicking **Open conversation**, nothing was fetched (relay window prints no `Retrieved`)
- [ ] In the dialog click **Revoke**, reload the link: gone

Burn-after-reading: make a new link with **Burn after 1 view**.

- [ ] First open + click: the chat shows. Reload: "Link Expired or Shredded"

## 4. Continue in a new chat

Make a fresh 24-hour link and open it in a normal tab (inside the extension), click **Open conversation**.

- [ ] Click **ChatGPT**: a new ChatGPT tab opens and, within a few seconds, the input box is filled
- [ ] The pasted text starts with "Continue an earlier conversation…" and contains placeholders, not real values
- [ ] Repeat with **Claude** and **DeepSeek**

## 5. Attacks from the command line (optional, no browser)

```bash
echo "[REDACTED_DATE] is a Tuesday, the day after my birthday on the 14th." | node bin/safeshare.js invert
```
- [ ] Lists 3 possible dates (the hidden date is recovered to a handful of days)

```bash
echo "I am the only female cardiologist at a 50-bed hospital in Blitar." | node bin/safeshare.js invert
```
- [ ] Prints a warning that the details together may point at one person

```bash
node bin/safeshare.js redact examples/chat_original.txt | node bin/safeshare.js invert
```
- [ ] "No hidden values recovered."

## 6. Firefox (optional)

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json` inside the
unzipped `dist/SafeShare-<version>-firefox.zip` (build it with `python tools/build_extension.py`).
Repeat 1a and section 3. Firefox supports the local name model; real-extension review showed
"Local AI model checked". Do not expect names to be skipped solely because this is Firefox.

### Verified follow-up checks

- `[UNIT]` Originals regression excludes existing placeholders while preserving real originals.
- `[UNIT]` Local relay HEAD reports share status without consuming burn shares; malformed JSON/TTL returns a stable error.
- `[REAL-EXT]` Isolated Firefox: publish, extension-viewer decrypt, originals, revoke and ZIP install passed.
- `[REAL-EXT]` Security modal has dialog semantics, focuses its close button, and returns focus to Security on close.
- Firefox viewer inspection used a temporary profile with `-remote-allow-system-access` and
  `extensions.webextensions.remote=false`. Privileged-script clicks are not evidence for the synthetic-click gate.
- `[BLOCKED]` Firefox before-send On remains unverified because the harness could not locate its menu option.
- `[FIXED 2.4.1]` ChatGPT first-message note disappearance: the temporary `local-chatgpt:<uuid>`
  mapping is promoted to the server UUID (live-verified across a reload). Re-run after future DOM
  changes.
- Escape/Tab focus handling and revised decrypt errors still need dedicated browser verification.

## Report back

For anything unticked: which site, which test, what happened. The chat sites change their page
structure often, so sections 1 and 2 are the most likely to need a fix.
