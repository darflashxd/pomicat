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
explanation is. Use it on synthetic data or data you own.

## How redaction works

| Layer | What it does | Code |
|---|---|---|
| Pattern rules | Regex plus checksums: Indonesian NIK/NPWP/BPJS, cards (Luhn), IBAN, API keys, DB URIs, JWTs, seed phrases, shell prompts and home paths, 20+ national IDs | `extension/engine/heuristics.js` |
| Contextual rules | Separates "my salary" / "gaji saya" from "the average salary" / "rata-rata gaji". Rule-based, no ML model. | `extension/engine/contextual.js` |
| Inversion defense | Normalises numbers across formats (`10,8 juta`, `10.8M`, `Rp 10.800.000`), then removes every visible number that can be derived from a redacted one. Ratios such as 30% are kept, because on their own they reveal nothing. | `extension/engine/pseudonymizer.js` |

Redacted values become consistent placeholders (`[REDACTED_FINANCIAL_1]`) across the whole
conversation, so the chat still reads naturally.

## Measured accuracy

Full method and per-label numbers: [tools/eval/RESULTS.md](tools/eval/RESULTS.md).

| | SafeShare | Presidio |
|---|---|---|
| General PII, ai4privacy held-out English (token F1) | 0.21 | 0.79 |
| Precision on what it does redact (token) | 0.97 | 0.93 |
| Hidden salary recovered by `invert` after redaction (example chats) | no | yes |

- **SafeShare is not a general PII detector.** It catches emails, SSNs, cards, keys and
  credentials well, but has no named-entity recognition, so most names, cities and addresses are
  missed. Run Presidio (or similar) for those, and SafeShare for derived numbers.
- **On real chats** (500 WildChat conversations), 6.4% got at least one redaction, and roughly a
  third of those redactions were correct. The rest are over-redaction (fiction character names,
  research-paper health terms, numbers in maths walkthroughs).
- The test suite in `tests/` is a regression suite written alongside the rules, not an accuracy
  measurement.

## Limits

- Detection is rule-based. Phrasing the rules don't cover will be missed. A DistilBERT model
  was trained and scored F1 0.64 on held-out data, so it isn't shipped ([MODELS_SETUP.md](MODELS_SETUP.md)).
- Social-media handles in casual phrasing ("follow me at @name") are not caught.
- Anyone holding the full link can read the share. The viewer's anti-copy features (glyph
  scrambling, zero-width watermark, DevTools check) are deterrence only: a screenshot defeats them.
- Not covered yet: text inside images, cookies in pasted HAR files, combinations of
  quasi-identifiers (job + city + company size).

## Install

### Browser extension (Chrome, Edge, Brave, Firefox)

Download the zip from [Releases](https://github.com/darflashxd/safeshare/releases), or use
the `extension/` folder directly.

- **Chrome / Edge / Brave:** copy `extension/manifest.chrome.json` over `extension/manifest.json`
  (the default manifest is the Firefox one), open `chrome://extensions`, turn on Developer mode,
  click "Load unpacked" and choose the `extension/` folder. The Chrome release zip already has
  the right manifest.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on" and
  choose `extension/manifest.json`.

Open chatgpt.com, claude.ai or chat.deepseek.com and click the SafeShare button to review the
redactions and create a link.

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

### Proxy for OpenAI-compatible APIs

```bash
node bin/safeshare.js proxy --port 8788 --upstream https://api.openai.com
# then point your SDK at http://127.0.0.1:8788/v1
```

Every chat message is redacted before it leaves your machine. Responses are not restored.

### Policy file

```json
{
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
- **Cloudflare:** `cd relay && npx wrangler d1 execute safeshare-db --remote --file schema.sql && npx wrangler deploy`.
  If you are upgrading an existing database, run `ALTER TABLE shares ADD COLUMN revoke_hash TEXT;`.

API: `POST /api/share` `{id (UUID), ciphertext, ttl, burn_on_read}` returns a `revoke_token`.
`GET /api/share/:id` returns the ciphertext. `POST /api/revoke/:id` `{token}` deletes the share.

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
viewer/     share-link viewer page
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
