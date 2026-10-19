"""Check disposable candidate JS token IDs against local HF tokenizer (no model downloads)."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    parser.add_argument('--external-count',type=int,default=0)
    args=parser.parse_args()
    from transformers import AutoTokenizer
    vocab_path=args.directory/'bert-small-int8/vocab.txt'
    tokenizer=AutoTokenizer.from_pretrained(str(vocab_path.parent),local_files_only=True,trust_remote_code=False)
    texts=['My name is Amelia Hartwell.', 'Hello 👋 José Álvarez at café München.',
           'password=Tr0ub4dor&3; API_KEY=abcdef123456', 'A\u0301lvaro 中文 _hidden_ \u200bword',
           'x'*101, 'Please email amy+test@example.org.', 'short']
    texts += ['Ordinary text. '*60+'My name is Eleanor Ashford.']
    if args.external_count:
        import pyarrow.parquet as pq
        texts += pq.read_table(args.directory/'gretel-test.parquet',columns=['text']).slice(0,args.external_count).column('text').to_pylist()
    script="""
    const fs=require('fs'),vm=require('vm');
    let source=fs.readFileSync('extension/engine/wordpiece.js','utf8').replace('const UNK = 1n, CLS = 2n, SEP = 3n;','const UNK = 100n, CLS = 101n, SEP = 102n;');
    const context={module:{exports:{}}};vm.runInNewContext(source,context);
    const input=JSON.parse(fs.readFileSync(0,'utf8'));
    const vocab=new Map(fs.readFileSync(input.vocab,'utf8').split(/\\r?\\n/).map((v,i)=>[v,i]));
    console.log(JSON.stringify(input.texts.map(t=>context.module.exports.encode(t,vocab).map(w=>({ids:Array.from(w.inputIds,Number),spans:w.tokenSpans})))));
    """
    result=json.loads(subprocess.run(['node','-e',script],input=json.dumps({'texts':texts,'vocab':str(vocab_path)}),
                                    encoding='utf-8',text=True,capture_output=True,check=True,cwd=ROOT,timeout=30).stdout)
    for text,windows in zip(texts,result):
        reference=tokenizer(text,truncation=True,max_length=128,stride=32,return_overflowing_tokens=True)['input_ids']
        assert [w['ids'] for w in windows]==reference, 'Token-ID mismatch'
        for window in windows:
            for span in window['spans']:
                assert 0 <= span['start'] <= span['end'] <= len(text.encode('utf-16-le'))//2
    print(f'PASS: {len(texts)} candidate tokenizer inputs, exact HF token-ID/window parity; JS offsets validated as UTF-16 bounds')

if __name__=='__main__':main()
