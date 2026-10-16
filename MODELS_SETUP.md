# Models: what ships and what doesn't

## Shipped: MiniLM Q4 NER (browser extension only)

The extension runs a local token-classification model in-page via `offscreen.js`
(ONNX WASM, zero network egress):

* Backbone: 6-layer MiniLM, hidden 384, fine-tuned for 35 PII labels
  (`GIVEN_NAME`, `SURNAME`, `EMAIL`, `PHONE`, `STREET_NAME`, `CITY`, … — see
  `training/model_output/minilm_q4/config.json`).
* Vocabulary pruned to 19,730 tokens → `model_q4.onnx` is **14.01 MB**.
* Only name/address labels reach the share flow; each span passes
  `extension/engine/span_arbiter.js` (Tier-0 technical veto + per-label
  confidence thresholds + technical-density bypass).
* Measured: token F1 **0.85** on ai4privacy EN 2000
  (`tools/eval/RESULTS_SOTA.md`). CLI `redact` does not use this model;
  use `--presidio` there for general name detection.

## Research only: DistilBERT token classifier

A DistilBERT token classifier (`distilbert-base-multilingual-cased`, 11 BIO labels) was
trained as an experiment. On its held-out split it scored:

| precision | recall | F1   | token accuracy |
|-----------|--------|------|----------------|
| 0.61      | 0.68   | 0.64 | 0.95           |

(`training/model_output/evaluation_metrics.json`.) That is not good enough to ship
as a general detector, so it isn't shipped. The SOTA comparison (electra, mMiniLMv2,
DeBERTa fine-tunes, GLiNER) is documented in `tools/eval/RESULTS_SOTA.md`:
synthetic-only fine-tuning does not transfer to real PII data.

## Reproduce (DistilBERT experiment)

```bash
pip install -r requirements.txt
python data/generate_dataset.py               # writes data/train.json, val.json, test.json (seeded)
python training/train_token_classifier.py     # writes training/model_output/best_model
python training/evaluate_model.py
python training/export_onnx.py                # optional: training/model_output/onnx
```

The generated data and the weights are not committed. The data script is seeded and produces
byte-identical files on every run.
