"""Prepare ONLY disposable copied extensions for BERT-small experiments.
Production assets stay untouched. Set SAFESHARE_CANDIDATE_DIR for existing browser harnesses.
"""
import json
from pathlib import Path
import shutil

LABEL_MAP = {'PERSON':'GIVEN_NAME','LOCATION':'CITY','EMAIL_ADDRESS':'EMAIL','PHONE_NUMBER':'PHONE',
             'IBAN_CODE':'BANK_ACCOUNT','US_BANK_NUMBER':'BANK_ACCOUNT','US_SSN':'GOVERNMENT_ID',
             'US_PASSPORT':'PASSPORT','US_DRIVER_LICENSE':'DRIVERS_LICENSE','US_ITIN':'TAX_ID'}

def patch_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Disposable adapter patch drift: '+old)
    return text.replace(old,new,1)

def prepare_candidate(extension, directory):
    extension, directory = Path(extension), Path(directory)/'bert-small-int8'
    config=json.loads((directory/'config.json').read_text(encoding='utf-8'))
    vocab=(directory/'vocab.txt').read_text(encoding='utf-8').splitlines()
    source=extension/'engine/wordpiece.js'
    text=source.read_text(encoding='utf-8')
    text=patch_once(text,'const UNK = 1n, CLS = 2n, SEP = 3n;',
                    f'const UNK = {vocab.index("[UNK]")}n, CLS = {vocab.index("[CLS]")}n, SEP = {vocab.index("[SEP]")}n;')
    source.write_text(text,encoding='utf-8')
    offscreen=extension/'offscreen.js'
    text=offscreen.read_text(encoding='utf-8')
    text=patch_once(text,'const numLabels = 35;','const numLabels = Object.keys(id2label).length;')
    text=patch_once(text,'const results = await session.run(feeds);',
                    'for (const name of Object.keys(feeds)) if (!session.inputNames.includes(name)) delete feeds[name];\n    const results = await session.run(feeds);')
    # Do not transfer MiniLM's experimental non-O floor to a different model.
    text=patch_once(text,'if (review && id2label[String(maxIdx)] === "O") {','if (false) {')
    text=patch_once(text,'const rawTag = id2label[String(maxIdx)];',
        'const originalTag = id2label[String(maxIdx)];\n    const map = '+json.dumps(LABEL_MAP)+';\n    const rawTag = originalTag === "O" ? "O" : originalTag.slice(0,2) + (map[originalTag.slice(2)] || originalTag.slice(2));')
    # Existing loader path reused only in this copied extension.
    offscreen.write_text(text,encoding='utf-8')
    shutil.copyfile(directory/'model.quant.onnx',extension/'models/model_q4.onnx')
    shutil.copyfile(directory/'config.json',extension/'models/config.json')
    shutil.copyfile(directory/'vocab.txt',extension/'models/vocab.txt')
    return {'candidate':'bert-small-int8','scope':'temporary adapter, coarse PERSON/LOCATION mapping; native argmax, no alternative floor',
            'labels':len(config['id2label'])}
