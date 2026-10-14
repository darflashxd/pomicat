import os
import json
import urllib.request
import pandas as pd
from huggingface_hub import hf_hub_download

os.makedirs("data/benchmarks", exist_ok=True)

print("[1/3] Downloading Microsoft Presidio Research Dataset...")
presidio_url = "https://raw.githubusercontent.com/microsoft/presidio-research/master/data/synth_dataset_v2.json"
presidio_out = "data/benchmarks/presidio_synth_v2.json"
if not os.path.exists(presidio_out):
    urllib.request.urlretrieve(presidio_url, presidio_out)
    print("  [+] Saved Presidio dataset to:", presidio_out)
else:
    print("  [+] Presidio dataset already exists.")

print("[2/3] Downloading Gretel AI Synthetic Finance PII Dataset...")
gretel_out = "data/benchmarks/gretel_finance_test.json"
if not os.path.exists(gretel_out):
    gretel_parquet = hf_hub_download(
        repo_id="gretelai/synthetic_pii_finance_multilingual",
        filename="data/English_test-00000-of-00001.parquet",
        repo_type="dataset"
    )
    df = pd.read_parquet(gretel_parquet)
    # Extract only necessary columns: generated_text, pii_spans, document_type
    records = []
    for _, row in df.iterrows():
        spans = []
        try:
            spans = json.loads(row["pii_spans"]) if isinstance(row["pii_spans"], str) else row["pii_spans"]
        except Exception:
            spans = []
        records.append({
            "text": row["generated_text"],
            "spans": spans,
            "doc_type": row.get("document_type", "")
        })
    with open(gretel_out, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False)
    print(f"  [+] Saved {len(records)} Gretel records to:", gretel_out)
else:
    print("  [+] Gretel dataset already exists.")

print("[3/3] Downloading ai4privacy 300k English Benchmark...")
ai4privacy_out = "data/benchmarks/ai4privacy_openpii_8k.jsonl"
if not os.path.exists(ai4privacy_out):
    ai4privacy_path = hf_hub_download(
        repo_id="ai4privacy/pii-masking-300k",
        filename="data/validation/1english_openpii_8k.jsonl",
        repo_type="dataset"
    )
    import shutil
    shutil.copyfile(ai4privacy_path, ai4privacy_out)
    print("  [+] Saved ai4privacy validation set to:", ai4privacy_out)
else:
    print("  [+] ai4privacy dataset already exists.")

print("[*] All benchmark datasets ready in data/benchmarks/")
