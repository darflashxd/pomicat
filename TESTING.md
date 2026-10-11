# Manual test checklist

Everything here runs on your laptop. Tick each box; if a step fails, note the site, the step,
and what you saw (a screenshot of the browser console helps).

Automated tests cover the engine, relay, CLI and proxy: `npm test` should print `24/24 passed`.
This list covers what needs a real browser and your logged-in chat accounts.

## 0. Setup (once, ~5 min)

1. Build the extension: `python tools/build_extension.py`
2. Start the local relay (keep it running): `python relay/server_local.py`
3. Chrome: open `chrome://extensions`, turn on **Developer mode**, **Load unpacked**, and pick a
   folder where you unzipped `dist/SafeShare-<version>-chrome.zip`.
4. Point the extension at your local relay instead of Cloudflare. On `chrome://extensions`, under
   SafeShare click **service worker**, and in that console run:
   ```js
   chrome.storage.local.set({ safeshare_relay: "http://127.0.0.1:8787" })
   ```
   To go back to Cloudflare later: `chrome.storage.local.remove("safeshare_relay")`

## 1. Reading the chat (do on each site: ChatGPT, Claude, DeepSeek)

Paste this as your message in a new chat (it's fake data):

> Hi, I'm Rina Kusuma and I live in Bandung. My wife Sarah and I want to plan our savings. My
> salary is $5,000 a month and my NIK is 3201012304950001. If we save 20%, how much per month and
> per year?

- [ ] Before sending, the chip above the input says "🛡️ 2 items will be protected" (salary + NIK); click it to see the three modes
- [ ] After sending, your message in the chat shows `<S1>` and `[REDACTED_NIK]`, and the answer shows real computed numbers on your screen
- [ ] After the answer arrives, the SafeShare button appears on the page
- [ ] Clicking it opens the dialog, and **both** your message and the answer are in "Original"
- [ ] The right side hides Rina, Sarah, the salary, the NIK, and the assistant's $1,000 / $4,000 / $12,000
- [ ] "20%" is still visible (ratios are kept on purpose)

## 2. The share dialog options

- [ ] **Amounts → Show as range**: the salary becomes "$5k–$10k"; $1,000 / $4,000 / $12,000 stay hidden
- [ ] **Reader → Someone I trust**: names and amounts come back; the NIK stays hidden
- [ ] Set it back to **Anyone with the link** / **Remove**, close and reopen: your last choice is remembered
- [ ] **Customize Items** → untick one item: it reappears in the preview

## 3. The link

- [ ] Pick **Expires after: Burn after 1 view** (or 24 hours), click **Create Private Link**
- [ ] The link starts with `http://127.0.0.1:8787/v/` and the relay window prints `Stored encrypted payload`
- [ ] Open it in a **private window**: the chat shows exactly the redacted version
- [ ] Burn mode: reload, and the link says expired / not found
- [ ] 24-hour mode: create another link, click **Revoke** in the dialog, reload the link: gone

## 4. Continue in a new chat (the fixed feature)

Open a fresh (non-burn) link in a **normal** window (where the extension is installed):

- [ ] Click **ChatGPT**: a new ChatGPT tab opens and, within a few seconds, the input box is filled
- [ ] The pasted text starts with "Continue an earlier conversation…" and contains placeholders, not real values
- [ ] Repeat with **Claude** and **DeepSeek**
- [ ] Send it: the model continues without asking for or guessing the hidden values

In a window **without** the extension, clicking a platform copies the prompt and opens the site;
paste it manually.

## 5. Firefox (optional)

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json` inside the
unzipped `dist/SafeShare-<version>-firefox.zip`. Repeat sections 1 and 3.

## 6. Agents / API (optional, needs an OpenAI-compatible API key)

```bash
node bin/safeshare.js proxy --port 8788 --upstream https://api.openai.com
```

Point any OpenAI SDK at `http://127.0.0.1:8788/v1` and send a message containing the fake NIK and
key from section 1. In the proxy's upstream request (or the model's reply) the values are
placeholders. The reply is not mapped back to the real values yet.

## Report back

For anything unticked: which site, which step, what happened. The page structure of the chat
sites changes often, so section 1 is the most likely to need a fix.
