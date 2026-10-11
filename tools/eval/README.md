# Evaluation harness

Compares SafeShare, Presidio and gitleaks on the same labelled data. Every tool writes
`{"id", "output"}` lines, and `score.py` scores only the redacted text, so any other tool
can be added the same way.

## Metrics

- **value recall**: share of gold PII values that no longer appear in the output.
- **token precision / recall / F1**: word level. A removed word inside a gold span is a hit;
  a removed word outside one is over-redaction.

## Quick check (synthetic, offline)

```bash
node tools/eval/run_safeshare.js tools/eval/sample_gold.jsonl > out_safeshare.jsonl
python tools/eval/score.py tools/eval/sample_gold.jsonl out_safeshare.jsonl
```

## Real held-out data

Gold format is the ai4privacy one: `source_text` plus `privacy_mask: [{value, label, start?, end?}]`.

1. Get a held-out split, for example 2,000 validation rows of
   [`ai4privacy/open-pii-masking-500k-ai4privacy`](https://huggingface.co/datasets/ai4privacy/open-pii-masking-500k-ai4privacy),
   saved as `gold.jsonl`. Filter by `language` to report English and other languages separately.
2. Install the baselines:
   ```bash
   pip install presidio-analyzer presidio-anonymizer
   python -m spacy download en_core_web_lg
   ```
   For gitleaks, install v8+ from its GitHub releases page.
3. Run and score:
   ```bash
   node tools/eval/run_safeshare.js gold.jsonl > out_safeshare.jsonl
   node tools/eval/run_safeshare.js gold.jsonl --presidio http://127.0.0.1:5002 > out_safeshare_presidio.jsonl
   python tools/eval/run_presidio.py gold.jsonl > out_presidio.jsonl
   python tools/eval/run_gitleaks.py gold.jsonl > out_gitleaks.jsonl
   python tools/eval/score.py gold.jsonl out_safeshare.jsonl out_presidio.jsonl out_gitleaks.jsonl
   ```

gitleaks only looks for secrets, so compare it on the credential labels only.

## Other datasets

- **IndoNLU NERGrit / NERP**: Indonesian names, places and organisations. Convert the BIO tags
  to `privacy_mask` spans and run the same commands.
- **WildChat**: real user-to-LLM chats with no PII labels. Use it to measure false positives:
  `node tools/eval/wildchat_fp.js 500 out.jsonl [--presidio URL [--names all]]` logs every
  redaction with context for hand-labelling.
- **Inversion in real chats**: `python tools/eval/wildchat_to_cache.py` (one WildChat shard,
  ~230 MB, kept local) then `node tools/eval/inversion_wild.js 20000`. Writes
  `data/inversion_wild_report.json`; see RESULTS.md section 6.
- **Labelling** for the "is this about the writer?" question: see `LABELLING.md` in the repo root.

Report every number, including the categories where SafeShare loses.
