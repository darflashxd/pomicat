// Production decoder, synthetic logits: checks policy independently of model accuracy.
const assert = require('node:assert/strict');
const {extractSpans} = require('../extension/offscreen.js');
const labels = {'0':'O','1':'B-PERSON','2':'I-PERSON','3':'B-LOCATION'};
for (const [text,value] of [
  ['My wife is Amelia Hartwell.','Amelia Hartwell'],
  ['My wife is Amelia Hartwell. saya saya','Amelia Hartwell'],
  ['My wife is Di Yang.','Di Yang'],
  ['saya di sini. My wife is Amelia Hartwell.','Amelia Hartwell']
]) {
  const start=text.indexOf(value), end=start+value.length;
  const enc={inputIds:[101n,7n,102n],tokenSpans:[{start:0,end:0},{start,end},{start:0,end:0}]};
  const logits=[10,-10,-10,-10, -10,10,-10,-10, 10,-10,-10,-10];
  assert.deepEqual(extractSpans(text,enc,logits,false,labels).map(s=>[s.start,s.end,s.label]),[[start,end,'PERSON']]);
  assert.equal(extractSpans(text,enc,[...logits.slice(0,4),10,-10,-10,-10,...logits.slice(8)],true,labels).length,0);
  assert.throws(()=>extractSpans(text,enc,[],false,labels),/shape/);
  assert.throws(()=>extractSpans(text,enc,logits.map((v,i)=>i===5?NaN:v),false,labels),/Invalid model output/);
}
const text='Address: Oak Street';
const enc={inputIds:[101n,7n,102n],tokenSpans:[{start:0,end:0},{start:9,end:text.length},{start:0,end:0}]};
assert.equal(extractSpans(text,enc,[10,-10,-10,-10,-10,-10,-10,10,10,-10,-10,-10],false,labels)[0].label,'LOCATION');
console.log('PASS: English/mixed-message decoder, Di Yang, empty scan, shape checks, native labels');
