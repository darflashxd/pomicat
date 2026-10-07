"""
Contextual Privacy Guard - Token Classification Trainer
Model: distilbert-base-multilingual-cased (Indonesian & English support)
Hardware: NVIDIA GeForce RTX 4060 Laptop GPU (CUDA FP16)
"""

import os
import json
import torch
import numpy as np
from datasets import load_dataset
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    TrainingArguments,
    Trainer,
    DataCollatorForTokenClassification,
    EarlyStoppingCallback
)
import evaluate

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))
OUTPUT_DIR = os.path.join(BASE_DIR, "model_output")
LOGS_DIR = os.path.join(BASE_DIR, "logs")
MODEL_NAME = "distilbert/distilbert-base-multilingual-cased"


def main():
    print(f"[*] Initializing Token Classification Training pipeline...")
    print(f"[*] Target GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}")
    
    # 1. Load schema
    schema_path = os.path.join(DATA_DIR, "schema.json")
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)
        
    labels = schema["labels"]
    label2id = schema["label2id"]
    id2label = {int(k): v for k, v in schema["id2label"].items()}
    num_labels = len(labels)
    
    print(f"[+] Loaded {num_labels} labels: {labels}")
    
    # 2. Load dataset files
    data_files = {
        "train": os.path.join(DATA_DIR, "train.json"),
        "validation": os.path.join(DATA_DIR, "val.json"),
        "test": os.path.join(DATA_DIR, "test.json")
    }
    raw_datasets = load_dataset("json", data_files=data_files)
    print(f"[+] Datasets loaded: {len(raw_datasets['train'])} train, {len(raw_datasets['validation'])} val, {len(raw_datasets['test'])} test")
    
    # 3. Load Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    
    # 4. Tokenization & Subword Alignment
    def tokenize_and_align_labels(examples):
        tokenized_inputs = tokenizer(
            examples["tokens"],
            truncation=True,
            is_split_into_words=True,
            max_length=128
        )
        
        all_labels = []
        for i, ner_tags in enumerate(examples["ner_tags"]):
            word_ids = tokenized_inputs.word_ids(batch_index=i)
            previous_word_idx = None
            label_ids = []
            
            for word_idx in word_ids:
                if word_idx is None:
                    # Special tokens like [CLS], [SEP]
                    label_ids.append(-100)
                elif word_idx != previous_word_idx:
                    # First subtoken of a word gets original label
                    label_str = ner_tags[word_idx]
                    label_ids.append(label2id[label_str])
                else:
                    # Subsequent subtokens receive I- tag if entity, or O
                    label_str = ner_tags[word_idx]
                    if label_str.startswith("B-"):
                        label_str = label_str.replace("B-", "I-")
                    label_ids.append(label2id[label_str])
                previous_word_idx = word_idx
                
            all_labels.append(label_ids)
            
        tokenized_inputs["labels"] = all_labels
        return tokenized_inputs

    print("[*] Preprocessing and aligning dataset tokens with subwords...")
    tokenized_datasets = raw_datasets.map(
        tokenize_and_align_labels,
        batched=True,
        remove_columns=raw_datasets["train"].column_names
    )
    
    # 5. Load Evaluation Metric
    seqeval = evaluate.load("seqeval")
    
    def compute_metrics(p):
        predictions, labels_matrix = p
        predictions = np.argmax(predictions, axis=2)
        
        # Remove ignored index (-100)
        true_predictions = [
            [id2label[p_idx] for (p_idx, l_idx) in zip(prediction, label) if l_idx != -100]
            for prediction, label in zip(predictions, labels_matrix)
        ]
        true_labels = [
            [id2label[l_idx] for (p_idx, l_idx) in zip(prediction, label) if l_idx != -100]
            for prediction, label in zip(predictions, labels_matrix)
        ]
        
        results = seqeval.compute(predictions=true_predictions, references=true_labels, zero_division=0)
        return {
            "precision": results["overall_precision"],
            "recall": results["overall_recall"],
            "f1": results["overall_f1"],
            "accuracy": results["overall_accuracy"],
        }

    # 6. Initialize Model with custom classification head
    print(f"[*] Loading base model: {MODEL_NAME}...")
    model = AutoModelForTokenClassification.from_pretrained(
        MODEL_NAME,
        num_labels=num_labels,
        id2label=id2label,
        label2id=label2id
    )
    
    # 7. Training Arguments
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        eval_strategy="epoch",
        save_strategy="epoch",
        learning_rate=3e-5,
        per_device_train_batch_size=64,
        per_device_eval_batch_size=64,
        dataloader_num_workers=4,
        num_train_epochs=3,
        weight_decay=0.01,
        warmup_steps=150,
        fp16=torch.cuda.is_available(),
        logging_steps=100,
        save_total_limit=1,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        report_to="none"
    )
    
    data_collator = DataCollatorForTokenClassification(tokenizer=tokenizer)
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["validation"],
        data_collator=data_collator,
        processing_class=tokenizer,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)]
    )
    
    # 8. Start Training
    print("[*] Starting model fine-tuning on RTX 4060 GPU...")
    train_result = trainer.train()
    
    # 9. Evaluate on Test Set
    print("\n[*] Evaluating best model on hold-out Test Set...")
    test_results = trainer.evaluate(tokenized_datasets["test"])
    print(f"[+] Test Set Evaluation Metrics:")
    for k, v in test_results.items():
        print(f"    - {k}: {v}")
        
    # 10. Save Best Model and Tokenizer
    best_model_path = os.path.join(OUTPUT_DIR, "best_model")
    os.makedirs(best_model_path, exist_ok=True)
    trainer.save_model(best_model_path)
    tokenizer.save_pretrained(best_model_path)
    
    # Save training metrics log
    metrics_log_path = os.path.join(OUTPUT_DIR, "evaluation_metrics.json")
    with open(metrics_log_path, "w", encoding="utf-8") as f:
        json.dump(test_results, f, indent=2)
        
    print(f"[+] Training complete! Best model saved to: {best_model_path}")
    print(f"[+] Metrics logged to: {metrics_log_path}")

if __name__ == "__main__":
    main()
