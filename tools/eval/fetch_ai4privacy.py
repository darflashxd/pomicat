"""Usage: python tools/eval/fetch_ai4privacy.py en 2000 tools/eval/data/ai4privacy_en.jsonl

Writes a seeded random sample of held-out rows (validation split) of
ai4privacy/open-pii-masking-500k-ai4privacy for one language. Downloads the split's parquet
file (~96 MB) once into tools/eval/data/raw/. Needs pyarrow.
"""
import json
import os
import random
import sys
import urllib.request

import pyarrow.parquet as pq

lang, n, out_path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
url = ("https://huggingface.co/api/datasets/ai4privacy/open-pii-masking-500k-ai4privacy"
       "/parquet/default/validation/0.parquet")
raw = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "raw", "ai4privacy_validation.parquet")
if not os.path.exists(raw):
    os.makedirs(os.path.dirname(raw), exist_ok=True)
    urllib.request.urlretrieve(url, raw)

table = pq.read_table(raw, columns=["uid", "source_text", "privacy_mask", "language"])
rows = [r for r in table.to_pylist() if r["language"] == lang]
random.Random(1337).shuffle(rows)
with open(out_path, "w", encoding="utf-8") as out:
    for r in rows[:n]:
        out.write(json.dumps({"id": r["uid"], "source_text": r["source_text"],
                              "privacy_mask": r["privacy_mask"]}, ensure_ascii=False) + "\n")
print(f"{min(n, len(rows))} of {len(rows)} '{lang}' rows -> {out_path}", file=sys.stderr)
