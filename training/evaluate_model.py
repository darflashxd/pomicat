"""
Evaluation & Inference Test for Contextual Privacy Guard
Demonstrates that the model discriminates between:
1. Personal private data -> REDACT / SENSITIVE
2. Statistical / Educational / General data -> PRESERVE / SAFE (O)
"""

import os
import torch
import json
from transformers import AutoTokenizer, AutoModelForTokenClassification

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model_output", "best_model")

def run_test_cases():
    print(f"[*] Loading trained model from: {MODEL_PATH}")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    model = AutoModelForTokenClassification.from_pretrained(MODEL_PATH).to(device)
    model.eval()

    test_pairs = [
        # Financial Context Contrast
        (
            "Gaji pokok saya saat ini adalah Rp 25.000.000 per bulan di kantor.",
            "Rata-rata gaji Software Engineer di Jakarta adalah Rp 25.000.000 per bulan."
        ),
        (
            "My current take-home compensation is $150,000 annually.",
            "The median industry salary for cloud architects is $150,000 annually."
        ),
        (
            "Tolong bantu saya, hutang pinjol saya sudah menumpuk hingga Rp 45.000.000.",
            "Misalkan seorang pengusaha meminjam modal awal Rp 45.000.000 dengan bunga 5%."
        ),
        # Health Context Contrast
        (
            "Dokter mendiagnosis saya mengidap kanker usus stadium 2.",
            "Apa saja faktor risiko utama dan penanganan medis untuk kanker usus stadium 2?"
        ),
        (
            "Psikiater meresepkan saya obat Lexapro 20mg setiap malam.",
            "Bagaimana mekanisme kerja farmakologi dari obat Lexapro 20mg pada reseptor serotonin?"
        ),
        # Corporate Confidential vs Public
        (
            "Nama kode rahasia proyek integrasi perbankan kita adalah Project Valkyrie Core.",
            "Proyek open source Apache Kafka menyediakan sistem message streaming performa tinggi."
        ),
        (
            "Server staging internal kita dapat dihubungi melalui endpoint prod-db-master.corp.internal:5432.",
            "Contoh koneksi database lokal untuk testing: postgresql://localhost:5432/testdb."
        ),
        # HR Disciplinary vs Law
        (
            "Saya baru saja dijatuhi sanksi Surat Peringatan Ketiga (SP-3) oleh manajemen.",
            "Berdasarkan regulasi ketenagakerjaan, apa syarat hukum sahnya penerbitan Surat Peringatan Ketiga (SP-3)?"
        )
    ]

    print("\n" + "="*80)
    print("           EMPIRICAL CONTEXTUAL INTEGRITY TEST RESULTS")
    print("="*80)

    for i, (personal_sent, safe_sent) in enumerate(test_pairs, 1):
        print(f"\n[Test Case {i}]")
        
        # Test 1: Personal (Expected: SENSITIVE detected)
        inputs_p = tokenizer(personal_sent, return_tensors="pt", return_offsets_mapping=True).to(device)
        offset_p = inputs_p.pop("offset_mapping")[0]
        with torch.no_grad():
            outputs_p = model(**inputs_p)
        preds_p = torch.argmax(outputs_p.logits, dim=-1)[0].cpu().numpy()
        tokens_p = tokenizer.convert_ids_to_tokens(inputs_p["input_ids"][0])
        
        sensitive_spans_p = []
        current_span = []
        for tok, pred in zip(tokens_p, preds_p):
            if tok in ["[CLS]", "[SEP]", "[PAD]"]:
                continue
            label = model.config.id2label[pred]
            if label != "O":
                current_span.append((tok, label))
            elif current_span:
                sensitive_spans_p.append(current_span)
                current_span = []
        if current_span:
            sensitive_spans_p.append(current_span)
            
        print(f"  [A] PERSONAL (Expected: REDACT):")
        print(f"      Text: \"{personal_sent}\"")
        if sensitive_spans_p:
            findings = [" ".join([t[0] for t in span]) + f" [{span[0][1]}]" for span in sensitive_spans_p]
            print(f"      -> SENSITIVE DETECTED: {', '.join(findings)} -> [WILL BE REDACTED]")
        else:
            print(f"      -> NONE (WARNING)")

        # Test 2: Safe / Statistical (Expected: ALL SAFE / O)
        inputs_s = tokenizer(safe_sent, return_tensors="pt", return_offsets_mapping=True).to(device)
        offset_s = inputs_s.pop("offset_mapping")[0]
        with torch.no_grad():
            outputs_s = model(**inputs_s)
        preds_s = torch.argmax(outputs_s.logits, dim=-1)[0].cpu().numpy()
        tokens_s = tokenizer.convert_ids_to_tokens(inputs_s["input_ids"][0])
        
        sensitive_spans_s = []
        current_span_s = []
        for tok, pred in zip(tokens_s, preds_s):
            if tok in ["[CLS]", "[SEP]", "[PAD]"]:
                continue
            label = model.config.id2label[pred]
            if label != "O":
                current_span_s.append((tok, label))
            elif current_span_s:
                sensitive_spans_s.append(current_span_s)
                current_span_s = []
        if current_span_s:
            sensitive_spans_s.append(current_span_s)
            
        print(f"  [B] STATISTICAL / GENERAL (Expected: SAFE PRESERVE):")
        print(f"      Text: \"{safe_sent}\"")
        if sensitive_spans_s:
            findings_s = [" ".join([t[0] for t in span]) for span in sensitive_spans_s]
            print(f"      -> WARNING: False Positive on: {findings_s}")
        else:
            print(f"      -> 100% SAFE (Utility Preserved - No Over-Redaction!)")

    print("\n" + "="*80)
    print("All empirical tests completed successfully!")

if __name__ == "__main__":
    run_test_cases()
