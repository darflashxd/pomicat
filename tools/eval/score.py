"""Score redaction outputs against ai4privacy-style gold labels.

Usage: python tools/eval/score.py gold.jsonl out_tool_a.jsonl [out_tool_b.jsonl ...]

Metrics (all computed on the redacted text alone, so any tool can be compared):
  value recall    share of gold PII values that no longer appear anywhere in the output
  token P / R / F1 word-level: a word counts as removed if it appears fewer times in the
                  output than in the source. Removed words inside gold spans are true
                  positives, removed words outside are false positives (over-redaction).
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

WORD = re.compile(r"\w+", re.UNICODE)


def load(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def spans(row):
    """Gold spans as (start, end, value, label); finds offsets when the dataset omits them."""
    text, out = row["source_text"], []
    for m in row.get("privacy_mask", []):
        start = m.get("start")
        if start is None:
            start = text.find(m["value"])
            if start < 0:
                continue
        out.append((start, start + len(m["value"]), m["value"], m.get("label", "PII")))
    return out


def score(gold, outputs):
    by_id = {str(o["id"]): o["output"] for o in outputs}
    tp = fp = fn = 0
    val_total = val_hit = 0
    per_label = defaultdict(lambda: [0, 0])
    for n, row in enumerate(gold):
        out = by_id.get(str(row.get("id", n)))
        if out is None:
            continue
        text, gs = row["source_text"], spans(row)
        out_lower = out.casefold()

        for _, _, value, label in gs:
            if len(value.strip()) < 3:
                continue
            hit = value.casefold() not in out_lower
            val_total += 1
            val_hit += hit
            per_label[label][0] += 1
            per_label[label][1] += hit

        remaining = Counter(w.casefold() for w in WORD.findall(out))
        for m in WORD.finditer(text):
            w = m.group().casefold()
            in_pii = any(s <= m.start() < e for s, e, _, _ in gs)
            removed = remaining[w] <= 0
            if not removed:
                remaining[w] -= 1
            if in_pii and removed:
                tp += 1
            elif in_pii:
                fn += 1
            elif removed:
                fp += 1

    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    return {
        "value_recall": val_hit / val_total if val_total else 0.0,
        "token_precision": p,
        "token_recall": r,
        "token_f1": f1,
        "per_label": {k: v[1] / v[0] for k, v in sorted(per_label.items())},
        "rows": len(by_id),
    }


if __name__ == "__main__":
    gold = load(sys.argv[1])
    print(f"{'tool':<28}{'value recall':>14}{'token P':>10}{'token R':>10}{'token F1':>10}")
    results = {}
    for path in sys.argv[2:]:
        s = score(gold, load(path))
        results[path] = s
        print(f"{os.path.basename(path):<28}{s['value_recall']:>14.3f}{s['token_precision']:>10.3f}{s['token_recall']:>10.3f}{s['token_f1']:>10.3f}")
    labels = sorted({l for s in results.values() for l in s["per_label"]})
    if labels:
        print("\nvalue recall per label")
        print(f"{'label':<24}" + "".join(f"{os.path.basename(p)[:20]:>22}" for p in results))
        for l in labels:
            print(f"{l:<24}" + "".join(f"{results[p]['per_label'].get(l, float('nan')):>22.3f}" for p in results))
