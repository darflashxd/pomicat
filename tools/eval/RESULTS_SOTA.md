# NER model comparison (2026-10-16)

Same gold data for every row: ai4privacy EN 2000 (`tools/eval/data/ai4privacy_en.jsonl`,
seed 1337) and the CLI hard-negative set of 5000 (`data/cli_hardneg_gold.jsonl`). Scored with
`tools/eval/score.py`. English first, since most users and comparison tools are English.

**What these numbers are not.** They measure each model on these two datasets. They are not the
extension's behaviour in a chat: before sending, the extension keeps only names/places tied to the
writer (so far fewer hits than "MiniLM + arbiter" here), and the share dialog doesn't use the model
at all. See "Four different numbers" below.

## ai4privacy EN 2000 (value recall / token F1)

| Model | Recall | F1 | Notes |
|---|---|---|---|
| MiniLM Q4, shipped until `47ede77` (35 PII labels) | **0.808** | **0.848** | Above Presidio (0.79); weak on DATE/TIME (covered by the Tier-1 ID_DOB_BARE rule) |
| MiniLM Q4 + Tier-0 arbiter (after the GIT_HASH-must-have-a-letter fix) | 0.797 | 0.834 | CARD 0 → 0.975, SSN → 0.806 |
| MiniLM Q4 + Tier-0 arbiter (before that fix) | 0.759 | 0.816 | Thresholds + veto removed CARD/SSN (left to Tier-1) |
| Tier-1 rules + MiniLM (union) | **0.811** | n/a | Combined recall, best of both per label |
| GLiNER-bi-small, zero-shot | 0.678 | 0.743 | No training; generic labels |
| DeBERTa-xsmall, fine-tuned on synthetic data | 0.366 | 0.458 | Synthetic F1 0.783; didn't transfer |
| mMiniLMv2, fine-tuned on synthetic data | 0.341 | 0.423 | Synthetic F1 0.744; didn't transfer |
| SafeShare rules only | 0.167 | 0.339 | EMAIL / SSN / CARD only |
| Electra, fine-tuned on synthetic data | 0.115 | 0.169 | Synthetic F1 0.627; didn't transfer at all |

The arbiter rows were measured with raw-logit scores. `extension/offscreen.js` now passes softmax
probabilities to the arbiter's thresholds (as they were meant to be), so these two rows need
re-measuring.

## CLI hard-negative set, 5000 (false-positive rate, target < 2%)

Only on this set: technical text (logs, code, configs) with no personal data. It is not a
false-positive rate on real chats; for that see the WildChat numbers in `RESULTS.md`.

| Model | FP rate |
|---|---|
| Electra / mMiniLM / DeBERTa fine-tuned (+ hard negatives) | **0.00%** |
| MiniLM + arbiter (final) | **0.00%** (13.08% → 1.10% → 0.00% with Tier-0 BARE_PORT / SQL / PRIVATE_IP) |
| SafeShare rules (final) | **0.00%** (7.58% → 0.00% by excluding private IPs) |
| SafeShare rules (before) | 7.58% (left: private IPs 10.x / 192.168.x) |
| MiniLM + arbiter (before) | 13.08% (left: bare ports, SQL ids, private IPs) |
| MiniLM raw | 38.34% |

## CPU latency at 128 tokens (relative order only; WASM in the browser differs)

MiniLM 50 ms · electra 63 ms · mobilebert 166 ms · mMiniLMv2 181 ms · albert 244 ms · deberta 1322 ms (eager PyTorch).

## Decisions

1. **Keep the shipped MiniLM.** No candidate beat it on real English PII. Fine-tuning on
   synthetic data alone did not transfer; that is the main lesson, reported as is.
2. Supported by these numbers: MiniLM F1 0.848; the arbiter cut CLI false positives from 38% to
   0% on the hard-negative set; Tier-1 rules cover cards/SSNs; the inversion defense leaves no
   salary recoverable (`RESULTS.md`). GLiNER is a strong zero-shot comparison (0.743).
3. Follow-ups (not blockers): DATE/TIME through a date recognizer; multilingual tests.
4. Replace `extension/models/`? **No**: there is no better model. The 2.55 GB model zoo can be
   deleted except for reproducibility.

## Four different numbers

| Number | What it measures | Where |
|---|---|---|
| Raw model | MiniLM alone on ai4privacy (F1 0.848) | this file |
| Simulated hybrid | MiniLM + arbiter + Tier-1 offline on ai4privacy (0.834 / union 0.811 recall) | this file |
| Before sending | Extension in Chrome: rules + MiniLM, writer-tied names/places only | not measured yet |
| Share path | Share dialog: rules + contextual names, no MiniLM | CLI numbers in `RESULTS.md` are the closest |

Reproduce with the scripts in `tools/sota/`.
