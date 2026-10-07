"""
ONNX Export and INT8 Quantization Script for In-Browser WebGPU/WASM Inference
Exports fine-tuned DistilBERT Token Classifier to ONNX format.
"""

import os
import shutil
import json
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer
from optimum.onnxruntime import ORTModelForTokenClassification, ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_INPUT_DIR = os.path.join(BASE_DIR, "model_output", "best_model")
ONNX_OUTPUT_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "extension", "models", "onnx"))


def export_and_quantize():
    os.makedirs(ONNX_OUTPUT_DIR, exist_ok=True)
    print(f"[*] Starting ONNX export from: {MODEL_INPUT_DIR}")
    print(f"[*] Destination directory: {ONNX_OUTPUT_DIR}")

    # 1. Export to ONNX using Optimum
    print("[*] Exporting PyTorch graph to ONNX...")
    ort_model = ORTModelForTokenClassification.from_pretrained(
        MODEL_INPUT_DIR,
        export=True
    )
    ort_model.save_pretrained(ONNX_OUTPUT_DIR)
    
    # 2. Copy Tokenizer files
    tokenizer = AutoTokenizer.from_pretrained(MODEL_INPUT_DIR)
    tokenizer.save_pretrained(ONNX_OUTPUT_DIR)
    print("[+] Model and Tokenizer saved in ONNX format.")

    # Check unquantized size
    unquantized_path = os.path.join(ONNX_OUTPUT_DIR, "model.onnx")
    size_mb = os.path.getsize(unquantized_path) / (1024 * 1024)
    print(f"[+] Unquantized model.onnx size: {size_mb:.2f} MB")

    # 3. Dynamic INT8 Quantization
    print("[*] Applying Dynamic INT8 Quantization for lightweight browser memory usage...")
    quantizer = ORTQuantizer.from_pretrained(ort_model)
    dqconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
    
    quantized_output_dir = os.path.join(ONNX_OUTPUT_DIR, "quantized")
    os.makedirs(quantized_output_dir, exist_ok=True)
    quantizer.quantize(
        save_dir=quantized_output_dir,
        quantization_config=dqconfig
    )
    tokenizer.save_pretrained(quantized_output_dir)

    # Check quantized size
    quantized_path = os.path.join(quantized_output_dir, "model_quantized.onnx")
    q_size_mb = os.path.getsize(quantized_path) / (1024 * 1024)
    print(f"[+] Quantized model_quantized.onnx size: {q_size_mb:.2f} MB (Reduced by {((size_mb - q_size_mb)/size_mb)*100:.1f}%)")

    # 4. Verification Test with ONNX Runtime
    print("\n[*] Verifying ONNX model inference latency and correctness...")
    session = ort.InferenceSession(quantized_path, providers=["CPUExecutionProvider"])
    
    sample_text = "Gaji saya per bulan saat ini adalah Rp 25.000.000."
    inputs = tokenizer(sample_text, return_tensors="np")
    
    ort_inputs = {
        "input_ids": inputs["input_ids"],
        "attention_mask": inputs["attention_mask"]
    }
    
    import time
    start_t = time.perf_counter()
    ort_outputs = session.run(None, ort_inputs)
    elapsed_ms = (time.perf_counter() - start_t) * 1000
    
    logits = ort_outputs[0]
    preds = np.argmax(logits, axis=-1)[0]
    tokens = tokenizer.convert_ids_to_tokens(inputs["input_ids"][0])
    
    with open(os.path.join(MODEL_INPUT_DIR, "config.json"), "r") as f:
        cfg = json.load(f)
    id2label = cfg["id2label"]
    
    print(f"[+] Inference latency: {elapsed_ms:.2f} ms")
    print("[+] Sample inference prediction:")
    for tok, pred in zip(tokens, preds):
        lbl = id2label[str(pred)]
        if lbl != "O":
            print(f"    {tok:12} -> {lbl}")

    print("\n[+] ONNX export and verification completed successfully!")

if __name__ == "__main__":
    export_and_quantize()
