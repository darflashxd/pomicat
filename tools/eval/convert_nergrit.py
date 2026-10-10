"""Usage: python tools/eval/convert_nergrit.py valid_preprocess.txt tools/eval/data/nergrit_id.jsonl

Converts IndoNLU NERGrit (token<TAB>BIO tag, blank line between sentences; from
github.com/IndoNLP/indonlu dataset/nergrit_ner-grit/) into the ai4privacy-style gold format.
Note: NERGrit is encyclopedic text, so most entities are public people, places and
organisations. It measures Indonesian entity coverage, not private-chat PII.
"""
import json
import sys

src, out_path = sys.argv[1], sys.argv[2]


def sentences(path):
    cur = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line.strip():
                if cur:
                    yield cur
                cur = []
                continue
            tok, tag = line.split("\t")
            cur.append((tok, tag))
    if cur:
        yield cur


with open(out_path, "w", encoding="utf-8") as out:
    for i, sent in enumerate(sentences(src)):
        text, spans, pos, open_span = "", [], 0, None
        for tok, tag in sent:
            if text:
                text += " "
            start = len(text)
            text += tok
            if tag.startswith("B-") or (tag.startswith("I-") and open_span is None):
                if open_span:
                    spans.append(open_span)
                open_span = [start, len(text), tag[2:]]
            elif tag.startswith("I-"):
                open_span[1] = len(text)
            else:
                if open_span:
                    spans.append(open_span)
                open_span = None
        if open_span:
            spans.append(open_span)
        mask = [{"value": text[s:e], "start": s, "end": e, "label": l} for s, e, l in spans]
        out.write(json.dumps({"id": f"nergrit-{i}", "source_text": text, "privacy_mask": mask}, ensure_ascii=False) + "\n")
