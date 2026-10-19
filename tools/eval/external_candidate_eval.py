"""Pinned Gretel test-split comparison, not an unseen independent holdout.
python tools/eval/external_candidate_eval.py MODEL_DIRECTORY --output external.json
Model authors already report this dataset: no thresholds are selected using these results.
"""
import argparse
import ast
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import random
import time
from urllib.request import urlretrieve

os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
ROOT=Path(__file__).resolve().parents[2]
REVISION='e06eb1499ca8d54470f085021cd8e54f9efac7fd'
GOLD_MAP={'name':'PERSON','first_name':'PERSON','last_name':'PERSON','address':'LOCATION','street_address':'LOCATION',
          'city':'LOCATION','state':'LOCATION','country':'LOCATION','postcode':'LOCATION','email':'EMAIL','phone_number':'PHONE'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--count',type=int,default=500)
    args=parser.parse_args()
    import numpy as np
    import onnxruntime as ort
    import psutil
    import pyarrow.parquet as pq
    from tokenizers import BertWordPieceTokenizer
    from transformers import AutoTokenizer
    from model_comparison import canonical, decode, MAP
    path=args.directory/'gretel-test.parquet'
    if not path.exists():
        urlretrieve(f'https://huggingface.co/datasets/gretelai/gretel-pii-masking-en-v1/resolve/{REVISION}/data/test-00000-of-00001.parquet',path)
    source=pq.read_table(path).to_pylist()
    random.Random(20261019).shuffle(source)
    rows=[]
    for row in source:
        gold=[]
        for entity in ast.literal_eval(row['entities']):
            labels={GOLD_MAP[t] for t in entity['types'] if t in GOLD_MAP}
            if len(labels)!=1:continue
            value=entity['entity'];start=0
            while value and (start:=row['text'].find(value,start))>=0:
                gold.append({'start':start,'end':start+len(value),'label':next(iter(labels))});start+=len(value)
        if gold:
            rows.append({'id':row['uid'],'domain':row['domain'],'text':row['text'],'gold':canonical(gold,row['text'])})
        if len(rows)>=args.count:break
    if len(rows)!=args.count:raise ValueError('Not enough annotated samples')
    lock={'dataset':'gretelai/gretel-pii-masking-en-v1','revision':REVISION,'split':'test','license':'apache-2.0',
          'source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'seed':20261019,
          'selected_ids':[r['id'] for r in rows],'domains':dict(Counter(r['domain'] for r in rows)),
          'warning':'external synthetic test split; prior published use and unknown training overlap; not unseen holdout'}
    (args.directory/'external-selection.json').write_text(json.dumps(lock,indent=2),encoding='utf-8')
    report={'selection':lock,'labels':sorted(set(GOLD_MAP.values())),'models':{}}
    from model_assets import minilm_assets
    baseline=minilm_assets(args.directory)
    for name,model,config in [('minilm',baseline/'model_q4.onnx',baseline/'config.json'),
                              ('bert-small-int8',args.directory/'bert-small-int8/model.quant.onnx',args.directory/'bert-small-int8/config.json')]:
        process=psutil.Process();before=process.memory_info().rss
        opts=ort.SessionOptions();opts.intra_op_num_threads=1;opts.inter_op_num_threads=1
        t=time.perf_counter();session=ort.InferenceSession(str(model),sess_options=opts,providers=['CPUExecutionProvider'])
        load=(time.perf_counter()-t)*1000;loaded=process.memory_info().rss;peak=loaded
        mapping=json.loads(config.read_text())['id2label']
        if name=='minilm':
            tok=BertWordPieceTokenizer(str(baseline/'vocab.txt'),lowercase=True,strip_accents=True)
            # Reference tokenizer, not the production JS tokenizer; parity tested separately.
            tok.enable_truncation(max_length=128,stride=32)
        else:
            tok=AutoTokenizer.from_pretrained(str(model.parent),local_files_only=True,trust_remote_code=False)
        tp=fp=fn=covered=partial=total=0;times=[];per_label={};predictions=[];max_windows=0
        for row in rows:
            t=time.perf_counter()
            if name=='minilm':
                enc=tok.encode(row['text']);windows=[{'input_ids':e.ids,'attention_mask':e.attention_mask,'token_type_ids':e.type_ids,'offsets':e.offsets} for e in [enc]+enc.overflowing]
            else:
                enc=tok(row['text'],return_offsets_mapping=True,return_overflowing_tokens=True,truncation=True,max_length=128,stride=32)
                windows=[{'input_ids':ids,'attention_mask':enc['attention_mask'][i],'token_type_ids':enc.get('token_type_ids',[[0]*len(x) for x in enc['input_ids']])[i],'offsets':enc['offset_mapping'][i]} for i,ids in enumerate(enc['input_ids'])]
            result=[];max_windows=max(max_windows,len(windows))
            for enc in windows:
                feeds={i.name:np.asarray([enc[i.name]],dtype=np.int64) for i in session.get_inputs()}
                result.extend(decode(row['text'],enc['offsets'],session.run(None,feeds)[0][0],mapping))
            pred={(s['start'],s['end'],s['label']) for s in canonical(result,row['text']) if s['label'] in set(GOLD_MAP.values())}
            gold={(s['start'],s['end'],s['label']) for s in row['gold']}
            tp+=len(pred&gold);fp+=len(pred-gold);fn+=len(gold-pred)
            for label in sorted(set(GOLD_MAP.values())):
                p={s for s in pred if s[2]==label};g={s for s in gold if s[2]==label}
                c=per_label.setdefault(label,Counter());c.update(tp=len(p&g),fp=len(p-g),fn=len(g-p))
            for start,end,label in gold:
                chars=set()
                for a,b,l in pred:
                    if l==label:chars.update(range(max(a,start),min(b,end)))
                total+=1;covered+=len(chars)==end-start;partial+=0<len(chars)<end-start
            times.append((time.perf_counter()-t)*1000);peak=max(peak,process.memory_info().rss)
            predictions.append({'id':row['id'],'spans':sorted(pred)})
        p=tp/(tp+fp) if tp+fp else 0;r=tp/(tp+fn) if tp+fn else 0
        report['models'][name]={'exact_precision':p,'exact_recall':r,'exact_f1':2*p*r/(p+r) if p+r else 0,
            'full_value_coverage':covered/total,'gold_entities':total,'partial_entities':partial,'per_label':per_label,
            'p50_ms':float(np.percentile(times,50)),'p95_ms':float(np.percentile(times,95)),'load_ms':load,
            'rss_before':before,'rss_after_load':loaded,'rss_sampled_max':peak,'memory_scope':'shared process sampled RSS, not isolated peak; not browser memory',
            'max_windows':max_windows,'predictions':predictions}
        print(name,json.dumps({k:v for k,v in report['models'][name].items() if k not in ['predictions','per_label']}),flush=True)
        del session
    args.output.write_text(json.dumps(report,indent=2),encoding='utf-8')

if __name__=='__main__':main()
