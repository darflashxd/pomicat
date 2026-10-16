# Related Work

## Why sharing AI chats leaks (threat backdrop)

In 2025–2026, share links from ChatGPT (~4,500 chats indexed; feature removed
1 Aug 2025), Grok (370,000+ chats indexed) and Claude (hundreds of chats incl.
resumes and health details; indexing blocked Jul 2026) all ended up in search
engines. Vendors removed the "discoverable" options, but a share link remains a
page serving full plaintext to anyone holding it, forwardable and archivable by
third parties. SafeShare redacts before sharing, encrypts so the host can't read
it, and lets links expire.

## Redaction is not enough (prior failures)

* **Bland et al. 2022** — glyph positions break PDF text redaction: unredacted
  character positioning recovers redacted names. Same theme (redaction leaves
  something behind), different mechanism (layout vs arithmetic).
* **Staab et al. 2023/2024** — LLMs infer personal attributes from given text.
  Adjacent but distinct: Staab is *semantic* inference by an LLM from unredacted
  text; SafeShare's `invert` is *algebraic* reconstruction of a hidden number
  from visible derived figures, deterministic and LLM-free.

## Log and code redaction (over-redaction problem)

* **Zhou et al. 2024** — redacting diagnostic logs faces the same over/under
  redaction tradeoff SafeShare meets on WildChat and CLI text. SafeShare's answer
  is the Tier-0 technical veto (`extension/engine/span_arbiter.js`) plus
  context-gated rules.

## SOTA comparators

* **Presidio** (Microsoft) — default recognizers + `en_core_web_lg`; our baseline
  (F1 0.79 on ai4privacy). SafeShare+Presidio matches it (0.78) while also
  blocking `invert`.
* **gitleaks 8.30.1** — secrets-only baseline (0.00 on ai4privacy PII).
* **GLiNER-bi-small** (zero-shot span matcher) — strong third party: F1 0.74 on
  the same 2000 rows, no training.
* **OpenAI Privacy Filter / PRvL (2025–2026)** — newer LLM-based redactors;
  cited as SOTA to watch, not yet benchmarked here.

Full numbers: `tools/eval/RESULTS.md`, `tools/eval/RESULTS_SOTA.md`.
