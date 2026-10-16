#!/usr/bin/env python3
"""Zero-shot redact gold rows with a GLiNER model -> {id, output} JSONL.

Usage: python tools/sota/run_gliner.py <gliner_dir> <gold.jsonl> <out.jsonl> [--threshold 0.5]

Compatible with tools/eval/score.py. Entity labels are generic PII phrases;
any hit is redacted (detection benchmark, not SafeShare contextual policy).
"""
import json
import sys

LABELS = ["person", "location", "organization", "phone number", "email address",
          "identity number", "bank account", "credit card number", "date of birth",
          "salary", "password"]


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    model_src, gold_path, out_path = pos[0], pos[1], pos[2]
    thr = float(sys.argv[sys.argv.index("--threshold") + 1]) if "--threshold" in sys.argv else 0.5
    from gliner import GLiNER
    model = GLiNER.from_pretrained(model_src)
    n = 0
    with open(gold_path, encoding="utf-8") as f, open(out_path, "w", encoding="utf-8") as out:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            text = row["source_text"]
            try:
                ents = model.predict_entities(text, LABELS, threshold=thr)
            except Exception:
                ents = []
            spans = sorted({(e["start"], e["end"]) for e in ents})
            parts, last = [], 0
            for s, e in spans:
                if s < last:
                    continue
                parts += [text[last:s], "[MODEL_GLINER]"]
                last = e
            parts.append(text[last:])
            out.write(json.dumps({"id": row.get("id", n), "output": "".join(parts)},
                                 ensure_ascii=False) + "\n")
            n += 1
    print(f"{n} rows redacted with {model_src} -> {out_path}")


if __name__ == "__main__":
    main()
