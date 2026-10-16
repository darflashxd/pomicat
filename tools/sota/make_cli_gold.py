#!/usr/bin/env python3
"""Build FP-eval gold from CLI hard negatives + score FP-rate from a redacted JSONL.

Usage:
  python tools/sota/make_cli_gold.py --make <redacted.jsonl>  # step 1 skipped: use --make-gold
  python tools/sota/make_cli_gold.py --make-gold              # -> data/cli_hardneg_gold.jsonl
  python tools/sota/make_cli_gold.py <redacted.jsonl>         # prints FP-rate (all labels O: any placeholder = FP)
"""
import json
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PLACEHOLDER = re.compile(r"\[MODEL_[A-Z_]+\]|\[REDACTED_[A-Z_]+\]|\[User_[A-Z]+\]|\[LOCATION_\d+\]")


def make_gold():
    rows = json.load(open(os.path.join(REPO, "data", "cli_hardneg_eval.json"), encoding="utf-8"))
    out = os.path.join(REPO, "data", "cli_hardneg_gold.jsonl")
    with open(out, "w", encoding="utf-8") as f:
        for i, r in enumerate(rows):
            f.write(json.dumps({"id": i, "source_text": " ".join(r["tokens"]),
                                "privacy_mask": []}, ensure_ascii=False) + "\n")
    print(f"{len(rows)} gold rows -> {out}")


def score_fp(path):
    total, fp, examples = 0, 0, []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            total += 1
            out = json.loads(line)["output"]
            if PLACEHOLDER.search(out):
                fp += 1
                if len(examples) < 10:
                    examples.append(out[:160])
    print(f"FP-rate: {fp}/{total} = {100.0 * fp / total:.2f}% (target <2%)")
    for e in examples:
        print("  ex:", e)


if __name__ == "__main__":
    if "--make-gold" in sys.argv:
        make_gold()
    else:
        score_fp(sys.argv[1])
