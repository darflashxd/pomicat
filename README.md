# SafeShare

Redaction leaks. SafeShare finds what the redaction left behind.

When you share an AI chat, removing the obvious secret is not enough. If you redact your salary
but the assistant's answer still says "saving 30% gives Rp 900.000 a month, Rp 10.800.000 a
year", anyone can work the salary back out: 10.800.000 / 12 / 30% = 3.000.000.

SafeShare is three things:

1. **An inversion attack** (`safeshare invert`) that recovers hidden numbers from chats that were
   already redacted by any tool.
2. **A redactor** that removes personal data and the derived numbers that would give it away,
   for ChatGPT, Claude and DeepSeek (browser extension) or any text (CLI, proxy).
3. **An encrypted share link.** The chat is encrypted in your browser with AES-256-GCM, and the
   key stays in the URL `#fragment`, which browsers do not send to the server. Links expire,
   can burn after one read, and can be revoked.

![demo](docs/demo.gif)

## Try the attack

```bash
git clone https://github.com/darflashxd/safeshare && cd safeshare
node bin/safeshare.js invert examples/chat_naive_redacted.txt
```

```
Most likely hidden value: Rp 3.000.000 (agreed by 3 visible numbers)
    Rp 900.000 / 30%
    Rp 2.100.000 / (100% - 30%)
    Rp 10.800.000 / 12 / 30%
```

Then redact with SafeShare and attack again:

```bash
node bin/safeshare.js redact examples/chat_original.txt | node bin/safeshare.js invert
# No hidden values recovered.
```

The attack looks for one value that several visible numbers agree on, using ratios found in the
text and common periods (months, weeks, quarters, years), and ranks candidates by how simple the
explanation is. It does the same for dates: a hidden birth date comes back from "I am 28" or
"I graduated in 2020 at 22" (`examples/chat_birthdate_naive.txt`). Use it on synthetic data or
data you own.

How often this happens in real chats is still open: in 20,000 WildChat conversations, people
almost never shared their own finances, and nothing leaked in the few that did
([details](tools/eval/RESULTS.md#6-does-the-inversion-attack-happen-in-real-chats-2026-10-11)).

## How redaction works

| Layer | What it does | Code |
|---|---|---|
| Pattern rules | Regex plus checksums: Indonesian NIK/NPWP/BPJS, cards (Luhn), IBAN, API keys, DB URIs, JWTs, seed phrases, shell prompts and home paths, 20+ national IDs | `extension/engine/heuristics.js` |
| Contextual rules | Separates "my salary" / "gaji saya" from "the average salary" / "rata-rata gaji". Rule-based, no ML model. | `extension/engine/contextual.js` |
| Inversion defense | Normalises numbers across formats (`10,8 juta`, `10.8M`, `Rp 10.800.000`), then removes visible numbers derivable from a redacted one through the supported arithmetic (ratios, per-period amounts, projections, sums and differences). Ratios such as 30% are kept, because on their own they reveal nothing. | `extension/engine/pseudonymizer.js` |

Redacted values become consistent placeholders (`[REDACTED_FINANCIAL_1]`) across the whole
conversation, so the chat still reads naturally.

## Threat model

| Who | What they can do | What SafeShare does |
|---|---|---|
| Search engines and crawlers (Google dorking) | Index any share page they find a link to | The server and the page only hold ciphertext; the key is in the `#` part of the link, which browsers never send. `noindex` headers on every response. |
| Scrapers guessing links | Try share IDs in bulk | IDs are random UUIDs (122 bits), and reads are rate-limited per IP. |
| Anyone who gets the full link (forwarded, pasted in a public channel) | Read the shared chat | Redaction before sharing, so there is little to read; burn after one view, expiry, and revoke limit how long it's readable. |
| A reader doing arithmetic on the shared chat | Recover a redacted amount from the numbers around it | The inversion defense removes figures derivable through the supported arithmetic; `invert` checks the result. |
| The relay operator (Cloudflare, or whoever deploys it) | See ciphertext, IP addresses, timing, sizes | Can't read content. Metadata is visible. |
| The AI vendor | See whatever you send it | Before-sending protection replaces IDs and amounts (`<S1>`) while you chat; names are still sent. |

**Out of scope:** malware or a compromised browser on your machine, a recipient who screenshots
the page, and what the vendor already received before you installed SafeShare. The viewer's
anti-copy features are deterrence only, not protection.

### "Didn't the vendors fix this?"

After shared chats showed up in search results in 2025, vendors removed "make discoverable"
options and added `noindex`. That stops search listings, but a vendor share link is still a page
that serves the whole plaintext chat to anyone holding the link, stored by the vendor and usually
without expiry. Shared links get forwarded, pasted into public channels and archived. SafeShare
removes the personal details (including derivable numbers) before anything is shared, encrypts so
the host can't read it, and lets links expire.

## Measured accuracy

Full method and per-label numbers: [tools/eval/RESULTS.md](tools/eval/RESULTS.md).

| | ai4privacy token F1 | real chats touched (WildChat) | hidden salary recoverable |
|---|---|---|---|
| SafeShare alone | 0.21 | 7.8% | no |
| SafeShare + Presidio, `names: personal` (default) | 0.31 | 8.8% | no |
| SafeShare + Presidio, `names: all` + dates | 0.78 | 71% | no |
| Presidio alone | 0.79 | – | yes |

- **Alone, SafeShare CLI is not a general PII detector.** It is rule-based and has no
  named-entity recognition; the browser extension adds a local MiniLM Q4 NER model
  (14 MB, runs in-page) for names and addresses, arbitrated against technical spans.
  With `--presidio` the CLI uses Presidio for names, places, phones and IDs, and with
  every name and date turned on it matches Presidio (0.78 vs 0.79) while also blocking
  the inversion attack. The extension's MiniLM alone scores token F1 0.85 on ai4privacy
  (`tools/eval/RESULTS_SOTA.md`). That is the raw model on a benchmark: in a chat the extension
  uses it only before sending (Chrome) and only for the writer's own names and places, and the
  share dialog doesn't use it. The "0% false positives" there is on a technical hard-negative set
  only, not real chats.
- **Benchmarks and real chats disagree about names.** ai4privacy labels every name as PII; real
  chats are full of names that aren't the user's (celebrities, story characters, authors). Turning
  all names on touches 71% of real conversations. The default, `names: personal`, only redacts a
  name or place tied to the user ("my wife Rina", "I live in Bandung") and touches 8.8%.
- Deciding whether a name or number belongs to the user is the part that needs a trained
  model; the `names: personal` rules are the stopgap.
- The test suite in `tests/` is a regression suite written alongside the rules, not an accuracy
  measurement.

## Limits

- Detection is rule-based plus a local NER model in the extension (MiniLM Q4; see
  [MODELS_SETUP.md](MODELS_SETUP.md)). Phrasing the rules don't cover will be missed; the
  NER covers names/addresses but not dates. A DistilBERT classifier was also trained as an
  experiment and scored F1 0.64 on held-out data, so it isn't shipped.
- Social-media handles in casual phrasing ("follow me at @name") are not caught.
- The chat site sees what you type before you press send: protection before sending rewrites the
  message on send, but the site's own scripts (analytics, session replay) can read the text box
  while you type. Values shown again on your screen are kept from the site's scripts for IDs,
  names and places (closed shadow DOM), but restored amounts are ordinary page text. Other
  extensions that can read all sites can read everything too.
- Share links open inside the extension when it's installed, so the relay can't change the page
  that holds the key. Without the extension, the relay's page decrypts the chat, and you trust
  whoever runs the relay not to change it (`dist/SHA256SUMS` lists the page's files for
  comparison).
- Anyone holding the full link can read the share. The viewer's anti-copy features (glyph
  scrambling, zero-width watermark, DevTools check) are deterrence only: a screenshot defeats them.
- Not covered yet: text inside images, cookies in pasted HAR files, combinations of
  quasi-identifiers (job + city + company size).

## Install

### Browser extension (Chrome, Edge, Brave, Firefox)

Download the zip from [Releases](https://github.com/darflashxd/safeshare/releases), or use
the `extension/` folder directly.

- **Chrome / Edge / Brave:** open `chrome://extensions`, turn on Developer mode, click
  "Load unpacked" and choose the `extension/` folder (or an unzipped Chrome release zip).
- **Firefox:** use the Firefox release zip (it has Firefox's manifest). Unzip it, open
  `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on" and choose its
  `manifest.json`. The `extension/` folder itself is set up for Chrome.

Open chatgpt.com, claude.ai or chat.deepseek.com and click the SafeShare button to review the
redactions and create a link.

The share dialog also lists **Maybe sensitive** credential suggestions. Values assigned to a
credential-like key start checked for both reader profiles; random-looking strings without that
context start unchecked. Each choice applies to exact occurrences across both roles. Suggestions
are local and unverified, not proof a credential works or that all secrets were found. No candidate
values or choices are saved. The encrypted turns contain only the reviewed roles and text, never
internal detection metadata. Click **Check names and other PII with local model** to add local
MiniLM suggestions on Chrome or Firefox. Model suggestions start unchecked; their experimental
scores are not calibrated probabilities. A visible status distinguishes a checked review from a
failed/unrun model check. CLI and proxy do not use this model.

### CLI and library (Node 18+, no dependencies)

```bash
node bin/safeshare.js redact chat.txt
node bin/safeshare.js invert redacted.txt        # exit code 2 if something was recovered
node bin/safeshare.js share chat.txt --burn --ttl 3600 --relay http://127.0.0.1:8787
```

`npm link` (or `npm i -g .`) installs it as `safeshare`.

Input is plain text with `User:` / `Assistant:` lines, or a JSON array of `{role, content}`.

```js
const { redactTurns, invert } = require("safeshare-ai"); // after npm install <path-to-repo>
```

### Proxy for LLM APIs

```bash
node bin/safeshare.js proxy --port 8788 --upstream https://api.openai.com
# then point your SDK at http://127.0.0.1:8788/v1
```

The proxy redacts message text for OpenAI Chat Completions (`/chat/completions`), OpenAI
Responses (`/responses`: `input`, `instructions`, and tool outputs) and Anthropic Messages (`/messages`:
`messages`, `system`). Requests without a body (e.g. `GET /v1/models`) pass through. Any other
request with a body (embeddings, legacy completions, files, ...) is refused with a 403 rather
than forwarded unredacted. Only text parts are redacted (not images or files), and responses
are not restored.

### Who will read it, and how to show amounts

| | `--profile public` (default) | `--profile trusted` |
|---|---|---|
| Keys, IDs, cards, contacts | removed | removed |
| Your own amounts and anything derived from them | removed (or a range) | kept |
| Your name, family, places tied to you | removed | kept |

`--numbers range` shows your own amounts as a band instead of a placeholder: "Gaji saya
Rp 3.000.000" becomes "Gaji saya Rp 2–5 juta". Derived figures stay removed, and the range is
only used if `invert` can't recover the original from it. The extension has the same two
choices ("Reader" and "Amounts") in the share dialog.

### Advanced (CLI only): Presidio for names, places and IDs

SafeShare works without this. It's an optional extra for the CLI and proxy when you also want
general name and address detection, and it's what the evaluation numbers above use.

```bash
pip install presidio-analyzer && python -m spacy download en_core_web_lg
python tools/presidio_server.py                      # or the official presidio-analyzer Docker image
node bin/safeshare.js redact chat.txt --presidio http://127.0.0.1:5002
```

In a policy file: `"presidio": { "url": "...", "names": "personal" | "all", "skip": ["DATE_TIME", "NRP", "URL"] }`.
Presidio's default model is English, so Indonesian names are only caught by SafeShare's own
rules ("nama saya …"). The browser extension can't use Presidio (it's Python); a small name
model running inside the browser is on the roadmap instead.

### Policy file

```json
{
  "profile": "public",
  "numbers": "range",
  "presidio": "http://127.0.0.1:5002",
  "preset": "pci",
  "disable": ["SYSTEM"],
  "allow": ["support@acme.com", "/^ACME-INTERNAL-\\d+$/"],
  "rules": [{ "id": "ACME_TICKET", "pattern": "ACME-\\d{6}", "replacement": "[TICKET]" }]
}
```

Pass it with `--policy policy.json` to `redact`, `share` or `proxy`. Presets (`pci`, `hipaa`,
`gdpr`) limit redaction to the relevant categories. They help with scoping; they are not
compliance certifications.

## Relay

The relay stores ciphertext only.

- **Local / offline:** `python relay/server_local.py` serves the API and the viewer on
  `http://127.0.0.1:8787`.
- **Cloudflare:** step-by-step in [DEPLOY.md](DEPLOY.md) (free plan, about 15 minutes).

API: `POST /api/share` `{id (UUID), ciphertext, ttl, burn_on_read}` returns a `revoke_token`.
`GET /api/share/:id` returns the ciphertext. `POST /api/revoke/:id` `{token}` deletes the share.

Limits: shares up to 512 KB, 10 uploads and 60 reads per minute per IP (both relays), and
expired shares are deleted daily.

## Development

```bash
npm test                                   # all tests in tests/
python data/generate_dataset.py            # regenerate the synthetic training data (seeded)
python tools/build_extension.py            # dist/SafeShare-<version>-chrome.zip and -firefox.zip
python tools/make_demo_gif.py              # docs/demo.gif (start relay/server_local.py first for the share step)
```

```
bin/        CLI, library entry point, proxy
extension/  browser extension (engine/, ui/)
extension/viewer/  share-link page (served by the relay, and opened inside the extension)
relay/      Cloudflare Worker, D1 schema, local Python relay
examples/   synthetic chats for the demo
tests/      regression tests
tools/      evaluation harness (tools/eval), benchmarks, demo scripts
training/   DistilBERT experiment (not shipped)
docs/       Arsenal abstract; docs/archive has older notes
```

See [DEMO.md](DEMO.md) for the booth walkthrough.

## License

Apache 2.0
