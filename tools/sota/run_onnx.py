#!/usr/bin/env python3
"""Redact gold rows with any HF token-classification model -> {id, output} JSONL.

Usage: python tools/sota/run_onnx.py <model_dir_or_id> <gold.jsonl> <out.jsonl>
       [--threshold 0.0] [--max-length 128] [--batch 8]

Spans predicted != O are replaced with [MODEL_<LABEL>]. Output is compatible
with tools/eval/score.py, so every candidate is measured with the same metric
as SafeShare / Presidio / gitleaks.

Notes:
- Base (non-fine-tuned) encoders have random heads: use only for smoke/latency.
  Real accuracy numbers come AFTER fine-tuning on data/schema.json labels.
- GLiNER / causal models are NOT supported here (separate runners).
"""
import json
import sys

import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer


def parse_args():
    args = {"threshold": 0.0, "max-length": 128, "batch": 8}
    pos = []
    it = iter(sys.argv[1:])
    for a in it:
        if a.startswith("--"):
            k = a[2:]
            args[k] = type(args.get(k, ""))(next(it))
        else:
            pos.append(a)
    return pos, args


def spans_for(offsets, probs, id2label, threshold):
    out = []
    cur = None
    for idx, (s, e) in enumerate(offsets):
        if e <= s:  # special tokens
            if cur:
                out.append(cur)
                cur = None
            continue
        scores = probs[idx]
        best = max(range(len(scores)), key=scores.__getitem__)
        conf = float(scores[best])
        label = id2label.get(str(best), id2label.get(best, "O"))
        if label == "O" or conf < threshold:
            if cur:
                out.append(cur)
                cur = None
            continue
        prefix, _, typ = label.partition("-")
        if prefix == "B" or not cur or cur[2] != typ:
            if cur:
                out.append(cur)
            cur = [s, e, typ]
        else:
            cur[1] = e
    if cur:
        out.append(cur)
    return [(s, e, t) for s, e, t in out]


def redact(text, spans):
    parts, last = [], 0
    for s, e, t in sorted(spans):
        if s < last:
            continue
        parts.append(text[last:s])
        parts.append(f"[MODEL_{t}]")
        last = e
    parts.append(text[last:])
    return "".join(parts)


def main():
    pos, args = parse_args()
    model_src, gold_path, out_path = pos[0], pos[1], pos[2]
    model = AutoModelForTokenClassification.from_pretrained(model_src)
    tok = AutoTokenizer.from_pretrained(model_src)
    model.eval()
    id2label = {str(k): v for k, v in model.config.id2label.items()}
    n = 0
    with open(gold_path, encoding="utf-8") as f, open(out_path, "w", encoding="utf-8") as out:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            text = row["source_text"]
            enc = tok(text, return_tensors="pt", truncation=True,
                      max_length=int(args["max-length"]), return_offsets_mapping=True)
            with torch.no_grad():
                logits = model(**{k: v for k, v in enc.items() if k != "offset_mapping"}).logits[0]
            probs = torch.softmax(logits, dim=-1).tolist()
            offsets = enc["offset_mapping"][0].tolist()
            spans = spans_for(offsets, probs, id2label, float(args["threshold"]))
            out.write(json.dumps({"id": row.get("id", n), "output": redact(text, spans)},
                                 ensure_ascii=False) + "\n")
            n += 1
    print(f"{n} rows redacted with {model_src} -> {out_path}")


if __name__ == "__main__":
    main()
