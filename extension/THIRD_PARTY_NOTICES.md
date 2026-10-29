# Bundled components

Blackline (formerly SafeShare) project code is licensed under Apache-2.0; see the repository's root
`LICENSE` (also included as `LICENSE` in the extension ZIP). Copyright ownership
and third-party licenses are not changed by bundling.

## ONNX Runtime Web 1.30.0

Copyright (c) Microsoft Corporation. MIT License:
`licenses/ONNX-Runtime-MIT.txt`.

Source: https://github.com/microsoft/onnxruntime/tree/v1.30.0
Distribution: https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.30.0.tgz

The bundled files are byte-identical to these npm distribution files:

| Project path | Upstream path |
|---|---|
| `models/ort.min.js` | `dist/ort.wasm.min.js` (renamed only) |
| `models/ort-wasm-simd-threaded.mjs` | `dist/ort-wasm-simd-threaded.mjs` |
| `models/ort-wasm-simd-threaded.wasm` | `dist/ort-wasm-simd-threaded.wasm` |

The registry SHA-512 integrity was verified before comparing files. The complete
upstream v1.30.0 third-party notice collection is preserved verbatim in
`licenses/ONNX-Runtime-ThirdPartyNotices.txt`. It covers multiple runtime targets;
its inclusion does not mean every listed component is present in this WASM build.
Source references and component terms are retained in that file.

## English-focused PII model and vocabulary

Source: https://huggingface.co/gravitee-io/bert-small-pii-detection/tree/f8c27a85c51c0168f07b9dcf00265bf0a4097939

Upstream declares Apache-2.0 and identifies `prajjwal1/bert-small` as its base
model. License text: `licenses/Apache-2.0.txt`. The pinned repository lists no
standalone LICENSE or NOTICE file; this attribution reports its model-card
declaration rather than inventing an upstream copyright statement.

`models/model_q4.onnx` is the upstream INT8 `model.quant.onnx`, renamed for the
existing loader, not a Q4 conversion. Revision, weight hash and size are recorded
in `models/MODEL_INFO.json`. `models/vocab.txt` was compared byte-for-byte with
the same pinned revision and matches. `models/config.json` supplies model
configuration; see `MODELS_SETUP.md` in the repository for integration details.

This inventory is not a legal certification or an independent audit of the
upstream model's training-data rights. Third-party trademarks remain with their
respective owners.
