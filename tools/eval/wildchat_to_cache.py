"""Usage: python tools/eval/wildchat_to_cache.py [max_conversations=20000]

Builds tools/eval/data/wildchat_cache.jsonl (English conversations only) from one WildChat-1M
parquet shard, downloaded once into tools/eval/data/raw/ (~230 MB). Used by inversion_wild.js and
make_label_sheet.js. Needs pyarrow. The data is real people's text: it stays local (gitignored).
"""
import json
import os
import sys
import urllib.request

import pyarrow.parquet as pq

LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "data", "raw", "wildchat_0.parquet")
OUT = os.path.join(HERE, "data", "wildchat_cache.jsonl")
URL = "https://huggingface.co/api/datasets/allenai/WildChat-1M/parquet/default/train/0.parquet"

if not os.path.exists(RAW):
    os.makedirs(os.path.dirname(RAW), exist_ok=True)
    urllib.request.urlretrieve(URL, RAW)

table = pq.read_table(RAW, columns=["conversation_hash", "conversation", "language"])
n = 0
with open(OUT, "w", encoding="utf-8") as f:
    for row in table.to_pylist():
        if row["language"] != "English":
            continue
        turns = [{"role": t["role"], "content": t.get("content") or ""} for t in row["conversation"]]
        f.write(json.dumps({"offset": n, "hash": row["conversation_hash"], "turns": turns}, ensure_ascii=False) + "\n")
        n += 1
        if n >= LIMIT:
            break
print(f"{n} English conversations -> {OUT}", file=sys.stderr)
