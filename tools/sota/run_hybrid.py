#!/usr/bin/env python3
"""Hybrid Gate-2: MiniLM Q4 + PrioritySpanArbiter Tier-0 veto -> {id, output} JSONL.

Usage: python tools/sota/run_hybrid.py <gold.jsonl> <out.jsonl> [--threshold-scale 1.0]

Ports extension/engine/span_arbiter.js: technical-density bypass (cutoff 0.60),
per-label confidence thresholds, Tier-0 protected-span veto. Measures the real
in-extension NER behavior (not raw-model behavior).
"""
import json
import os
import re
import sys

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

THRESHOLDS = {"GIVEN_NAME": 0.35, "SURNAME": 0.35, "STREET_NAME": 0.30,
              "BUILDING_NUMBER": 0.35, "SECONDARY_ADDRESS": 0.30, "CITY": 0.40,
              "STATE": 0.45, "ZIP_CODE": 0.40, "DEFAULT": 0.40}
CUTOFF = 0.60

PROTECTED = [
    ("CODE_FENCE", re.compile(r"```[a-zA-Z0-9_-]*[\s\S]*?```")),
    ("INLINE_CODE", re.compile(r"`[^`\n\r]+`")),
    ("PUBLIC_DNS", re.compile(r"\b(?:1\.1\.1\.1|1\.0\.0\.1|8\.8\.8\.8|8\.8\.4\.4|9\.9\.9\.9|149\.112\.112\.112)\b")),
    ("CIDR_MASK", re.compile(r"\b(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}/(?:[0-9]|[12][0-9]|3[0-2])\b")),
    ("SEC_ADVISORY", re.compile(r"\b(?:CVE|GHSA|OSV)-\d{4}-\d{4,8}\b", re.I)),
    ("RFC_STANDARD", re.compile(r"\bRFC-?\d{3,5}\b", re.I)),
    ("SEM_VER", re.compile(r"\bv?\d+\.\d+\.\d+(?:-[a-zA-Z0-9_.]+)?\b")),
    ("MODEL_TAG", re.compile(r"\b(?:claude|gpt|gemini|llama|mistral|bert|distilbert)-[a-zA-Z0-9._-]+\b", re.I)),
    ("GIT_HASH", re.compile(r"\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b")),
    ("HEX_ADDR", re.compile(r"\b0x[0-9a-fA-F]{4,16}\b")),
    ("SQL_SYNTAX", re.compile(r"\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE|GROUP\s+BY|ORDER\s+BY|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN)\b", re.I)),
    ("CLI_FLAG", re.compile(r"(?:(?<=\s)|^)(?:--[a-zA-Z0-9_-]{2,30}|-[a-zA-Z0-9])(?=[\s=]|$)")),
    ("FILE_PATH", re.compile(r"(?:(?:/[a-zA-Z0-9._-]+){2,}|\b[A-Z]:\\[a-zA-Z0-9._\-\\]+)")),
    ("BARE_PORT", re.compile(r"(?::\d{2,5}\b|(?:(?<=[\s-])|^)-{0,2}(?:p\b|port|listen|dport)\s+\d{2,5}\b|\bPORT\s*=\s*\d{2,5}\b)", re.I)),
    ("SQL_NUMERIC", re.compile(r"(?:\bWHERE\b[^;\n]*?=\s*\d+|\bVALUES\b[^;\n]*?\(?\s*\d+|\bLIMIT\s+\d+|\bid\s*=\s*\d+)", re.I)),
    ("PRIVATE_IP", re.compile(r"\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})\b")),
]

CODE_PUNCT = re.compile(r"[{}\(\)\[\];<>=+\-*\/\\|&^%$#@!~`'\":]")
CODE_KW = re.compile(r"^(?:function|const|let|var|return|class|import|export|from|def|fn|func|public|private|static|async|await|select|insert|update|delete|where|from|table|null|true|false|undefined|throw|catch|try|if|else|elif|while|for|break|continue)$", re.I)
CAMEL = re.compile(r"^[a-z]+[A-Z0-9][a-zA-Z0-9]*$|^[a-z0-9]+_[a-z0-9_]+$")


def tech_density(text):
    toks = text.strip().split()
    if not toks or toks == [""]:
        return 0.0
    n = sum(1 for t in toks if CODE_PUNCT.search(t) or CODE_KW.match(t) or CAMEL.match(t)
            or re.search(r"\b(?:0x[0-9a-fA-F]+|\d+\.\d+\.\d+)\b", t))
    return n / len(toks)


def protected_spans(text):
    out = []
    for label, rx in PROTECTED:
        for m in rx.finditer(text):
            out.append((m.start(), m.end()))
    return out


def main():
    gold_path, out_path = sys.argv[1], sys.argv[2]
    d = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..",
                                     "training", "model_output", "minilm_q4"))
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
            kept = []
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
                cands = []
                for i, (s, e) in enumerate(offsets):
                    if e <= s:
                        if cur:
                            cands.append(cur)
                            cur = None
                        continue
                    sc = logits[i]
                    best = int(np.argmax(sc))
                    label = id2label[str(best)]
                    if label == "O":
                        if cur:
                            cands.append(cur)
                            cur = None
                        continue
                    _, _, typ = label.partition("-")
                    probs = np.exp(sc - sc.max())
                    conf = float(probs[best] / probs.sum())
                    if label.startswith("B-") or not cur or cur[2] != typ:
                        if cur:
                            cands.append(cur)
                        cur = [s, e, typ, conf]
                    else:
                        cur[1] = e
                        cur[3] = max(cur[3], conf)
                if cur:
                    cands.append(cur)
                for s, e, typ, conf in cands:
                    if conf < THRESHOLDS.get(typ, THRESHOLDS["DEFAULT"]):
                        continue
                    if any(max(s, ps) < min(e, pe) for ps, pe in prot):
                        continue
                    kept.append((s, e, typ))
            parts, last = [], 0
            for s, e, t in sorted(kept):
                if s < last:
                    continue
                parts += [text[last:s], f"[MODEL_{t}]"]
                last = e
            parts.append(text[last:])
            out.write(json.dumps({"id": row.get("id", n), "output": "".join(parts)},
                                 ensure_ascii=False) + "\n")
            n += 1
    print(f"{n} rows hybrid-redacted -> {out_path}")


if __name__ == "__main__":
    main()
