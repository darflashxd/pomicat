const assert = require('node:assert/strict');
const fs = require('node:fs');
const policy = require('../extension/engine/policy.js');
const { AdversaryOracleSolver } = require('../extension/engine/pseudonymizer.js');

for (const text of [
  'Public quarterly report, no private amount.',
  '[REDACTED_FINANCIAL] Monthly rent is $1,200 at 25% of income. Savings are $960 at 20% of income.',
  '[REDACTED_DOB] I am 28 years old.'
]) {
  const chat = policy.attackCheck([{ role: 'user', content: text }], AdversaryOracleSolver);
  const word = policy.attackCheck([{ role: 'document', content: text }], AdversaryOracleSolver);
  for (const key of ['amounts', 'births', 'dates', 'leaks']) assert.deepEqual(word[key], chat[key]);
}
assert.match(fs.readFileSync('extension/ui/modal.js', 'utf8'), /policy\.attackCheck\(turns, Solver\)/);
assert.match(fs.readFileSync('extension/word/review.js', 'utf8'), /SafeSharePolicy\.attackCheck/);
console.log('Shared chat/Word attack checks passed');
