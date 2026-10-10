# Booth demo (about 5 minutes, works offline)

Everything below runs on the laptop. No wifi, no real chat site, no real personal data.

## Before the session

```bash
npm test                          # 22/22 should pass
python relay/server_local.py      # leave running: relay + viewer on http://127.0.0.1:8787
```

Have open: a slide or screenshot of shared AI chat links showing up in search results (blur
anything real), and a terminal in the repo root.

## 1. The leak (30 s)

"Share links from ChatGPT, Grok and others ended up in search engines in 2025. People pasted
salaries, health details and keys into chats they thought were private."

Show the slide.

## 2. Redaction isn't enough (60 s)

```bash
cat examples/chat_naive_redacted.txt
```

"The salary was redacted, the way most tools do it: find the entity, mask it. But the assistant's
answer is still there."

## 3. The inversion attack (60 s)

```bash
node bin/safeshare.js invert examples/chat_naive_redacted.txt
```

It prints `Rp 3.000.000` with three independent derivations (900k / 30%, 2.1M / 70%,
10.8M / 12 / 30%). Then the English version:

```bash
node bin/safeshare.js invert examples/chat_naive_redacted_en.txt
```

"Three visible numbers agree on one hidden value. That's the secret."

## 4. SafeShare blocks it (60 s)

```bash
node bin/safeshare.js redact examples/chat_original.txt > /tmp/safe.txt
cat /tmp/safe.txt
node bin/safeshare.js invert /tmp/safe.txt
```

The derived amounts are gone too, the 30% ratio is kept because a ratio alone reveals nothing,
and the attack prints `No hidden values recovered.`

## 5. Encrypted, burn-after-read link (60 s)

```bash
node bin/safeshare.js share examples/chat_original.txt --burn --ttl 3600
```

Open the printed link in the browser and show the redacted chat. Point at the URL: "The key is
after the #. Browsers never send that part to the server, so the relay only stores ciphertext."

Reload the page: the link is gone (burned).

## 6. The honest part (30 s)

Open "Security" in the viewer. "Once text is on someone's screen they can screenshot it. We
don't pretend otherwise. What we control is what's in the text and how long the link lives."

## If someone asks

- **"Does it use AI?"** No. Detection is rules plus the inversion solver. We trained a
  DistilBERT model and it scored F1 0.64, so it isn't shipped (`MODELS_SETUP.md`).
- **"How accurate is it?"** Show `tools/eval/README.md` and the numbers from the held-out run.
- **"Can I use it without the browser?"** `safeshare proxy` sits in front of any
  OpenAI-compatible API and redacts messages before they leave.

## Fallbacks

- Relay won't start: steps 1 to 4 need only Node.
- Port 8787 busy: set `SAFESHARE_HOST` or free the port; the CLI takes `--relay <url>`.
