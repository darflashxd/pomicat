// node tests/toggle_groups.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('extension/word/review.js', 'utf8');
const findings = [
  { value: '4,800', category: 'FINANCIAL', source: 'amount' },
  { value: 'USD 4,800', category: 'FINANCIAL', source: 'derived' },
  { value: '4800', category: 'FINANCIAL', source: 'rule' },
  { value: 'unknown', category: 'FINANCIAL', source: 'amount' },
  { value: 'pending', category: 'FINANCIAL', source: 'derived' },
  { value: '0', category: 'FINANCIAL', source: 'amount' }
];
const context = { SafeShareWordPolicy: require('../extension/word/policy.js'), lastDoc: {}, findingRows: () => findings };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function financialValueOf('), source.indexOf('function setFindingGroupState(')), context);
const group = item => Array.from(context.relatedFindings(item), row => row.value);
assert.deepEqual(group(findings[0]), ['4,800', 'USD 4,800']);
assert.deepEqual(group(findings[2]), ['4800']);
assert.deepEqual(group(findings[3]), ['unknown']);
assert.deepEqual(group(findings[5]), ['0']);
findings.push({ value: 'EUR 4,800', category: 'FINANCIAL', source: 'amount' });
assert.deepEqual(group(findings[0]), ['4,800']);
assert.deepEqual(group(findings[1]), ['USD 4,800']);

Object.assign(global, {
  HeuristicsRedactor: require('../extension/engine/heuristics.js'),
  ContextualClassifier: require('../extension/engine/contextual.js'),
  ConsistentPseudonymizer: require('../extension/engine/pseudonymizer.js'),
  SafeShareCrypto: require('../extension/engine/crypto.js'),
  SafeSharePolicy: require('../extension/engine/policy.js')
});
const Modal = require('../extension/ui/modal.js');
const modal = new Modal();
modal.candidates = ['performance improvement plan', 'performance improvement plan (PIP)', 'PIP', 'written warning'].map((raw, i) => ({ id: `c_${i}`, raw, category: 'PROFILE', ruleName: 'Contextual LEGAL_HR', enabled: true }));
modal.candidates.push({ id: 'manual', raw: 'PIP settings', category: 'CUSTOM', enabled: true });
modal.setCandidateEnabled(modal.candidates[1], false);
assert.deepEqual(modal.candidates.map(item => item.enabled), [false, false, false, true, true]);
modal.setCandidateEnabled(modal.candidates[0], true);
assert.ok(modal.candidates.every(item => item.enabled));
modal.currentTurns = [{ role: 'user', content: 'Use pip install package. My performance improvement plan needs review.' }];
modal.setCandidateEnabled(modal.candidates[1], false);
assert.equal(modal.candidates[2].enabled, true, 'ambiguous technical PIP must not join the HR alias group');
console.log('Money groups exclude IDs, invalid values and conflicting currencies; HR aliases toggle together.');
