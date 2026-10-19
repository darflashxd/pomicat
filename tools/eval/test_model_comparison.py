"""Dependency-free checks: python tools/eval/test_model_comparison.py."""
import json
from pathlib import Path
from model_comparison import canonical, metrics, validate_corpus

rows=[{'id':'one','text':'Alice Smith safe','entities':[['Alice Smith','PERSON']]}]
validate_corpus(rows)
spans=canonical([{'start':0,'end':5,'label':'GIVEN_NAME'},{'start':6,'end':11,'label':'SURNAME'}],rows[0]['text'])
assert spans == [{'start':0,'end':11,'label':'PERSON'}]
assert metrics(rows,[spans])['exact_f1']==1
assert canonical([{'start':0,'end':5,'label':'BANK'}],'12345')[0]['label']=='BANK'
assert canonical([{'start':0,'end':5,'label':'IP'}],'1.2.3')[0]['label']=='IP'
partial=metrics(rows,[[{'start':0,'end':5,'label':'PERSON'}]])
assert partial['full_value_coverage']==0 and partial['partially_covered_entities']==1
for invalid in [[],rows*2,[{'id':'bad','text':'Alice Alice','entities':[['Alice','PERSON']]}]]:
    try:validate_corpus(invalid)
    except ValueError:pass
    else:raise AssertionError('Bad corpus accepted')
try:metrics(rows,[])
except ValueError:pass
else:raise AssertionError('Missing predictions accepted')
corpus=Path(__file__).resolve().parents[2]/'tests/fixtures/model_comparison_en.jsonl'
validate_corpus([json.loads(line) for line in corpus.read_text(encoding='utf-8').splitlines()])
print('PASS: canonical labels, exact spans, partial coverage, corpus validation, missing predictions')
from model_assets import minilm_assets
import tempfile
with tempfile.TemporaryDirectory() as tmp:
    assets = minilm_assets(tmp)
    assert len(json.loads((assets/'config.json').read_text())['id2label']) == 35
    (assets/'config.json').write_text('{}')
    try: minilm_assets(tmp)
    except ValueError: pass
    else: raise AssertionError('Corrupted baseline accepted')
print('PASS: historical MiniLM identity and mismatched baseline rejected')
