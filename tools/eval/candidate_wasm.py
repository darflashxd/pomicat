"""Local WASM graph compatibility/timing, not full candidate extension integration.
python tools/eval/candidate_wasm.py MODEL_DIRECTORY --output wasm.json
BERT uses its own HF tokenizer exports; GLiNER feeds use its installed library. No remote JS.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import tempfile
from threading import Thread
import time

os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
ROOT=Path(__file__).resolve().parents[2]
SCRIPT="""
window.runCandidate = async (name) => {
  ort.env.wasm.numThreads=1;
  ort.env.wasm.proxy=false;
  ort.env.wasm.wasmPaths=new URL('/runtime/',location.href).href;
  const batch=await (await fetch('/feeds.json')).json();
  const feeds=batch[name];
  const start=performance.now();
  const session=await ort.InferenceSession.create('/'+name+'.onnx',{executionProviders:['wasm']});
  const loadMs=performance.now()-start;
  let logits, timings=[];
  for(let i=0;i<4;i++) {
    const tensors={};
    for(const input of session.inputNames) {
      const f=feeds[input];
      tensors[input]=new ort.Tensor('int64',BigInt64Array.from(f.data,BigInt),f.shape);
    }
    const t=performance.now(); const result=await session.run(tensors);
    const output=result[session.outputNames[0]];
    if(!Array.from(output.data).every(Number.isFinite)) throw Error('Nonfinite model output');
    timings.push(performance.now()-t); logits=Array.from(output.data);
  }
  await session.release();
  return {name,loadMs,inferenceMs:timings,logits,scope:'pre-tokenized single input, model kernels only'};
};
"""

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--browser',choices=['chromium','firefox'],default='chromium')
    args=parser.parse_args()
    import numpy as np
    import onnxruntime as ort
    from transformers import AutoTokenizer
    from gliner import GLiNER
    from playwright.sync_api import sync_playwright
    from model_comparison import LABELS, minilm_encodings
    text='My name is Amelia Hartwell. My email is amelia@example.org.'
    bert=AutoTokenizer.from_pretrained(str(args.directory/'bert-small-int8'),local_files_only=True,trust_remote_code=False)(text,return_tensors='np')
    from model_assets import minilm_assets
    baseline=minilm_assets(args.directory)
    mini=minilm_encodings([{'text':text}],baseline/'vocab.txt')[0][0]
    model=GLiNER.from_pretrained(str(args.directory/'gliner-edge-int8'),local_files_only=True,load_onnx_model=True,onnx_model_file='onnx/model_quint8.onnx')
    prepared=model.prepare_batch([text],LABELS)
    gliner=model.collate_batch(prepared['input_x'],prepared['entity_types'],model.create_collator())
    paths={'minilm':baseline/'model_q4.onnx','bert-small-int8':args.directory/'bert-small-int8/model.quant.onnx','gliner-edge-int8':args.directory/'gliner-edge-int8/onnx/model_quint8.onnx'}
    feeds={}; references={}
    opts=ort.SessionOptions();opts.intra_op_num_threads=1
    for name,path in paths.items():
        s=ort.InferenceSession(str(path),sess_options=opts,providers=['CPUExecutionProvider'])
        source=mini if name=='minilm' else bert if name=='bert-small-int8' else gliner
        inputs={i.name:np.asarray(source[i.name],dtype=np.int64) for i in s.get_inputs()}
        if name=='minilm': inputs={k:v[None,:] for k,v in inputs.items()}
        feeds[name]={k:{'data':v.reshape(-1).tolist(),'shape':list(v.shape)} for k,v in inputs.items()}
        references[name]=s.run(None,inputs)[0].reshape(-1)
    base=Path(os.environ.get('LOCALAPPDATA',tempfile.gettempdir()))/'Temp/opencode'
    base.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='safeshare-candidate-wasm-',dir=base) as tmp:
        tmp=Path(tmp);(tmp/'runtime').mkdir()
        for f in (ROOT/'extension/models').glob('ort*'): shutil.copyfile(f,tmp/'runtime'/f.name)
        for name,path in paths.items(): shutil.copyfile(path,tmp/(name+'.onnx'))
        (tmp/'feeds.json').write_text(json.dumps(feeds),encoding='utf-8')
        (tmp/'bench.js').write_text(SCRIPT,encoding='utf-8')
        (tmp/'index.html').write_text('<!doctype html><title>Local candidate WASM test</title><script src="runtime/ort.min.js"></script><script src="bench.js"></script>',encoding='utf-8')
        class Quiet(SimpleHTTPRequestHandler):
            def log_message(self,*args): pass
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(tmp)))
        Thread(target=server.serve_forever,daemon=True).start()
        report={'scope':args.browser+' WASM compatibility; fixed preprocessed input, not browser tokenizer or extension integration','models':{}}
        try:
            with sync_playwright() as p:
                browser=getattr(p,args.browser).launch()
                try:
                    for name in paths:
                        page=browser.new_page()
                        origin=f'http://127.0.0.1:{server.server_port}'
                        page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin+'/') else route.abort())
                        page.goto(origin)
                        try:
                            result=page.evaluate('name=>runCandidate(name)',name)
                            values=np.array(result.pop('logits'))
                            result['max_logit_difference_vs_native']=float(np.max(np.abs(values-references[name])))
                            result['output_close_to_native']=bool(np.allclose(values,references[name],atol=0.15,rtol=0.05))
                            if name != 'gliner-edge-int8':
                                labels = 35 if name == 'minilm' else 51
                                result['winning_token_labels_match_native']=bool(np.array_equal(values.reshape(-1,labels).argmax(-1),references[name].reshape(-1,labels).argmax(-1)))
                                if not result['winning_token_labels_match_native']: raise AssertionError('WASM/native winning label divergence')
                            if not result['output_close_to_native']: raise AssertionError('WASM/native output divergence')
                            report['models'][name]=result
                        except Exception as e:
                            report['models'][name]={'error':str(e)}
                        finally: page.close()
                finally:browser.close()
        finally:server.shutdown();server.server_close()
        args.output.write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report,indent=2))
        if any('error' in r for r in report['models'].values()): raise SystemExit(1)

if __name__=='__main__':main()
