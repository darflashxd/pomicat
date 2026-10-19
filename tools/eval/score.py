"""Score redaction outputs against ai4privacy-style gold labels.

Usage: python tools/eval/score.py gold.jsonl out_tool_a.jsonl [out_tool_b.jsonl ...]

Legacy diagnostics (redacted text alone cannot establish full-span removal):
  value recall    share of gold PII values that no longer appear anywhere in the output
  token P / R / F1 word-level: a word counts as removed if it appears fewer times in the
                  output than in the source. Removed words inside gold spans are true
                  positives, removed words outside are false positives (over-redaction).
Optional outputs[].edits = [{start, end, replacement}] use Python Unicode code-point offsets
into source_text. When supplied for every row, strict positional metrics are also computed.
JavaScript UTF-16 offsets must be converted before exporting. Missing/duplicate rows fail.
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
            if start < 0 or text.find(m["value"], start + 1) >= 0:
                raise ValueError("Missing or ambiguous gold value; provide an explicit start")
        if type(start) is not int or start < 0 or not m["value"] or text[start:start + len(m["value"])] != m["value"]:
            raise ValueError("Invalid gold span")
        out.append((start, start + len(m["value"]), m["value"], m.get("label", "PII")))
    return out


def positional_metrics(gold, outputs):
    covered = sensitive = extra = full = partial = total = exact = predicted = 0
    for n, row in enumerate(gold):
        text = row["source_text"]
        output = outputs[str(row.get("id", n))]
        edits = output["edits"]
        if not isinstance(edits, list):
            raise ValueError("edits must be a list")
        changed = set()
        cursor = 0
        rebuilt = []
        for edit in edits:
            start, end, replacement = edit["start"], edit["end"], edit["replacement"]
            if type(start) is not int or type(end) is not int or not cursor <= start < end <= len(text) or not isinstance(replacement, str):
                raise ValueError("Invalid, overlapping, or unsorted edit")
            rebuilt.extend([text[cursor:start], replacement])
            # An identical edit must not count as redaction.
            if replacement != text[start:end]:
                changed.update(range(start, end))
            cursor = end
        rebuilt.append(text[cursor:])
        if "".join(rebuilt) != output["output"]:
            raise ValueError("Edit reconstruction does not match output")
        gold_chars = set()
        gold_spans = spans(row)
        predicted_spans = {(edit['start'], edit['end']) for edit in edits
                           if edit['replacement'] != text[edit['start']:edit['end']]}
        predicted += len(predicted_spans)
        exact += sum((start, end) in predicted_spans and value.casefold() not in output['output'].casefold()
                     for start, end, value, _ in gold_spans)
        for start, end, value, _ in gold_spans:
            expected = set(range(start, end))
            gold_chars.update(expected)
            count = len(expected & changed)
            total += 1
            # Coverage is not protection if the tool re-emits the value in its replacement.
            hidden = count == len(expected) and value.casefold() not in output["output"].casefold() and not any(
                edit["start"] < end and edit["end"] > start and
                text[max(start, edit["start"]):min(end, edit["end"])].casefold() in edit["replacement"].casefold()
                for edit in edits)
            full += hidden
            partial += 0 < count < len(expected)
        covered += len(changed & gold_chars)
        sensitive += len(gold_chars)
        extra += len(changed - gold_chars)
    return {"full_span_recall": full / total if total else None,
            "sensitive_character_coverage": covered / sensitive if sensitive else None,
            "partial_spans": partial, "non_sensitive_characters_changed": extra,
            "exact_span_precision": exact / predicted if predicted else None,
            "exact_span_recall": exact / total if total else None,
            "gold_spans": total}


def score(gold, outputs):
    ids = [str(o["id"]) for o in outputs]
    gold_ids = [str(row.get("id", n)) for n, row in enumerate(gold)]
    if len(set(ids)) != len(ids) or len(set(gold_ids)) != len(gold_ids):
        raise ValueError("Duplicate evaluation ID")
    if set(ids) != set(gold_ids):
        raise ValueError("Output IDs do not exactly match gold IDs")
    if any(not isinstance(o["output"], str) for o in outputs):
        raise ValueError("Output must be text")
    if any("edits" in o for o in outputs) and not all("edits" in o for o in outputs):
        raise ValueError("Provide edits for every output or none")
    by_id = {str(o["id"]): o["output"] for o in outputs}
    tp = fp = fn = 0
    val_total = val_hit = 0
    per_label = defaultdict(lambda: [0, 0])
    for n, row in enumerate(gold):
        out = by_id.get(str(row.get("id", n)))
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
    result = {
        "value_recall": val_hit / val_total if val_total else 0.0,
        "token_precision": p,
        "token_recall": r,
        "token_f1": f1,
        "per_label": {k: v[1] / v[0] for k, v in sorted(per_label.items())},
        "rows": len(by_id),
        "metric_scope": "legacy value-absence/token-count diagnostics; not exact-span security metrics",
    }
    result["positional"] = positional_metrics(gold, {str(o["id"]): o for o in outputs}) if outputs and all("edits" in o for o in outputs) else None
    return result


if __name__ == "__main__":
    gold = load(sys.argv[1])
    print("WARNING: value absence and token counts do not prove complete redaction. Strict metrics require edit traces.")
    print(f"{'tool':<28}{'value recall':>14}{'token P':>10}{'token R':>10}{'token F1':>10}")
    results = {}
    for path in sys.argv[2:]:
        s = score(gold, load(path))
        results[path] = s
        print(f"{os.path.basename(path):<28}{s['value_recall']:>14.3f}{s['token_precision']:>10.3f}{s['token_recall']:>10.3f}{s['token_f1']:>10.3f}")
        if s["positional"] is not None:
            print("  positional:", json.dumps(s["positional"], sort_keys=True))
    labels = sorted({l for s in results.values() for l in s["per_label"]})
    if labels:
        print("\nvalue recall per label")
        print(f"{'label':<24}" + "".join(f"{os.path.basename(p)[:20]:>22}" for p in results))
        for l in labels:
            print(f"{l:<24}" + "".join(f"{results[p]['per_label'].get(l, float('nan')):>22.3f}" for p in results))
