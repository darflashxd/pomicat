"""English development comparison, not a holdout/accuracy certification.
python tools/eval/model_comparison.py MODEL_DIRECTORY --output report.json
Candidate downloads: download_candidates.py. No private data or network inference.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
ROOT = Path(__file__).resolve().parents[2]
LABELS = ['person', 'location', 'email address', 'phone number', 'password', 'bank account', 'secret', 'ip address']
MAP = {**{x:'PERSON' for x in ['PERSON','GIVEN_NAME','SURNAME']},
       **{x:'LOCATION' for x in ['LOCATION','BUILDING_NUMBER','STREET_NAME','SECONDARY_ADDRESS','CITY','STATE','ZIP_CODE']},
       'EMAIL':'EMAIL','EMAIL_ADDRESS':'EMAIL','PHONE':'PHONE','PHONE_NUMBER':'PHONE',
       'PASSWORD':'PASSWORD','IBAN_CODE':'BANK','BANK_ACCOUNT':'BANK','US_BANK_NUMBER':'BANK',
       'IP_ADDRESS':'IP','IP':'IP','BANK':'BANK','SECRET':'SECRET'}
COMMON = {'PERSON','LOCATION','EMAIL','PHONE'}

def validate_corpus(rows):
    if not rows or len({r['id'] for r in rows}) != len(rows):
        raise ValueError('Empty corpus or duplicate IDs')
    for row in rows:
        for value,label in row['entities']:
            if not value or row['text'].count(value) != 1 or label not in {'PERSON','LOCATION','EMAIL','PHONE','PASSWORD','BANK','SECRET','IP'}:
                raise ValueError('Invalid or ambiguous corpus annotation: '+row['id'])

def canonical(spans, text):
    result = []
    for span in sorted(spans, key=lambda x:(x['start'],x['end'])):
        label = MAP.get(span['label'])
        if not label:
            continue
        s = dict(span, label=label)
        if result and result[-1]['label'] == label and s['start'] <= result[-1]['end'] + 2 and not text[result[-1]['end']:s['start']].strip(' ,'):
            result[-1]['end'] = max(result[-1]['end'],s['end'])
        else:
            result.append(s)
    return result

def metrics(rows, predictions, allowed=None):
    if len(rows) != len(predictions):
        raise ValueError('Missing predictions')
    tp = fp = fn = covered = total = partial = benign = 0
    for row, spans in zip(rows,predictions):
        for span in spans:
            if not 0 <= span['start'] < span['end'] <= len(row['text']):
                raise ValueError('Prediction outside source text')
        gold = {(row['text'].index(value),row['text'].index(value)+len(value),label) for value,label in row['entities'] if allowed is None or label in allowed}
        pred = {(s['start'],s['end'],s['label']) for s in spans if allowed is None or s['label'] in allowed}
        tp += len(gold & pred); fp += len(pred-gold); fn += len(gold-pred)
        if not row['entities']:
            benign += len(pred)
        for start,end,label in gold:
            chars = set()
            for s,e,l in pred:
                if l == label:
                    chars.update(range(max(s,start),min(e,end)))
            total += 1
            covered += len(chars) == end-start
            partial += 0 < len(chars) < end-start
    precision = tp/(tp+fp) if tp+fp else 0
    recall = tp/(tp+fn) if tp+fn else 0
    return {'exact_precision':precision,'exact_recall':recall,'exact_f1':2*precision*recall/(precision+recall) if precision+recall else 0,
            'full_value_coverage':covered/total if total else None,'partially_covered_entities':partial,
            'gold_entities':total,'false_positive_spans':fp,'benign_suggestions':benign}

def decode(text, offsets, logits, mapping):
    import numpy as np
    spans=[]; current=None
    for (start,end), scores in zip(offsets,logits):
        if start == end:
            continue
        idx=int(np.argmax(scores)); tag=mapping[str(idx)]
        if tag == 'O':
            current=None; continue
        prefix,label=tag.split('-',1) if '-' in tag else ('B',tag)
        if current and prefix=='I' and current['label']==label:
            current['end']=int(end)
        else:
            current={'start':int(start),'end':int(end),'label':label}
            spans.append(current)
    return spans

def minilm_encodings(rows, vocab_path):
    # Exact production JS tokenizer; convert UTF-16 spans to Python code-point offsets.
    script = """
    const fs=require('fs'), WP=require('./extension/engine/wordpiece.js');
    const input=JSON.parse(fs.readFileSync(0,'utf8'));
    const vocab=new Map(fs.readFileSync(input.vocab,'utf8').split(/\\r?\\n/).map((v,i)=>[v,i]));
    const rows=input.rows;
    console.log(JSON.stringify(rows.map(r=>WP.encode(r.text,vocab).map(e=>({
      input_ids:Array.from(e.inputIds,Number),attention_mask:Array.from(e.attentionMask,Number),token_type_ids:Array.from(e.tokenTypeIds,Number),
      offsets:e.tokenSpans.map(s=>[...r.text.slice(0,s.start)].length).map((s,i)=>[s,[...r.text.slice(0,e.tokenSpans[i].end)].length])
    })))));
    """
    return json.loads(subprocess.run(['node','-e',script],input=json.dumps({'rows':rows,'vocab':str(vocab_path)}),capture_output=True,text=True,encoding='utf-8',cwd=ROOT,check=True,timeout=30).stdout)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    import numpy as np
    import onnxruntime as ort
    from transformers import AutoTokenizer
    corpus=ROOT/'tests/fixtures/model_comparison_en.jsonl'
    rows=[json.loads(line) for line in corpus.read_text(encoding='utf-8').splitlines()]
    validate_corpus(rows)
    from model_assets import minilm_assets
    baseline=minilm_assets(args.directory)
    encodings=minilm_encodings(rows, baseline/'vocab.txt')
    report={'scope':'30 manually authored fictional EN development cases; no independent holdout; canonical label merge; no threshold tuning',
            'corpus_sha256':hashlib.sha256(corpus.read_bytes()).hexdigest(),
            'environment':{'python':platform.python_version(),'platform':platform.platform(),'packages':{p:importlib.metadata.version(p) for p in ['onnxruntime','transformers','gliner','numpy']}},'models':{}}
    opts=ort.SessionOptions(); opts.intra_op_num_threads=1; opts.inter_op_num_threads=1
    for name, model_path, config_path in [
        ('minilm', baseline/'model_q4.onnx',baseline/'config.json'),
        ('bert-small-int8',args.directory/'bert-small-int8/model.quant.onnx',args.directory/'bert-small-int8/config.json')]:
        start=time.perf_counter(); session=ort.InferenceSession(str(model_path),sess_options=opts,providers=['CPUExecutionProvider'])
        load_ms=(time.perf_counter()-start)*1000
        mapping=json.loads(config_path.read_text())['id2label']
        tokenizer=None if name=='minilm' else AutoTokenizer.from_pretrained(str(model_path.parent),local_files_only=True,trust_remote_code=False)
        def predict(index):
            text=rows[index]['text']
            if tokenizer:
                enc=tokenizer(text,return_offsets_mapping=True,return_tensors='np',truncation=False)
                if enc['input_ids'].shape[1] > 128:
                    raise ValueError('Short-input benchmark must not silently truncate; add windowed candidate evaluation first')
                windows=[{'offsets':enc['offset_mapping'][0],**{k:v[0] for k,v in enc.items() if k!='offset_mapping'}}]
            else:
                windows=encodings[index]
            spans=[]
            for enc in windows:
                feeds={i.name:np.asarray([enc[i.name]],dtype=np.int64) for i in session.get_inputs()}
                logits=session.run(None,feeds)[0][0]
                spans.extend(decode(text,enc['offsets'],logits,mapping))
            return canonical(spans,text)
        predict(0)
        predictions=[]; latency=[]
        for i in range(len(rows)):
            t=time.perf_counter(); predictions.append(predict(i)); latency.append((time.perf_counter()-t)*1000)
        report['models'][name]={'model_bytes':model_path.stat().st_size,'sha256':hashlib.sha256(model_path.read_bytes()).hexdigest(),'load_ms':load_ms,
            'warm_p50_ms':float(np.percentile(latency,50)),'warm_p95_ms':float(np.percentile(latency,95)),
            'common_labels':metrics(rows,predictions,COMMON),'all_mapped_labels':metrics(rows,predictions),
            'predictions':[{'id':r['id'],'spans':p} for r,p in zip(rows,predictions)],'threads':1}
        del session
    from gliner import GLiNER
    start=time.perf_counter()
    model=GLiNER.from_pretrained(str(args.directory/'gliner-edge-int8'),local_files_only=True,load_onnx_model=True,onnx_model_file='onnx/model_quint8.onnx')
    model.model.session = ort.InferenceSession(str(args.directory/'gliner-edge-int8/onnx/model_quint8.onnx'),sess_options=opts,providers=['CPUExecutionProvider'])
    load_ms=(time.perf_counter()-start)*1000
    def predict_gliner(row):
        spans=model.predict_entities(row['text'],LABELS,threshold=0.3)
        labels=dict(zip(LABELS,['PERSON','LOCATION','EMAIL','PHONE','PASSWORD','BANK','SECRET','IP']))
        return canonical([{**s,'label':labels[s['label']]} for s in spans],row['text'])
    model_file=args.directory/'gliner-edge-int8/onnx/model_quint8.onnx'
    predict_gliner(rows[0]); predictions=[]; latency=[]
    for row in rows:
        t=time.perf_counter(); predictions.append(predict_gliner(row));latency.append((time.perf_counter()-t)*1000)
    report['models']['gliner-edge-int8']={'model_bytes':model_file.stat().st_size,'sha256':hashlib.sha256(model_file.read_bytes()).hexdigest(),'load_ms':load_ms,
        'warm_p50_ms':float(np.percentile(latency,50)),'warm_p95_ms':float(np.percentile(latency,95)),
        'common_labels':metrics(rows,predictions,COMMON),'all_mapped_labels':metrics(rows,predictions),
        'predictions':[{'id':r['id'],'spans':p} for r,p in zip(rows,predictions)],'threshold':0.3,'threads':1,
        'timing_scope':'includes Python GLiNER preprocessing/decoding; load includes initial default session and controlled replacement'}
    args.output.write_text(json.dumps(report,indent=2),encoding='utf-8')
    for name,result in report['models'].items():
        print(name,json.dumps({k:v for k,v in result.items() if k not in ['predictions','sha256']}))

if __name__=='__main__':
    main()
