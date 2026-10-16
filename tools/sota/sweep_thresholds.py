#!/usr/bin/env python3
"""Sweep Tier-2 confidence thresholds on ai4privacy rows 0-499 (tune split).

Usage: python tools/sota/sweep_thresholds.py
Reports value-recall + token-F1 per config. Rows 500+ stay held-out for final check.
Imports span helpers from run_hybrid.py and score() from tools/eval/score.py.

ID_GROUP (CARD/SSN/PASSPORT/ID/TAX/PHONE/ACCOUNT/ROUTING/DRIVERS_LICENSE): low thresholds.
NAME_GROUP (names/addresses): keep 0.30-0.40.
"""
import json
import os
import sys

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO, "tools", "sota"))
sys.path.insert(0, os.path.join(REPO, "tools", "eval"))
from run_hybrid import protected_spans, tech_density, CUTOFF  # noqa: E402
from score import score as score_fn  # noqa: E402

ID_GROUP = {"CREDIT_CARD", "CARD", "US_SSN", "SOCIALNUM", "PASSPORT", "PASSPORTNUM",
            "DRIVERS_LICENSE", "DRIVERLICENSENUM", "TAX_ID", "TAXNUM", "PHONE_NUMBER",
            "TELEPHONENUM", "PHONE", "BANK_ACCOUNT", "ACCOUNT", "ROUTING_NUMBER",
            "GOVERNMENT_ID", "IDCARDNUM", "ID"}
MODEL_LABELS = {"GIVEN_NAME", "SURNAME", "EMAIL", "PHONE", "URL", "TAX_ID", "BANK_ACCOUNT",
                "ROUTING_NUMBER", "GOVERNMENT_ID", "PASSPORT", "DRIVERS_LICENSE",
                "BUILDING_NUMBER", "STREET_NAME", "SECONDARY_ADDRESS", "CITY", "STATE", "ZIP_CODE"}


def collect(gold_rows, tok, sess, id2label):
    data = []
    for n, row in enumerate(gold_rows):
        text = row["source_text"]
        cands, vetoed = [], 0
        if tech_density(text) <= CUTOFF:
            prot = protected_spans(text)
            enc = tok(text, return_tensors="np", truncation=True, max_length=128,
                      return_offsets_mapping=True)
            feeds = {"input_ids": enc["input_ids"].astype(np.int64),
                     "attention_mask": enc["attention_mask"].astype(np.int64),
                     "token_type_ids": enc.get("token_type_ids",
                                               np.zeros_like(enc["input_ids"])).astype(np.int64)}
            logits = sess.run(None, feeds)[0][0]
            offsets = enc["offset_mapping"][0].tolist()
            cur = None
            allc = []
            for i, (s, e) in enumerate(offsets):
                if e <= s:
                    if cur:
                        allc.append(cur)
                        cur = None
                    continue
                sc = logits[i]
                best = int(np.argmax(sc))
                label = id2label[str(best)]
                if label == "O":
                    if cur:
                        allc.append(cur)
                        cur = None
                    continue
                _, _, typ = label.partition("-")
                probs = np.exp(sc - sc.max())
                conf = float(probs[best] / probs.sum())
                if label.startswith("B-") or not cur or cur[2] != typ:
                    if cur:
                        allc.append(cur)
                    cur = [s, e, typ, conf]
                else:
                    cur[1] = e
                    cur[3] = max(cur[3], conf)
            if cur:
                allc.append(cur)
            for s, e, typ, conf in allc:
                if any(max(s, ps) < min(e, pe) for ps, pe in prot):
                    vetoed += 1
                    continue
                cands.append((s, e, typ, conf))
        data.append({"id": row.get("id", n), "text": text, "cands": cands, "vetoed": vetoed})
    return data


def render(data, thr_id, thr_name):
    outs = []
    for d in data:
        kept = [(s, e, t) for s, e, t, c in d["cands"]
                if c >= (thr_id if t in ID_GROUP or t not in MODEL_LABELS else thr_name)]
        parts, last = [], 0
        for s, e, t in sorted(kept):
            if s < last:
                continue
            parts += [d["text"][last:s], f"[MODEL_{t}]"]
            last = e
        parts.append(d["text"][last:])
        outs.append({"id": d["id"], "output": "".join(parts)})
    return outs


def main():
    gold = [json.loads(l) for l in open(os.path.join(REPO, "tools", "eval", "data",
                                                     "ai4privacy_en.jsonl"), encoding="utf-8") if l.strip()]
    tune = gold[:500]
    d = os.path.join(REPO, "training", "model_output", "minilm_q4")
    tok = AutoTokenizer.from_pretrained(d)
    sess = ort.InferenceSession(os.path.join(d, "model_q4.onnx"), providers=["CPUExecutionProvider"])
    id2label = json.load(open(os.path.join(d, "config.json")))["id2label"]
    data = collect(tune, tok, sess, id2label)
    print(f"{'thr_id':>8} {'thr_name':>8} {'recall':>8} {'P':>7} {'R':>7} {'F1':>7}")
    best = None
    for thr_id in (0.15, 0.25, 0.35):
        for thr_name in (0.30, 0.40):
            s = score_fn(tune, render(data, thr_id, thr_name))
            print(f"{thr_id:>8} {thr_name:>8} {s['value_recall']:>8.3f} "
                  f"{s['token_precision']:>7.3f} {s['token_recall']:>7.3f} {s['token_f1']:>7.3f}")
            if best is None or s["token_f1"] > best[1]["token_f1"]:
                best = ((thr_id, thr_name), s)
    print(f"BEST id={best[0][0]} name={best[0][1]} F1={best[1]['token_f1']:.3f} "
          f"recall={best[1]['value_recall']:.3f}")


if __name__ == "__main__":
    main()
