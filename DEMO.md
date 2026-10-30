# English demo: review, attack, defend, share

About five minutes. Fictional data only. Keep an offline fallback; vendor sessions and venue
Wi-Fi are not prerequisites for showing the arithmetic attack or local encrypted sharing.

## Preparation

```bash
npm test
python tools/eval/test_score.py
python tools/build_extension.py
python relay/server_local.py
```

Leave the relay running on `http://127.0.0.1:8787`. Load the matching Chrome/Firefox package,
reload the extension and refresh existing chat tabs. Model assets are bundled. Confirm the
installed commit and model hash before rehearsing; don't quote a fixed suite count.

For the browser workflow, choose a fictional prepared chat on a site verified on that day.
Keep **before-send protection Off**: Share Privately is the main feature. If using the local
relay, configure the extension's relay override as described in TESTING.md. Starting a local
server does not change the extension's default hosted destination.

## 1. Show the sharing workflow (45 seconds)

Open Blackline on a short English chat. Check both user and assistant turns were extracted.
Show automatic redactions, optional model suggestions, and a manual redaction of an unknown
format. Explain: "The preview is what the recipient will receive. The model is English-focused;
an empty scan is not proof of safety."

If no logged-in site is available, use the local browser self-check:

```bash
python -m http.server 8791 --bind 127.0.0.1
```

Open `/tests/fixtures/credential_review.html` on that server. Label this as a **fixture using
production scripts and fake relay messaging**, not a live ChatGPT integration. It demonstrates
review/payload equality; it does not create a recipient link.

## 2. Explain the arithmetic leak (60 seconds)

Open `examples/chat_naive_redacted_en.txt`:

```text
User: My salary is <SALARY> a month. If I save 20%, how much is that per month and per year?
Assistant: Saving 20% means $1,000 per month, leaving $4,000 for expenses.
           Over a year that adds up to $12,000.
```

```bash
node bin/safeshare.js invert examples/chat_naive_redacted_en.txt
```

Leading result: `$5,000`, supported by the three visible calculations. Show that alternatives
are also printed. Say: "The correct salary is the leading candidate in this constructed example.
These are ranked hypotheses, not proof that every candidate is the user's private value."

The command returns a nonzero status when it finds recovery candidates; that is expected here.

## 3. Redact the supported clues (45 seconds)

```bash
node bin/safeshare.js redact examples/chat_original_en.txt | node bin/safeshare.js invert
node bin/safeshare.js redact examples/chat_original_en.txt --numbers range
```

The first command prints `No hidden values recovered.` Explain: "This attacker did not recover
a value after the supported clues were removed. That is not a universal anonymity claim."
Range mode retains a budget band, not the original exact salary. Deliberately revealing another
amount can make a hidden value inferable again.

## 4. Open a real local encrypted link (90 seconds)

```bash
node bin/safeshare.js share examples/chat_original_en.txt --burn --ttl 3600 --relay http://127.0.0.1:8787
```

1. Open the printed link; the page must first show **Open conversation**.
2. Click it and verify both redacted turns are readable.
3. Reload the page and click Open again: ciphertext should be unavailable after the first read.
4. For revocation, create a second share without `--burn`, run its printed revoke command, and
   confirm it cannot be opened. Shell quoting differs on Windows; rehearse the exact command.

Do not copy full links or revoke tokens into screenshots, public logs or bug reports. All content
here is fictional, but the link still grants access. The fragment key is not sent in HTTP requests.
Without the extension, the hosted page decrypts and its operator must be trusted. With the extension
on a supported origin, decryption uses the extension viewer. The two trust paths are different.

### What a search crawler sees (30 seconds)

In 2025, shared ChatGPT conversations turned up in Google results: a ChatGPT share is a plain
page. A Blackline link, for a chat or a Word document, keeps its key after the `#`, which
browsers and crawlers never send to the server. Use a share **without** `--burn` (fetching the API reads the share once):

```bash
curl -s -A "Googlebot/2.1" "http://127.0.0.1:8787/s/<id>" | grep -o '<meta name="robots"[^>]*>'
curl -s -A "Googlebot/2.1" -D - "http://127.0.0.1:8787/api/share/<id>" | grep -iE "x-robots-tag|ciphertext"
```

The page is an empty viewer marked `noindex`; the API returns only ciphertext, marked `noindex`.
`npm test` checks the same thing for chat and document links (`tests/relay_lifecycle.test.js`):
no plaintext or key in the page, the API or the relay's storage. Say "search engines can't read or index it", not "links are
private": anyone holding the full link, `#` part included, can open it until it expires.

## 5. Show a limit, not a perfect score (40 seconds)

```bash
node tools/attack_bench/english.js
```

Point out both negative-control guesses and the encoded-annual cases. Numbers unrelated to a
person can still produce a recovery hypothesis. Base64 annual values are outside the numeric
defense in this experiment and remain recoverable by the separate decoder attacker.

"We defend supported transformations and provide review/manual redaction. We do not claim to
recognize every secret, encoding or semantic inference. A recipient can keep a screenshot."

## Fallbacks and questions

- No network/login: use the fixture and CLI/local relay; state the limitation explicitly.
- Relay unavailable: attack and redaction examples require only Node, no network or model.
- Model unavailable: show the failure state, not a clean-result claim; rules/manual review remain.
- Port busy: choose another local port with `SAFESHARE_PORT`; pass the same origin via `--relay`.
- Model question: BERT-small INT8, bundled English-focused ONNX WASM; see MODELS_SETUP.md.
- Accuracy question: distinguish model datasets, pipeline regressions, and attack experiments.
  No single F1 measures the security of the complete sharing workflow.
