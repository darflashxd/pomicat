const assert = require('node:assert/strict');
const policy = require('../extension/engine/policy.js');
const word = require('../extension/word/policy.js');
const { AdversaryOracleSolver } = require('../extension/engine/pseudonymizer.js');

const text = 'Monthly [REDACTED_FINANCIAL], annual salary 57,600, bonus 960, 20% of monthly.';
const result = policy.attackCheck([{role:'document',content:text}], AdversaryOracleSolver);
assert.equal(result.leaks, 1);
assert.ok(result.amounts.some(finding => Math.abs(finding.value - 4800) < 1));
assert.equal(word.rangeFor('4,800','USD'), '$2k-$5k');
assert.equal(word.rangeFor('4800','IDR'), 'Rp 2-5 ribu');
assert.equal(policy.attackCheck([{role:'document',content:'Public annual salary 57,600.'}], AdversaryOracleSolver).leaks, 0);
console.log('Word formula reconstruction and range policy checks passed');
