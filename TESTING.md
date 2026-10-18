# Manual test checklist (Chrome)

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

Automated tests cover the engine, relay, CLI and proxy: `npm test` should end with `35/35 passed`.
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
console (F12): it should say `[SafeShare-AI] Extension content script active (v2.4.0).` If you see
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
Repeat 1a and section 3. Expected difference: no name model in Firefox, so names in 1a are sent
as typed and the chip says "Sent without the name/place check".

## Report back

For anything unticked: which site, which test, what happened. The chat sites change their page
structure often, so sections 1 and 2 are the most likely to need a fix.
