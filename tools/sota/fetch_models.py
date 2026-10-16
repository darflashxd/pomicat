#!/usr/bin/env python3
"""Download SOTA ultra-compact NER/PII candidates to training/model_zoo/ (gitignored).

Usage: python tools/sota/fetch_models.py [--only slug1,slug2]

Writes training/model_zoo/<slug>/ + model_card.json per model.
Resumable (snapshot_download). Failures don't abort the batch.
"""
import json
import os
import sys
import time

from huggingface_hub import snapshot_download

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root via tools/
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ZOO = os.path.join(REPO, "training", "model_zoo")

# hf_id, local slug, role in the benchmark matrix
MODELS = [
    ("sentence-transformers/all-MiniLM-L6-v2", "all-minilm-l6", "baseline-current"),
    ("nreimers/mMiniLMv2-L6-H384-distilled-from-XLMR-Large", "mminilmv2-l6", "reco-1"),
    ("microsoft/deberta-v3-xsmall", "deberta-v3-xsmall", "reco-2"),
    ("iiiorg/piiranha-v1-detect-personal-information", "piiranha-v1", "teacher-sota"),
    ("google/electra-small-discriminator", "electra-small", "ultralight"),
    ("knowledgator/gliner-bi-small-v1.0", "gliner-bi-small", "span-matcher-small"),
    ("onnx-community/gliner_small-v2.1", "gliner-small-v21-onnx", "span-matcher-big-negative"),
    ("google/mobilebert-uncased", "mobilebert", "negative-qat-risk"),
    ("albert/albert-base-v2", "albert-base", "negative-latency"),
    ("answerdotai/ModernBERT-base", "modernbert-base", "negative-size"),
    ("HuggingFaceTB/SmolLM2-135M-Instruct", "smolm2-135m", "negative-causal"),
    ("Qwen/Qwen2.5-0.5B-Instruct", "qwen25-05b", "negative-causal"),
]


def card_for(dest, hf_id, role, seconds, size_mb):
    cfg_path = os.path.join(dest, "config.json")
    params, vocab, tok = None, None, None
    try:
        with open(cfg_path, encoding="utf-8") as f:
            cfg = json.load(f)
        arch = (cfg.get("architectures") or [cfg.get("model_type", "?")])[0]
        hidden = cfg.get("hidden_size")
        layers = cfg.get("num_hidden_layers")
        vocab = cfg.get("vocab_size")
        tok_files = [f for f in os.listdir(dest) if f.startswith("tokenizer") or f in ("vocab.txt", "spiece.model")]
        tok = ",".join(sorted(tok_files)) or None
        card = {"hf_id": hf_id, "role": role, "architectures": arch,
                "hidden_size": hidden, "num_layers": layers, "vocab_size": vocab,
                "tokenizer_files": tok}
    except Exception as e:
        card = {"hf_id": hf_id, "role": role, "config_error": str(e)[:200]}
    card.update({"download_seconds": round(seconds, 1), "size_mb": round(size_mb, 1)})
    with open(os.path.join(dest, "model_card.json"), "w", encoding="utf-8") as f:
        json.dump(card, f, indent=2)
    return card


def dir_size_mb(path):
    total = 0
    for dp, _, fns in os.walk(path):
        for fn in fns:
            try:
                total += os.path.getsize(os.path.join(dp, fn))
            except OSError:
                pass
    return total / (1024 * 1024)


def main():
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    os.makedirs(ZOO, exist_ok=True)
    summary = []
    for hf_id, slug, role in MODELS:
        if only and slug not in only and hf_id not in only:
            continue
        dest = os.path.join(ZOO, slug)
        t0 = time.time()
        try:
            snapshot_download(repo_id=hf_id, local_dir=dest, resume_download=True)
            card = card_for(dest, hf_id, role, time.time() - t0, dir_size_mb(dest))
            print(f"[OK] {slug} {card.get('size_mb')} MB in {card.get('download_seconds')}s", flush=True)
            summary.append({"slug": slug, "status": "ok", **card})
        except Exception as e:
            print(f"[FAIL] {slug}: {str(e)[:300]}", flush=True)
            summary.append({"slug": slug, "status": "fail", "error": str(e)[:300]})
    with open(os.path.join(ZOO, "fetch_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    fails = [s for s in summary if s["status"] != "ok"]
    print(f"\n{len(summary) - len(fails)}/{len(summary)} downloaded -> {ZOO}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
