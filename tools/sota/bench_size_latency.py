#!/usr/bin/env python3
"""Size + CPU latency smoke test for each model in training/model_zoo/.

Usage: python tools/sota/bench_size_latency.py [--iters 100]

For each slug: on-disk MB, param estimate, p50/p95 latency @128 tokens
(PyTorch CPU; WASM onnxruntime-web measured separately in Fase 5).
Writes tools/sota/results_raw/size_latency.json. No accuracy claims here.
"""
import json
import os
import sys
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ZOO = os.path.join(REPO, "training", "model_zoo")
OUT = os.path.join(REPO, "tools", "sota", "results_raw", "size_latency.json")


def dir_size_mb(path):
    total = 0
    for dp, _, fns in os.walk(path):
        for fn in fns:
            try:
                total += os.path.getsize(os.path.join(dp, fn))
            except OSError:
                pass
    return round(total / (1024 * 1024), 1)


def main():
    import torch
    from transformers import AutoModel, AutoTokenizer

    iters = int(sys.argv[sys.argv.index("--iters") + 1]) if "--iters" in sys.argv else 100
    text = "Hi, I'm Rina Kusuma and I live in Bandung. My salary is $5,000 a month. " * 4
    rows = []
    for slug in sorted(os.listdir(ZOO)):
        d = os.path.join(ZOO, slug)
        if not os.path.isdir(d) or slug.startswith("."):
            continue
        row = {"slug": slug, "size_mb": dir_size_mb(d)}
        try:
            tok = AutoTokenizer.from_pretrained(d)
            try:
                model = AutoModel.from_pretrained(d)
            except Exception:
                from transformers import AutoModelForTokenClassification
                model = AutoModelForTokenClassification.from_pretrained(d)
            model.eval()
            n_params = sum(p.numel() for p in model.parameters())
            enc = tok(text, return_tensors="pt", truncation=True, max_length=128)
            with torch.no_grad():
                model(**enc)  # warmup
            ts = []
            with torch.no_grad():
                for _ in range(iters):
                    t0 = time.perf_counter()
                    model(**enc)
                    ts.append((time.perf_counter() - t0) * 1000)
            ts.sort()
            row.update({"params_m": round(n_params / 1e6, 1),
                        "p50_ms": round(ts[len(ts) // 2], 2),
                        "p95_ms": round(ts[int(len(ts) * 0.95)], 2)})
            print(f"[OK] {slug}: {row['size_mb']} MB, {row['params_m']}M params, "
                  f"p50 {row['p50_ms']} ms, p95 {row['p95_ms']} ms", flush=True)
        except Exception as e:
            row["error"] = str(e)[:300]
            print(f"[FAIL] {slug}: {str(e)[:200]}", flush=True)
        rows.append(row)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
