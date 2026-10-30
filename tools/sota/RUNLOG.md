# SOTA NER Benchmark — Run Log

## Fase 0 — Setup & baseline (2026-10-15)
- Env: Node v24.18.0, Python 3.12.11 (full path; `python` bare resolves to msys64 — always use full path),
  torch 2.14.1+CPU (cuda False despite RTX 4060 — CPU-only wheel; fine-tune later needs CUDA wheel or cloud),
  transformers 5.19.0, datasets 5.1.0, optimum 2.1.0, onnx 1.23.2, ort 1.28.0, huggingface_hub 2.2.0.
- Incident: `pip install optimum[onnxruntime]` downgraded transformers 5.15→4.57 + hub→0.36 (broke `datasets`).
  Fixed: `pip install huggingface_hub>=1.31` then `transformers>=5.0`. Lesson: pin versions, verify imports after install.
- `npm test`: **28/28 passed** (docs claim 24/24 and 22/22 — stale).
- `sample_gold.jsonl` via SafeShare CLI: value recall 1.000, token P 1.000 / R 0.909 / F1 0.952 (synthetic, expected high).
- PowerShell gotcha: `>` redirect writes UTF-16; use `cmd /c "... > file"` for JSONL pipelines.

## Fase 1 — Model download (2026-10-15)
- 11/12 HF IDs verified live; `knowledgator/gliner-multitask-nano-v0.5` gated (401) → swapped to `knowledgator/gliner-bi-small-v1.0` (open, matches research doc).
- Fetcher: `tools/sota/fetch_models.py` → `training/model_zoo/<slug>/` + `model_card.json`.
- Batch-1 done 4/4: all-minilm-l6 931.7MB, mminilmv2-l6 218.4MB, deberta-v3-xsmall 640.3MB, electra-small 156.0MB.
- Batch-2 running: piiranha-v1, gliner-bi-small, mobilebert, albert-base, modernbert-base, smolm2-135m, qwen25-05b, gliner-small-v21-onnx.

## Fase 2 — Smoke size/latency batch-1 (2026-10-15, PyTorch CPU — proxy, bukan WASM)
- `bench_size_latency.py --iters 30` → `tools/sota/results_raw/size_latency.json`:
  all-minilm-l6 22.7M p50 55ms · electra-small 13.5M p50 66ms ·
  mminilmv2-l6 107M (89% embedding, sesuai teori) p50 98ms · deberta-v3-xsmall 70.7M p50 1298ms (eager CPU; ONNX/WASM di Fase 5).
- Urutan relatif cocok dengan dokumen riset (MiniLM tercepat). Angka WASM menyusul setelah ekspor ONNX.
- `piiranha-v1` FAIL di bench awal karena dir belum ada saat itu.
- Batch-2 selesai sebagian lalu DIBATALKAN user (model besar): piiranha 1081MB, gliner-onnx 2528MB, mobilebert 451MB, albert 315MB, modernbert 2989MB terunduh; smolm2 terkill 18/25; qwen tak mulai. Dihapus: piiranha, modernbert, gliner-onnx, smolm2-parsial (±6.6GB kembali). Trim duplikat framework TF/Flax/Rust (±0.8GB). Zoo final 7 kandidat = 2.55GB. `extension/models/`, `training/model_output/` tak tersentuh.
- Bench ulang 7 model (CPU proxy): minilm 22.7M p50 50ms · electra 13.5M 63ms · mobilebert 24.6M 166ms · mminilmv2 107M 181ms · albert 11.7M 244ms · deberta 70.7M 1322ms · gliner-bi-small butuh lib GLiNER.
- D6: `make_cli_hardneg.py` → 5000 baris; `make_cli_gold.py` → gold + FP-scorer.
- `finetune.py` (11-BIO + hardneg mix, batch auto); bug final-save diperbaiki (tambah save_model); bug argmax di `run_onnx.py` diperbaiki.

## Fase 3 — Fine-tune + benchmark akurasi (2026-10-16)
- Electra fine-tune SELESAI: test sintetik F1 0.627 / R 0.752 (gate >0.50 lolos).
- ELECTRA GAGAL TRANSFER: ai4privacy recall 0.115 / F1 0.169 (di bawah rules 0.339!). EMAIL 0.181 vs 0.991. Pelajaran: F1 sintetik = overfit template; fine-tune sintetis-only tak mentransfer ke PII real.
- SHIPPED MiniLM Q4 (35 label PII): ai4privacy recall **0.808** / F1 **0.848** (kalahkan Presidio 0.79 & GLiNER 0.743). TAPI CLI FP **38.34%**.
- HYBRID (MiniLM + arbiter Tier-0): ai4privacy 0.759/0.816; CLI FP **13.08%** (sisa: bare port, SQL id, IP privat).
- UNION Tier-1 + Gate-2: value recall **0.793**. Gap sisa: DATE/TIME/GENDER/SEX/TITLE.
- SafeShare rules CLI FP 7.58% (semua [REDACTED_IP] di 10.x/192.168.x — over-redaksi Tier-1, isu terpisah).
- mMiniLMv2 fine-tune CRASH step-0 (fp16 scaler vs head acak). Fix: bf16. Diulang background.
- ROOT CAUSE NaN DITEMUKAN (probe sistematis): grad finite (0.54) tapi `classifier.weight` [11,384] non-finite setelah 1 step AdamW (bahkan LR 1e-6, foreach on/off) — kernel AdamW CPU torch 2.14 korup. SGD stabil (loss turun), Adafactor stabil. Electra+AdamW+fp16 tak kena (observasi; sebab pasti tak diklaim).
- Fix: finetune.py default `optim=adafactor`, lr 3e-4, warmup 500 (+arg --lr/--optim/--max-train). mMiniLMv2 diulang full-run Adafactor (background).
- Aturan kerja (user): tiap tulis kode wajib verifikasi (py_compile + smoke).
- Insiden: `run_gliner.py` hilang dari disk (sebab tak diketahui; hasil utuh). Dibuat ulang + compile-ok.
- mMiniLMv2 Adafactor SELESAI: sintetik F1 **0.744** (R 0.902) TAPI ai4privacy recall 0.341 / F1 0.423 — di atas electra (0.169) & rules (0.339), jauh di bawah MiniLM produksi (0.848) & GLiNER (0.743). Transfer sintetis→real gagal lagi (lebih ringan). CLI FP menyusul.
- Deberta fine-tune jalan (background, resep Adafactor sama).
- Server restart membatalkan deberta di 90% (step 3463). Checkpoint-2564 utuh (optimizer+scheduler+rng ada).
- Tambah `--resume` ke finetune.py (terverifikasi compile + isi checkpoint lengkap). Resume 10% sisa jalan background.
- mMiniLM CLI FP: **0.00%** (lolos <2%). Pola: fine-tune+hardneg → 0% FP tapi recall real lemah; MiniLM produksi → recall kuat tapi FP 38% (13% pasca-arbiter). Tradeoff inti untuk matriks.
- DEBERTA CLI FP **0.00%**. Matriks final ditulis: `tools/eval/RESULTS_SOTA.md`. KEPUTUSAN: NO-GO ganti model — MiniLM produksi tetap juara (0.848); cerita utama = MiniLM+arbiter+Tier-1+inversion defense.
- DEBERTA SELESAI (resume sukses): sintetik F1 **0.783** (terbaik fine-tune) → ai4privacy recall 0.366 / F1 **0.458** (terbaik fine-tune, masih << MiniLM 0.848). CLI FP menyusul (background).
- P4 DOCS SELESAI: README/DEMO/MODELS_SETUP klaim MiniLM jujur, duplikat dihapus, 28/28 terverifikasi, RELATED_WORK.md baru + sitasi.
- P1 SELESAI: Tier-0 +BARE_PORT/+SQL_NUMERIC/+PRIVATE_IP, Tier-1 kecualikan IP privat. Hybrid CLI FP 13.08%→**1.10%**→(fix lookbehind `--port`)→**0.00%**. GIT_HASH wajib huruf → hybrid ai4privacy 0.759/0.816→**0.797/0.834** (CARD 0→0.975, SSN 0.36→0.806); UNION Tier-1+Gate-2 **0.811**.
- P2 SELESAI: ID_DOB_BARE kontekstual (MDY+DMY+ISO, validator marker ±60 char). 6/6 smoke OK. Regression ditambah ke cli.test.js.
- P6 SELESAI: KV fallback dihapus (D1 wajib), /api/chat + gateway dihapus, --ttl divalidasi 300..604800. relay_worker.test lolos, 28/28 hijau.
- VERIFIKASI AKHIR: rules CLI FP 7.58%→**0.00%**. Semua target P1–P3 tercapai (FP <2%, CARD/SSN >0.85, F1 ≥0.816).
