# SafeShare-AI: Architecture Review & Answers to Research Questions

Review of `BLUEPRINT_SAFESHARE_DEFENSE.md`. Date: 2026-09-30.

## TL;DR

The "algebraic leak" is a known class of problem with a known fix. Tier 6 is the part a reviewer will attack first.

---

## Root cause: you redact values, but the leak is in the dependency graph

The LLM computed its output from the real salary, so every derived number is a function `f(secret)`. Redacting `s` while leaving `f(s)` visible is the same flaw as suppressing one cell in a table while publishing the marginal totals.

Statistical disclosure control solved this decades ago with **complementary (secondary) suppression**. Dinur–Nissim reconstruction and differencing attacks are the theory behind it.

**Design principle:** reveal only **scale-free quantities**.
- Safe without a base: percentages, ratios, year counts.
- Unsafe: absolute amounts in the same dependency class as the secret.

---

## Q1: Algebraic inversion defense

### Best approach: adversary-oracle loop (not a blocklist)

1. Lex every number into a span `(start, end, value, unit)`. Normalize ID and EN formats (`10.8 million`, `Rp10.800.000`, `10,8 juta`, `10.8M`).
2. Secrets `S` come from Tiers 1 and 2.
3. Run an attacker solver: can `s` be recovered from visible numbers using at most k multiplications or divisions, with small constants such as 12 and 100?
4. If yes, redact the smallest cut that breaks recovery (greedy hitting set). Redact absolute amounts first, keep percentages.
5. Loop until the solver fails.

```python
from fractions import Fraction as F
from itertools import product

CONSTS = {F(12), F(24), F(52), F(100)}

def recoverable(secret, visible, depth=2, tol=F(1, 100)):
    base = set(visible) | {v / 100 for v in visible} | CONSTS   # % -> ratio
    frontier = set(base)
    for _ in range(depth):
        frontier |= {op for a, b in product(frontier, base)
                     for op in (a * b, a / b if b else a)}
        if any(abs(x - secret) <= tol * secret for x in frontier):
            return True   # attacker wins -> widen redaction set
    return False
```

For the case study, `10.8M / 12 / 0.30` yields 3M at depth 2. Cap the frontier size or use meet-in-the-middle to keep it fast. The tolerance covers rounded figures like "10.8 million".

### Alternatives, ranked

| Approach | Verdict |
|---|---|
| Consistent counterfactual substitution | Replace `s` with fake `s' = s·k` (hidden random `k`) and recompute the whole dependency class coherently. Readable, and the recipient learns only `s'`. Costs truthfulness, so label values "illustrative". Do it at prompt-send time if the vendor is in your threat model. |
| Numerical DP noise | **Don't.** `10.8M`, `21.6M`, `54M` are deterministic multiples of one secret, so independent noise can be averaged out. You'd need correlated noise, which is the multiplicative mask above. |
| AST / symbolic evaluator | Use as the **checker** (step 3), not the sweeper. |

---

## Fixes for the five failure points

- **#1 / #2 Name and NIM:** Stop adding one regex per field. Detect structure: `^\s*<key>\s*[:=\-]\s*<value>` lines, plus a tiny fuzzy classifier on the key (char n-grams: name / nama / nim / npwp / no rek ...). **Fail closed:** an unknown key with an ID-like value gets flagged or prompts the user.
- **#3 Algebraic leak:** See Q1.
- **#4 Mangling:** This is a bug from regexing rendered text. Replace whole spans from the lexer, never substrings, so `32.4 million` is one token and `.4` can't be split off.
- **#5 Mislabeling:** Label by dependency cluster (`[AMT_A]`, `[AMT_B]`) or by table column header, not by whichever rule fired.

---

## Q2: Sub-5 MB contextual classification

- **Prune the vocabulary.** In distilbert-multilingual, roughly 90M of ~135M params (about 119k x 768) are the embedding matrix. Keep ~15-20k ID/EN tokens plus INT8 and you land around 25-35 MB with no architecture change.
- **Go span-level, not utterance-level.** Tiers 1 and 2 generate candidate spans, and a +/-5-token window is classified by a hashed char-n-gram model (fastText or a 1-layer CNN in WASM/JS). That is about 1-3 MB. "My salary" vs "average salary" is mostly lexical.
- **Distill from your DistilBERT.** Use it as a teacher to label unlimited unlabeled text and train the tiny student.
- **Bloom filters and Aho-Corasick** fit closed-set lookups (key vocabularies, known public benchmarks), not contextual judgment.
- **Optional:** download larger weights on first run into IndexedDB or OPFS. Weights are data, not code, which sits better with MV3 rules.
- **Verify your store-limit claim.** As I recall, Chrome Web Store and AMO package limits are well above 129 MB. Check before writing "exceeds store limits" in the paper. The real constraints are RAM, cold-start time, and install UX.

**Metrics red flag:** P = R = F1 = 1.0 with test loss 0.0003, followed by failure on the first real input. That pattern points to template leakage or artifacts in the contrastive dataset. Add an out-of-template, human-written, adversarial test set before publishing numbers.

---

## Q3: What a Black Hat Arsenal reviewer will value

**Recommendation: lead with (a) + (c) combined.** Frame it as "redaction is insufficient: derived-value inference", with an attack tool (the solver inverting redactions) and the defense. Arsenal favors working tools with a demo, and this has a clear attacker/defender story. Option (b) is the weakest: fragment-key encrypted notes are well-trodden (PrivateBin, Firefox Send).

### Weaknesses reviewers will raise

- **Watermark:** Zero-width characters are stripped by Unicode normalization or plaintext paste. Retyping, OCR, and screenshots bypass it entirely.
- **F12 detection:** Heuristic and bypassable. Anyone holding the link already has ciphertext and key, so they can decrypt with curl and a script.
- **Tamper guard = DoS:** Anyone with the link can trigger `/api/revoke` and burn it.
- **Burn-after-read vs. link unfurlers:** Slack/WhatsApp preview bots fetch the URL and can consume the note. Require a POST or user interaction before burning.
- **"Zero-knowledge" caveat:** The Worker serves the decryption JS, so a malicious operator can ship a backdoored client (the classic web E2EE trust problem). State it in the threat model, or serve the viewer from a pinned/extension context.
- **Hardening:** Bind note ID and expiry as AES-GCM AAD; pad ciphertext sizes.
- **Paper structure:** Include an explicit threat-model table (vendor, link holder, crawler, local malware) stating what each tier does and doesn't cover.

---

## Q4: Literature

### Verified by search

- **arXiv:2410.12443 (RAID 2025):** black-box LLM attacks recovered word-level-DP-sanitized text at roughly 72% to 94% across models, including ChatGPT-4o and Claude-3.5 Sonnet.
- **arXiv:2508.18976 (Meisenbacher et al., WPES @ CCS 2025):** LLM reconstruction can weaken DP-sanitized text, but can also be reused adversarially as a post-processing step to improve privacy.
- **arXiv:2412.12928 (Pilan et al., INTACT):** generates generalization candidates per span, tests them with LLM inference attacks, and keeps the most informative replacement that resists them. Conceptually close to the adversary-oracle loop above.

### From memory (verify before citing)

- Staab et al., "Beyond Memorization" (ICLR 2024): personal attribute inference.
- Mireshghallah et al., ConfAIde (ICLR 2024): contextual integrity.
- Pilan et al., TAB (Computational Linguistics 2022): text anonymization benchmark.
- Lukas et al. (IEEE S&P 2023): PII leakage in language models.
- Dinur & Nissim (2003) and Abowd's Census reconstruction work: theoretical grounding.

### Novelty note

I'm not aware of a paper on **numeric derived-value leakage after redaction**. That would be your novelty claim, but run a proper literature search before asserting it.
