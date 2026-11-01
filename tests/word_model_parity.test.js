const assert = require('node:assert/strict');
const maybe = require('../extension/engine/maybe.js');
const detect = require('../extension/word/detect.js');

(async () => {
  const content = 'Alice Carter lives in Berlin. Carter called Alice Carter.';
  const spans = [
    { start: 0, end: 12, label: 'PERSON', score: 0.8 },
    { start: 22, end: 28, label: 'LOCATION', score: 0.7 },
    { start: 30, end: 36, label: 'SURNAME', score: 0.65 }
  ];
  const shared = maybe.scan([{ role: 'document', content }], spans.map(span => ({ ...span, turnIndex: 0 })))
    .filter(item => item.source === 'model');
  const word = await detect.nerCandidates({ parts: [content] }, { analyze: async () => ({ success: true, spans }) });
  assert.deepEqual(word.map(item => [item.value, item.modelLabel, item.score, item.preChecked]),
    shared.map(item => [item.raw, item.modelLabel, item.modelScore, item.risky]));
  assert.ok(word.some(item => item.value === 'Berlin'));
  assert.ok(word.some(item => item.value === 'Carter'), 'standalone surname must not be suppressed globally');
  const roleWord = await detect.nerCandidates({ parts: ['doctor Rebecca Louise Turner'] }, { analyze: async () => ({ success: true, spans: [{start:0,end:28,label:'PERSON',score:0.5}] }) });
  assert.equal(roleWord[0].value, 'Rebecca Louise Turner');
  assert.equal(roleWord[0].preChecked, true);
  let calls = 0;
  const duplicate = await detect.nerCandidates({ parts: ['Meridian board.', 'Meridian board.'] }, { analyze: async () => { calls++; return { success: true, spans: [{start:0,end:14,label:'ORGANIZATION',score:0.8}] }; } }, 15);
  assert.equal(calls, 2);
  assert.equal(duplicate.length, 1);
  assert.equal(duplicate[0].value, 'Meridian board');
  assert.deepEqual(duplicate[0].occurrences.map(item => item.start), [0, 17]);
  for (const reversed of [false, true]) {
    calls = 0;
    const merged = await detect.nerCandidates({ parts: ['Alice Carter.', 'Alice Carter.'] }, { analyze: async () => {
      const bank = (++calls === 2) !== reversed;
      return { success: true, spans: [{ start: 0, end: 12, label: bank ? 'BANK_ACCOUNT' : 'PERSON', score: bank ? 0.95 : 0.8 }] };
    } }, 15);
    assert.equal(calls, 2);
    assert.equal(merged[0].category, 'FINANCIAL');
    assert.equal(merged[0].modelLabel, 'BANK_ACCOUNT');
    assert.equal(merged[0].replacement, '[REDACTED_BANK_ACCOUNT]');
    assert.match(merged[0].reason, /BANK_ACCOUNT/);
    assert.equal(merged[0].preChecked, true);
    assert.deepEqual(merged[0].occurrences.map(item => item.start), [0, 15]);
  }
  await assert.rejects(detect.nerCandidates({ parts: [content] }, { analyze: async () => ({ success: false }) }), /incomplete/);
  const assigned = await detect.nerCandidates({ parts: ['client_secret: OddSecret42'] }, { analyze: async () => ({success: true, spans: []}) });
  assert.ok(assigned.some(item => item.value === 'OddSecret42' && item.category === 'CREDENTIALS' && item.preChecked));
  const H = require('../extension/engine/heuristics');
  const T = require('../extension/word/textmap');
  const assignedDoc = {blocks: [{text: 'client_secret: OddSecret42'}], supplementary: []};
  const rulesOnly = await detect.detect({doc: assignedDoc, map: T.flatten(assignedDoc), heuristics: new H(), TextMap: T});
  assert.ok(rulesOnly.some(item => item.value === 'OddSecret42' && item.category === 'CREDENTIALS' && item.preChecked), 'assignment protection must survive model failure');
  const {redactTurns} = require('../bin/pomicat');
  for (const text of ['Home address | Jl. Cempaka Putih Tengah No. 42, Jakarta Pusat', 'BCA 527188901234']) {
    const document = {blocks: [{text}], supplementary: []};
    const findings = await detect.detect({doc: document, map: T.flatten(document), heuristics: new H(), TextMap: T});
    const selected = findings.filter(f => f.preChecked).map(f => f.value);
    const chat = redactTurns([{role: 'user', content: text}])[0].content;
    const secret = text.startsWith('BCA') ? '527188901234' : 'Jl. Cempaka Putih Tengah No. 42, Jakarta Pusat';
    assert.ok(!chat.includes(secret) && !chat.includes('Jakarta Pusat'), 'chat full-value coverage');
    assert.ok(selected.includes(secret), 'Word must select the full original value');
  }
  console.log('Word model candidates use shared suggestion policy');
})().catch(error => { console.error(error); process.exitCode = 1; });
