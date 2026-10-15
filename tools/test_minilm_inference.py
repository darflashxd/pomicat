import json
import time
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

model_dir = 'training/model_output/minilm_q4'
tokenizer = AutoTokenizer.from_pretrained(model_dir)

with open(f'{model_dir}/config.json') as f:
    cfg = json.load(f)
id2label = cfg['id2label']

session = ort.InferenceSession(f'{model_dir}/model_q4.onnx', providers=['CPUExecutionProvider'])

test_texts = [
    'Answer: Tube Snake Boogie by Szabina J Gelencser',
    'The address of Persint is 6750 Koskikatu 25 Apt. 864 Artilleros, CO Uruguay 64677',
    'Billing address: Sara Schwarz, 28245 Puruntie 82 Apt. 595, LAPPEENRANTA',
    'My driver license is U62928788557186',
    'Rata-rata gaji Software Engineer di Jakarta adalah Rp 25.000.000 per bulan.'
]

print('=== BENCHMARKING MiniLM Q4 (14.01 MB) ===')
for text in test_texts:
    inputs = tokenizer(text, return_tensors='np', truncation=True, max_length=128)
    ort_inputs = {
        'input_ids': inputs['input_ids'].astype(np.int64),
        'attention_mask': inputs['attention_mask'].astype(np.int64),
        'token_type_ids': inputs['token_type_ids'].astype(np.int64) if 'token_type_ids' in inputs else np.zeros_like(inputs['input_ids']).astype(np.int64)
    }
    t0 = time.perf_counter()
    outputs = session.run(None, ort_inputs)
    latency_ms = (time.perf_counter() - t0) * 1000

    preds = np.argmax(outputs[0][0], axis=-1)
    tokens = tokenizer.convert_ids_to_tokens(inputs['input_ids'][0])

    entities = []
    for tok, pred in zip(tokens, preds):
        lbl = id2label[str(pred)]
        if lbl != 'O':
            entities.append(f'{tok}:{lbl}')

    print(f'Text: {text[:65]}...')
    print(f'  Latency: {latency_ms:.2f} ms | Detected: {entities}')
