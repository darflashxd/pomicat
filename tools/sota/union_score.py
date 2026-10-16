#!/usr/bin/env python3
"""Value-recall of the UNION of two redaction outputs (Tier-1 OR Tier-2 caught it).

Usage: python tools/sota/union_score.py <gold.jsonl> <out_a.jsonl> <out_b.jsonl>

Headline metric only (value recall + per label). Token-F1 union needs span
alignment; report individual F1s from score.py instead.
"""
import json
import sys


def load(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def main():
    gold, a, b = (load(p) for p in sys.argv[1:4])
    ba = {str(o["id"]): o["output"] for o in a}
    bb = {str(o["id"]): o["output"] for o in b}
    tot = hit = 0
    per = {}
    for n, row in enumerate(gold):
        oa = ba.get(str(row.get("id", n)), "")
        ob = bb.get(str(row.get("id", n)), "")
        for m in row.get("privacy_mask", []):
            v = m["value"]
            if len(v.strip()) < 3:
                continue
            tot += 1
            caught = v.casefold() not in oa.casefold() or v.casefold() not in ob.casefold()
            hit += caught
            lab = m.get("label", "PII")
            t, h = per.get(lab, (0, 0))
            per[lab] = (t + 1, h + caught)
    print(f"union value recall: {hit}/{tot} = {hit / tot:.3f}")
    for lab in sorted(per):
        t, h = per[lab]
        print(f"  {lab:<20} {h / t:.3f}")


if __name__ == "__main__":
    main()
