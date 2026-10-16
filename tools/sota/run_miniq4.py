#!/usr/bin/env python3
"""Redact gold rows with the shipped MiniLM Q4 ONNX -> {id, output} JSONL.

Usage: python tools/sota/run_miniq4.py <gold.jsonl> <out.jsonl> [--threshold 0.0]

Uses training/model_output/minilm_q4 (35 PII labels). Compatible with score.py.
"""
import json
import sys

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer


def main():
    gold_path, out_path = sys.argv[1], sys.argv[2]
    thr = float(sys.argv[sys.argv.index("--threshold") + 1]) if "--threshold" in sys.argv else 0.0
    import os
    d = os.path.join(os.path.dirname(__file__), "..", "..", "training", "model_output", "minilm_q4")
    d = os.path.abspath(d)
    tok = AutoTokenizer.from_pretrained(d)
    sess = ort.InferenceSession(os.path.join(d, "model_q4.onnx"), providers=["CPUExecutionProvider"])
    id2label = json.load(open(os.path.join(d, "config.json")))["id2label"]
    n = 0
    with open(gold_path, encoding="utf-8") as f, open(out_path, "w", encoding="utf-8") as out:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            text = row["source_text"]
            enc = tok(text, return_tensors="np", truncation=True, max_length=128,
                      return_offsets_mapping=True)
            feeds = {"input_ids": enc["input_ids"].astype(np.int64),
                     "attention_mask": enc["attention_mask"].astype(np.int64)}
            if "token_type_ids" in enc:
                feeds["token_type_ids"] = enc["token_type_ids"].astype(np.int64)
            else:
                feeds["token_type_ids"] = np.zeros_like(feeds["input_ids"])
            logits = sess.run(None, feeds)[0][0]
            offsets = enc["offset_mapping"][0].tolist()
            spans, cur = [], None
            for i, (s, e) in enumerate(offsets):
                if e <= s:
                    if cur:
                        spans.append(cur)
                        cur = None
                    continue
                scores = logits[i]
                best = int(np.argmax(scores))
                probs = np.exp(scores - scores.max())
                conf = float(probs[best] / probs.sum())
                label = id2label[str(best)]
                if label == "O" or conf < thr:
                    if cur:
                        spans.append(cur)
                        cur = None
                    continue
                _, _, typ = label.partition("-")
                if label.startswith("B-") or not cur or cur[2] != typ:
                    if cur:
                        spans.append(cur)
                    cur = [s, e, typ]
                else:
                    cur[1] = e
            if cur:
                spans.append(cur)
            parts, last = [], 0
            for s, e, t in sorted(spans):
                if s < last:
                    continue
                parts += [text[last:s], f"[MODEL_{t}]"]
                last = e
            parts.append(text[last:])
            out.write(json.dumps({"id": row.get("id", n), "output": "".join(parts)},
                                 ensure_ascii=False) + "\n")
            n += 1
    print(f"{n} rows redacted with minilm_q4 -> {out_path}")


if __name__ == "__main__":
    main()
