# English candidate comparison — development experiment

Date: 2026-10-19. **Recommendation: advance BERT-small INT8 to a larger independent evaluation;
do not replace the shipped MiniLM yet.** No production model/config/runtime was changed.

## Assets

| Model | Revision | Weight bytes | All downloaded bytes |
|---|---|---:|---:|
| Shipped MiniLM Q4 | local baseline; hash recorded in report | 14,693,379 | existing bundle |
| gravitee-io/bert-small-pii-detection | f8c27a85c51c0168f07b9dcf00265bf0a4097939 | 28,732,710 | 29,694,212 |
| knowledgator/gliner-pii-edge-v1.0 | 9b7f39b0a2da971a5beea78d35f1539d4009c891 | 45,820,894 | 49,446,607 |

Both candidate cards declare Apache-2.0; provenance and distribution notices still need final review
before bundling. Downloads live outside the repository in the approved OpenCode temporary folder.
`manifest.json` records exact URLs/revisions, byte counts and SHA-256. No remote repository code
is executed. Existing installed Python dependencies were used, no packages added.

## Protocol and limitations

30 manually authored fictional short EN examples: 20 positive, 10 negative, 22 gold entities.
This is **development data, not an independent holdout** and not representative accuracy.
Corpus: `tests/fixtures/model_comparison_en.jsonl`, SHA-256
`5bf951116188281c42c212af39a9dafed97c64776941a2c8d0fb858c605f4d53`.

- Common labels: PERSON, LOCATION, EMAIL, PHONE (14 gold entities). First/last-name and address
  components are canonically merged across adjacent whitespace/commas. Metrics are after this
  normalization, not each model's native entity schema.
- All-label comparison also includes PASSWORD, BANK, SECRET and IP. MiniLM does not support all
  these labels, so this column measures coverage of the task, not a like-for-like architecture win.
- MiniLM uses the production JS tokenizer and native ONNX logits, argmax BIO decoding, no review
  alternative floor. This is not the full extension's permissive review policy.
- BERT uses its own local HF tokenizer, argmax BIO decoding; short inputs are never silently
  truncated. GLiNER uses eight fixed labels and threshold 0.3, not tuned to this corpus.
- Full coverage requires same-label coverage of all annotated characters; exact span P/R also
  penalizes wrong labels, over-wide spans and partial matches. Non-mapped labels are excluded.
- Native runs use one ONNX CPU thread. GLiNER timing includes library preprocessing/decoding and
  its load measurement includes an initial session followed by the controlled one. Timings are
  descriptive single-machine samples, not a rigorous throughput benchmark.

Windows 11, Intel Core i7-14650HX (16 cores/24 logical), Python 3.12.4,
onnxruntime 1.28.0, transformers 5.16.1, gliner 0.2.29, numpy 2.4.6.

## Native CPU results (latest rerun)

| Model | Common exact P/R/F1 | Common full coverage | False spans on 10 negative examples | All mapped F1 | Warm p50/p95 ms |
|---|---|---:|---:|---:|---:|
| MiniLM Q4 | .560 / 1.000 / .718 | 14/14 | 6 | .596 | 32.2 / 54.4 |
| BERT-small INT8 | 1.000 / 1.000 / 1.000 | 14/14 | 0 | .905 | 20.3 / 33.1 |
| GLiNER Edge UINT8 | .733 / .786 / .759 | 11/14 | 11 | .444 | 114.5 / 154.6 |

Negative-example false spans use all mapped labels; common-label counts differ (GLiNER: 1).
BERT still misses the Redis CLI password/IP example and labels the API key as PASSWORD instead
of SECRET. Rules remain necessary. GLiNER has not had label/threshold tuning: these results do
not establish that the model family is intrinsically worse.

## Browser WASM compatibility

All three graphs loaded using the extension's existing ONNX JS/WASM files in local browser pages,
with one thread. Same **pre-tokenized input**, four runs per model; no complete browser candidate
tokenizer/decoder/extension integration. External page requests were blocked.

| Model | Chromium load ms | Chromium warm runs ms | Firefox load ms | Firefox warm runs ms |
|---|---:|---|---:|---|
| MiniLM | 529.5 | 28.0, 27.8, 25.2 | 658 | 199, 201, 205 |
| BERT-small | 388.8 | 9.5, 8.8, 9.1 | 573 | 88, 88, 88 |
| GLiNER Edge | 598.4 | 42.6, 46.4, 45.8 | 1451 | 488, 501, 486 |

WASM outputs matched native within checked tolerance. Maximum logit deltas: MiniLM 0.000009,
BERT 0.001757, GLiNER 0. Winning token labels matched exactly for both token classifiers on this
one input. This is not equivalence validation across the evaluation corpus. Peak RAM, long-window
accuracy, lower-end hardware, extension packaging size and full pipeline utility remain unmeasured.

## Reproduce

Use an isolated Python environment with the package versions above; scripts also require torch,
Playwright and installed Chromium/Firefox browsers. Install no dependencies into production.

```powershell
python tools/eval/download_candidates.py "$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison"
python tools/eval/model_comparison.py "$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison" --output "$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison\report.json"
python tools/eval/candidate_wasm.py "$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison" --output "$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison\wasm.json"
python tools/eval/candidate_wasm.py "$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison" --browser firefox --output "$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison\wasm-firefox.json"
python tools/eval/test_model_comparison.py
```

Next gate: independent EN corpus, per-label and hard-negative evaluation, long messages, memory,
native/WASM corpus equivalence, then a temporary candidate extension with correct tokenizer and
label policy. No automatic promotion, extra compression, production deployment or accuracy claim.

## Follow-up: 500 external synthetic documents and disposable extensions

Gretel dataset `gretelai/gretel-pii-masking-en-v1`, test split, pinned revision
`e06eb1499ca8d54470f085021cd8e54f9efac7fd`, Apache-2.0. Deterministic shuffled selection
(seed 20261019): 500 documents with supported annotations, 963 canonical common-label entities.
Selection IDs, domains and parquet SHA-256 are written to `external-selection.json` BEFORE scoring.
No thresholds tuned on these results. **This dataset is synthetic and previously used in model
authors' published evaluations; training overlap is unknown. It is NOT an unseen independent holdout.**

| Model | Exact P | Exact R | Exact F1 | Full-value coverage | Partially covered entities | p50/p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| MiniLM | .471 | .655 | .548 | .670 | 242 | 92.5 / 280.1 |
| BERT-small INT8 | .933 | .971 | .952 | .978 | 13 | 75.9 / 251.4 |

Common labels only: PERSON/LOCATION/EMAIL/PHONE; no claims on medical/secret/financial categories.
Both models process all overlapping 128-token windows (up to 10 windows in this selection).
MiniLM external evaluation uses a reference BERT tokenizer, unlike the initial development test's
production JS tokenizer; do not compare these tables as identical protocols. Annotation values are
expanded to their text occurrences and adjacent components are canonicalized. Counts are document
entities, not 500 independent statistical trials. Dataset is not a benign negative-control set.

Sampled native process RSS (not isolated peak or browser RAM): MiniLM 835.5 MB before / 858.2 MB
after load / 869.9 MB maximum sampled; BERT 856.7 / 880.8 / 893.3 MB. Python/torch/transformers
and previous model allocations share this process, so these values cannot establish model memory
cost or a release memory budget.

### Tokenizer and extension integration

- Disposable copied extensions only: `candidate_extension.py` replaces weights/vocab/config,
  adjusts native special token IDs, dynamic label count and model input names. No production
  model file changed. MiniLM's permissive alternative-label review floor is NOT transferred.
- Experimental coarse label adapter maps BERT PERSON to GIVEN_NAME and LOCATION to CITY.
  This preserves the existing consumer contract for smoke tests, but is not a final semantic policy.
- 508 inputs (8 targeted including Unicode/long text + 500 external documents) matched HF
  token IDs and overlapping windows exactly. Offset tests check UTF-16 bounds, not exact subword
  offset parity: production tokenizer intentionally assigns whole-word spans to subwords.
- Actual candidate Chrome offscreen and Firefox background inference/messaging/share-dialog
  controls passed. First attempt correctly failed because BERT does not accept token_type_ids;
  disposable adapter now sends only declared graph inputs.
- 3,699-character message: names at beginning AND end covered in both models/browsers.
  Warm candidate inference ~270 ms Chrome / 272 ms Firefox, baseline ~470 / 456 ms, one test run.
- On the tiny nine-example diagnostics the candidate removes the EN technical false suggestion,
  but introduces 2 and 3 suggestions on the two benign ID sentences where baseline had zero.
  Full names are one span, not separate first/surname spans; compare coverage, not component count.

Reproduce additional checks:

```powershell
python tools/eval/external_candidate_eval.py "$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison" --output "$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison\external.json"
python tools/eval/test_candidate_tokenizer.py "$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison" --external-count 500
$env:SAFESHARE_CANDIDATE_DIR="$env:LOCALAPPDATA\Temp\opencode\safeshare-model-comparison"
python tools/eval/chrome_ner.py
python tools/eval/firefox_ner.py
Remove-Item Env:SAFESHARE_CANDIDATE_DIR
```

Decision remains **do not promote automatically**. Evidence supports an English-first candidate
trial, not multilingual replacement. Still needed: independent annotated EN holdout, hundreds of
benign controls, exact offset/whole-corpus native-WASM equivalence, isolated browser memory,
real-site lifecycle and end-to-end candidate publication review. Existing production regression
checks do not prove those remaining gates.
