// node tests/address_bank_rules.test.js
const assert = require('node:assert/strict');
const Heuristics = require('../extension/engine/heuristics.js');
const redactor = new Heuristics();

function hits(text) {
  return redactor.scan(text).detections.map((d) => ({
    type: d.type,
    raw: d.raw,
    secret: d.secretToken,
    replacement: d.replacement
  }));
}

const tableAddress = 'Home address | Jl. Cempaka Putih Tengah No. 42, Jakarta Pusat 10510';
let found = hits(tableAddress);
assert.equal(found.length, 1, JSON.stringify(found));
assert.equal(found[0].secret, 'Jl. Cempaka Putih Tengah No. 42, Jakarta Pusat 10510');

found = hits('Jl. Merdeka No. 10, Bandung 40115');
assert.equal(found.length, 1, JSON.stringify(found));
assert.equal(found[0].secret, 'Jl. Merdeka No. 10, Bandung 40115');

found = hits('Address: 123 Main Street, Springfield 62704');
assert.equal(found[0].secret, '123 Main Street, Springfield 62704');

found = hits('Alamat: Jl. Merdeka No. 10, Bandung 40115');
assert.equal(found[0].secret, 'Jl. Merdeka No. 10, Bandung 40115');

found = hits('Payroll: BCA 5271 8890 1234 (a/n Rina Kartika Wijaya).');
assert.equal(found.length, 1, JSON.stringify(found));
assert.equal(found[0].type, 'BANK_NAMED_ACCOUNT');
assert.equal(found[0].secret, '5271 8890 1234');

for (const name of ['Mandiri', 'BNI', 'BRI', 'CIMB Niaga', 'Permata', 'Jago']) {
  found = hits(`${name} 1234 5678 9012`);
  assert.equal(found.length, 1, `${name}: ${JSON.stringify(found)}`);
  assert.equal(found[0].secret, '1234 5678 9012');
}

// Precision guards: a short reference number under a bank name, a plain reference, and a phone.
assert.deepEqual(hits('BCA 2026 1042'), []);
assert.deepEqual(hits('Reference NT-HR-2026-1042 / CONFIDENTIAL'), []);
found = hits('+62 811-0000-0001');
assert.equal(found[0].type, 'PHONE');
assert.equal(found[0].secret, '+62 811-0000-0001');
assert.deepEqual(hits('Address: none'), []);

console.log('address and bank rules: ok');
