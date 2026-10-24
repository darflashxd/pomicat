# Models: what ships and what doesn't

## Shipped: BERT-small INT8 NER (browser extension only, English-focused)

The extension runs a local token-classification model via `offscreen.js`
(ONNX WASM, zero network egress):

* Source: `gravitee-io/bert-small-pii-detection`, revision
  `f8c27a85c51c0168f07b9dcf00265bf0a4097939`, upstream `model.quant.onnx` (Apache-2.0 as declared
  by the upstream model card). 51 BIO labels, 30,522-token uncased BERT vocabulary.
* Weight file: **28,732,710 bytes**, SHA-256
  `b227845ff4989c9f7383874b841895dfbdb9a4d7a20ceb39c3f187271894bf2a`.
  Legacy filename `models/model_q4.onnx` is retained for loader compatibility; contents are INT8,
  not Q4. No external weight files or runtime download required.
* Chrome/Chromium runs it in an offscreen document; Firefox runs the same WASM code in its
  background page. Assets use absolute extension URLs. Loading failures can be retried.
* Before sending, only name/address labels are used, and only the writer's own ("my wife Rina", "saya tinggal di
  Bandung", same rule as the CLI's `--presidio`); they become `[NAME_1]` / `[PLACE_1]`. Each span
  first passes `extension/engine/span_arbiter.js` (Tier-0 technical veto + per-label confidence
  thresholds on the softmax probability + technical-density bypass).
* The share dialog has an explicit **Check names and other PII with local model** button. It
  examines the rules-redacted review text and adds unverified suggestions. It uses winning BIO
  labels only, not the old MiniLM non-O alternative floor. These scores are NOT calibrated
  probabilities. Span confidence uses the minimum contributing token score; review choices and
  contextual scoring determine protection, so a suggestion is not proof of a secret.
  Technical protected spans and existing placeholders are excluded. No model is trained from clicks.
* Before-send requests time out after 30 seconds; share review allows 60 seconds per turn. UI
  reports model failure instead of treating it as an empty successful scan. Review must be rerun
  after the underlying text changes. The rules still work without model inference.
* Real runtime smoke: Firefox 158 and Chromium 149 loaded the packaged ONNX/WASM assets,
  returned entity spans through extension messaging, and passed real share-dialog ID/Maybe checks.
  Reproduce: `python tools/eval/firefox_ner.py`, `python tools/eval/chrome_ner.py` (latter uses an
  already installed Playwright). Temporary isolated profiles; fictional data, no relay uploads.
* English model: non-English and mixed-language quality is not assured. The runtime does NOT
  skip whole messages based on word-count language guesses. Rules cover supported formats only,
  not every name/address in other languages. Successful empty inference means checked, not safe.
* Historical MiniLM raw-model measurement: token F1 **0.85** on ai4privacy EN 2000
  (`tools/eval/RESULTS_SOTA.md`). CLI `redact` does not use this model;
  use `--presidio` there for general name detection.
  The new review floor, conservative span scores and before-send policy need independent accuracy
  and calibration evaluation. Runtime smoke proves execution, not general detection accuracy.

## Research only: DistilBERT token classifier

English candidate experiment (2026-10-19): BERT-small INT8 and GLiNER PII Edge UINT8 were
compared with historical MiniLM. BERT was subsequently promoted in commit `47ede77`. External
synthetic test results are not an independent holdout or a full pipeline accuracy estimate. See
[MODEL_COMPARISON.md](tools/eval/MODEL_COMPARISON.md) for metrics, scripts and limitations.

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
# Redistribution notices

Bundled runtime/model attribution and full license texts are in
[`extension/THIRD_PARTY_NOTICES.md`](extension/THIRD_PARTY_NOTICES.md) and
`extension/licenses/`. Release ZIPs also include the project's root `LICENSE`.
The runtime JS/MJS/WASM match the npm 1.30.0 distribution; only the JS filename
was changed. These notices do not establish rights to upstream training data.
