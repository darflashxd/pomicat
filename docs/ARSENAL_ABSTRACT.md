# SafeShare: redaction is broken for AI chats, and a browser extension that fixes the part it can

**Submission draft — presenter details and the exact form track still need confirmation.**
**License:** Apache-2.0 · https://github.com/darflashxd/safeshare

## Abstract

Redacting an AI conversation before sharing it does not hide what the AI worked out from it. Ask a
chatbot to budget a salary, mask the salary, and the reply still says "save 20% → $1,000 a month".
Any reader, or any other LLM, can work the salary back out. We measured this on 40 fictional chats:
an LLM attacker recovered the hidden salary from **100%** of naively redacted chats, and a
widely used PII tool (Presidio) left it visible in **100%**, because amounts are not "PII" to it.

SafeShare is a browser extension for ChatGPT, Claude and DeepSeek built around that threat.
Before sending, it can replace IDs, credentials, your own names and places, and amounts with
placeholders (`[NIK_1]`, `<S1>`), so the AI never receives them. The real values are shown back
only on your screen, in a closed shadow DOM the site's scripts cannot read, and the AI's formulas
over `<S1>` are computed locally. When sharing, the extension hides the values the AI derived from
the hidden ones too, runs the attacker against exactly what would be shared, and lists uncertain
items for review before creating an end-to-end encrypted, expiring link. The same LLM attacker
recovered **0%** from SafeShare's output; for hidden birth dates, weekday and "day after the 14th"
clues narrowed 40 of 40 naively redacted dates to four days or fewer, and none after SafeShare.

## Live demonstration (browser extension)

1. Type a salary and an ID into ChatGPT: the chip shows what will be protected; the AI receives
   `<S1>` and `[NIK_1]`, and its budget appears on screen with the real numbers.
2. Share the chat naively and let an LLM recover the salary from the derived figures.
3. Share it with SafeShare: derived amounts hidden, the built-in attack check passes, the original
   and the shared copy side by side.
4. Open the encrypted link (inside the extension), then show burn-after-read and revocation.
5. Show the limits: a misspelled currency, an unsupported encoding, a single-model result.

## Evaluation (all fictional data, reproducible from the repository)

| Attack on 40 chats | Naive redaction | Presidio | SafeShare |
|---|---|---|---|
| LLM attacker recovers the salary (one model, DeepSeek V4 Pro) | 100% | 100% (left visible) | 0% |
| Arithmetic attacker (`safeshare invert`) | 53% | 100% (left visible) | 0% |
| Hidden birth date narrowed to ≤ 4 days (EN + ID) | 40/40 | — | 0/40 |

- LLM and arithmetic attacks: `tools/attack_bench/RESULTS_LLM.md`, `tools/attack_bench/RESULTS.md`
- Dates: `tools/eval/RESULTS.md` §8 (run by `npm test`)
- Extension behaviour on the live sites: `TESTING.md`; model provenance: `MODELS_SETUP.md`

Replies are templated, one LLM attacker so far (more models planned), and the chats are fictional:
these results show the attack and the defence work, not how often real chats leak.

## Boundaries

The defence covers selected arithmetic transformations and date clues, not arbitrary encodings or
semantic inference. Before-send protection is off by default; the chat site still sees what is
typed in its box. The local name model is English-focused and its suggestions are unverified.
Anyone holding a full link can read the share; copy deterrence does not stop screenshots. A
command-line tool and an API proxy share the same rules but are not the focus of this demo.

## Presenters — complete before submitting

- Name, affiliation, short bio: **pending project owner**.
- Track, demo format, current event requirements: **confirm in the official submission form**.
