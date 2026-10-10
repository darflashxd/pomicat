# Model (research only)

The browser extension does **not** use a machine-learning model. Tier 2 ("contextual rules",
`extension/engine/contextual.js`) is regex-based and needs no download.

A DistilBERT token classifier (`distilbert-base-multilingual-cased`, 11 BIO labels) was
trained as an experiment. On its held-out split it scored:

| precision | recall | F1   | token accuracy |
|-----------|--------|------|----------------|
| 0.61      | 0.68   | 0.64 | 0.95           |

(`training/model_output/evaluation_metrics.json`.) That is not good enough to ship, so it isn't
shipped.

## Reproduce

```bash
pip install -r requirements.txt
python data/generate_dataset.py               # writes data/train.json, val.json, test.json (seeded)
python training/train_token_classifier.py     # writes training/model_output/best_model
python training/evaluate_model.py
python training/export_onnx.py                # optional: training/model_output/onnx
```

The generated data and the weights are not committed. The data script is seeded and produces
byte-identical files on every run.
