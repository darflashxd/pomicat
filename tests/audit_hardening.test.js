// Run: node tests/audit_hardening.test.js — reproductions from the October audit.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { redactTurns } = require('../bin/safeshare');
const policy = require('../extension/engine/policy');
const { AdversaryOracleSolver } = require('../extension/engine/pseudonymizer');

const leaked = 'User: My salary is [REDACTED_FINANCIAL_1].\nAssistant: Saving 20% means $1,000 per month, leaving $4,000. Over a year that adds up to $12,000.';
for (const json of [false, true]) {
  const run = spawnSync(process.execPath, ['bin/safeshare.js', 'invert', ...(json ? ['--json'] : [])], { input: leaked, encoding: 'utf8' });
  assert.equal(run.status, 2, 'output format must not change leak exit status');
  if (json) assert.equal(JSON.parse(run.stdout).amounts[0].value, 5000);
  const clean = spawnSync(process.execPath, ['bin/safeshare.js', 'invert', ...(json ? ['--json'] : [])], { input: 'No private numbers.', encoding: 'utf8' });
  assert.equal(clean.status, 0);
}
for (const prefix of ['Benchmark output', 'Median benchmark', 'Standar', 'Survei']) {
  const turns = [{ role: 'user', content: 'My salary is $5,000 per month. How much can I save at 20%?' },
    { role: 'assistant', content: `${prefix}: 20% = $1,000.` }];
  assert.ok(!redactTurns(turns)[1].content.includes('$1,000'), prefix);
}
const single = '[REDACTED_FINANCIAL_1]\n20% of your monthly salary is $1,000.';
assert.ok(policy.invert(single).some(f => f.value === 5000 && f.evidence === 'explicit-relation'));
assert.equal(policy.attackCheck([{ role: 'user', content: single }], AdversaryOracleSolver).amounts[0].value, 5000);
assert.equal(policy.invert('The software costs $1,000. The unrelated tax rate is 20%.').length, 0);
assert.equal(policy.invert('Public benchmark: 20% = $1,000.').length, 0, 'no private attribution');
console.log('Audit: CLI status, public-keyword bypass and explicit single-clue recovery passed.');
