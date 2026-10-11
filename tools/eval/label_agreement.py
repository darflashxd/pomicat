"""Usage: python tools/eval/label_agreement.py alice.csv bob.csv

Compares two filled copies of label_sheet.csv (column "about_writer": yes / no / unsure):
agreement, Cohen's kappa, and how often each type is about the writer. Rows either person left
empty or marked "unsure" are left out of kappa.
"""
import csv
import sys
from collections import Counter, defaultdict


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    col = next(i for i, h in enumerate(rows[0]) if h.startswith("about_writer"))
    return {r[0]: (r[1], r[col].strip().lower()) for r in rows[1:] if r}


a, b = load(sys.argv[1]), load(sys.argv[2])
pairs = [(a[k][0], a[k][1], b[k][1]) for k in a if k in b and a[k][1] in ("yes", "no") and b[k][1] in ("yes", "no")]
if not pairs:
    sys.exit("No rows labelled yes/no by both people yet.")

agree = sum(x == y for _, x, y in pairs) / len(pairs)
pa = Counter(x for _, x, _ in pairs)
pb = Counter(y for _, _, y in pairs)
n = len(pairs)
chance = sum((pa[l] / n) * (pb[l] / n) for l in ("yes", "no"))
kappa = (agree - chance) / (1 - chance) if chance < 1 else 1.0

print(f"rows labelled yes/no by both: {n}")
print(f"agreement: {agree:.1%}   Cohen's kappa: {kappa:.2f}  (>0.6 is good, >0.8 is very good)")
by_type = defaultdict(list)
for t, x, y in pairs:
    if x == y:
        by_type[t].append(x == "yes")
print("\nwhere both agree, share that is about the writer:")
for t, v in sorted(by_type.items()):
    print(f"  {t:<8} {sum(v)}/{len(v)}  ({sum(v) / len(v):.0%})")
