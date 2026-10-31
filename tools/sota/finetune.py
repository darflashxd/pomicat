#!/usr/bin/env python3
"""Fine-tune any encoder on SafeShare PII labels (+ CLI hard negatives).

Usage: python tools/sota/finetune.py --base <hf_id_or_local_dir> --out training/model_output/<slug>
       [--epochs 3] [--hardneg 2000]

Labels: data/schema.json (11 BIO). Data: data/train|val|test.json + first
--hardneg rows of data/cli_hardneg_eval.json (all O) mixed into train.
Batch auto: 64+fp16 on CUDA, else 8+fp32. Saves best model + evaluation_metrics.json.
Seed 1337. CPU-only torch will be SLOW; prefer CUDA wheel or cloud for Fase 3.
"""
import argparse
import json
import os
import random

import numpy as np
import torch
from datasets import Dataset
from transformers import (AutoModelForTokenClassification, AutoTokenizer,
                          DataCollatorForTokenClassification, EarlyStoppingCallback,
                          Trainer, TrainingArguments)
import evaluate

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
random.seed(1337)


def load_rows(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else [data]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--hardneg", type=int, default=2000)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--max-train", type=int, default=0)
    ap.add_argument("--optim", type=str, default="adafactor")
    ap.add_argument("--resume", type=str, default=None,
                    help="resume from checkpoint dir, e.g. training/model_output/deberta-sota/checkpoint-2564")
    a = ap.parse_args()

    schema = json.load(open(os.path.join(REPO, "data", "schema.json"), encoding="utf-8"))
    labels, label2id = schema["labels"], schema["label2id"]
    id2label = {int(k): v for k, v in schema["id2label"].items()}

    train = load_rows(os.path.join(REPO, "data", "train.json"))
    hardneg = load_rows(os.path.join(REPO, "data", "cli_hardneg_eval.json"))[:a.hardneg]
    train = train + hardneg
    random.shuffle(train)
    if a.max_train > 0:
        # stratified-ish subsample: keep all entity rows first, then fill with O-rows
        ent = [r for r in train if any(t != "O" for t in r["ner_tags"])]
        rest = [r for r in train if not any(t != "O" for t in r["ner_tags"])]
        random.shuffle(ent)
        random.shuffle(rest)
        train = ent[:a.max_train] + rest[:max(0, a.max_train - len(ent[:a.max_train]))]
        random.shuffle(train)
    val = load_rows(os.path.join(REPO, "data", "val.json"))
    test = load_rows(os.path.join(REPO, "data", "test.json"))
    print(f"train {len(train)} (+{len(hardneg)} hardneg) val {len(val)} test {len(test)}", flush=True)

    tok = AutoTokenizer.from_pretrained(a.base)

    def align(examples):
        t = tok(examples["tokens"], truncation=True, is_split_into_words=True, max_length=128)
        all_ids = []
        for i, tags in enumerate(examples["ner_tags"]):
            wids, prev, ids = t.word_ids(batch_index=i), None, []
            for w in wids:
                if w is None:
                    ids.append(-100)
                elif w != prev:
                    ids.append(label2id[tags[w]])
                else:
                    ids.append(label2id[tags[w].replace("B-", "I-")] if tags[w].startswith("B-") else label2id[tags[w]])
                prev = w
            all_ids.append(ids)
        t["labels"] = all_ids
        return t

    def ds(rows):
        return Dataset.from_dict({"tokens": [r["tokens"] for r in rows],
                                  "ner_tags": [r["ner_tags"] for r in rows]}).map(
            align, batched=True, remove_columns=["tokens", "ner_tags"])

    train_ds, val_ds, test_ds = ds(train), ds(val), ds(test)
    seqeval = evaluate.load("seqeval")

    def metrics(p):
        pred = np.argmax(p.predictions, axis=2)
        tp = [[id2label[i] for i, l in zip(pr, la) if l != -100] for pr, la in zip(pred, p.label_ids)]
        tl = [[id2label[l] for _, l in zip(pr, la) if l != -100] for pr, la in zip(pred, p.label_ids)]
        r = seqeval.compute(predictions=tp, references=tl, zero_division=0)
        return {"precision": r["overall_precision"], "recall": r["overall_recall"],
                "f1": r["overall_f1"], "accuracy": r["overall_accuracy"]}

    model = AutoModelForTokenClassification.from_pretrained(
        a.base, num_labels=len(labels), id2label=id2label, label2id=label2id)
    cuda = torch.cuda.is_available()
    # NOTE (torch 2.14 CPU): AdamW corrupts fresh heads in 1 step (verified:
    # finite grads 0.54, post-step weight non-finite; SGD/Adafactor stable).
    # Electra+AdamW+fp16 was unaffected. Default stays off AdamW on this box.
    args = TrainingArguments(
        output_dir=a.out, eval_strategy="epoch", save_strategy="epoch",
        learning_rate=a.lr, optim=a.optim,
        per_device_train_batch_size=64 if cuda else 8,
        per_device_eval_batch_size=64 if cuda else 16,
        num_train_epochs=a.epochs, weight_decay=0.01, warmup_steps=500,
        bf16=cuda, fp16=False, logging_steps=100, save_total_limit=1,
        load_best_model_at_end=True, metric_for_best_model="f1",
        greater_is_better=True, report_to="none", seed=1337)
    trainer = Trainer(model=model, args=args, train_dataset=train_ds, eval_dataset=val_ds,
                      data_collator=DataCollatorForTokenClassification(tokenizer=tok),
                      processing_class=tok, compute_metrics=metrics,
                      callbacks=[EarlyStoppingCallback(early_stopping_patience=2)])
    trainer.train(resume_from_checkpoint=a.resume)
    trainer.save_model(a.out)  # ensure final best model lands in out/ (not only checkpoints)
    res = trainer.evaluate(test_ds)
    print("TEST:", json.dumps({k: round(float(v), 4) for k, v in res.items() if isinstance(v, float)}, indent=2))
    with open(os.path.join(a.out, "evaluation_metrics.json"), "w", encoding="utf-8") as f:
        json.dump({"test": res, "base": a.base}, f, indent=2, default=str)


if __name__ == "__main__":
    main()
