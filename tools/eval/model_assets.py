"""Explicit historical baseline; never label the mutable production assets as MiniLM."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
MINILM_COMMIT = 'fb35c63'
FILES = ['model_q4.onnx', 'config.json', 'vocab.txt']

def minilm_assets(directory):
    dest = Path(directory) / 'minilm-baseline'
    blobs = {}
    for name in FILES:
        blobs[name] = subprocess.run(['git', 'show', f'{MINILM_COMMIT}:extension/models/{name}'], cwd=ROOT,
                                     capture_output=True, check=True, timeout=30).stdout
    config = json.loads(blobs['config.json'])
    if len(config['id2label']) != 35 or config.get('vocab_size') != 19730:
        raise ValueError('Historical baseline identity mismatch')
    dest.mkdir(parents=True, exist_ok=True)
    for name, data in blobs.items():
        path = dest / name
        if path.exists() and path.read_bytes() != data:
            raise ValueError('Baseline asset mismatch: ' + name)
        if not path.exists():
            path.write_bytes(data)
    (dest / 'manifest.json').write_text(json.dumps({'commit': MINILM_COMMIT, 'sha256': {
        name: hashlib.sha256(data).hexdigest() for name, data in blobs.items()}}, indent=2), encoding='utf-8')
    return dest
