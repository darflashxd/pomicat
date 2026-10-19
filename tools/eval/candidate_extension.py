"""Stage candidate assets in a disposable extension; never patch production source strings."""
import hashlib
import json
from pathlib import Path
import shutil

def prepare_candidate(extension, directory):
    extension, directory = Path(extension), Path(directory) / 'bert-small-int8'
    config = json.loads((directory / 'config.json').read_text(encoding='utf-8'))
    if len(config['id2label']) != 51 or config.get('vocab_size') != 30522:
        raise ValueError('Unexpected candidate label/vocabulary configuration')
    source = directory / 'model.quant.onnx'
    if hashlib.sha256(source.read_bytes()).hexdigest() != 'b227845ff4989c9f7383874b841895dfbdb9a4d7a20ceb39c3f187271894bf2a':
        raise ValueError('Candidate weight hash mismatch')
    for src, dst in [('model.quant.onnx', 'model_q4.onnx'), ('config.json', 'config.json'), ('vocab.txt', 'vocab.txt')]:
        shutil.copyfile(directory / src, extension / 'models' / dst)
    return {'candidate': 'bert-small-int8', 'scope': 'current runtime with pinned candidate assets; native PERSON/LOCATION', 'labels': 51}
