// Isolate expensive near-miss inputs so a regex regression cannot hang the suite.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const modulePath = path.resolve(__dirname, '../extension/engine/heuristics.js');
const result = spawnSync(process.execPath, ['-e', `
  const assert = require('node:assert/strict');
  const H = require(${JSON.stringify(modulePath)});
  const scanner = new H();
  for (const size of [1024, 8192, 32768]) {
    const secret = 'Ab9&'.repeat(size / 4);
    const result = scanner.scan('My email password is ' + secret);
    assert(!result.sanitizedText.includes(secret.slice(-32)));
    assert(result.detections.some(d => d.valueEnd === 21 + size));
    for (const input of ['password for '.repeat(size / 16), 'address: ' + 'word '.repeat(size / 5)]) {
      const output = scanner.scan(input);
      assert(typeof output.sanitizedText === 'string');
    }
  }
  console.log('PASS: English long values and bounded near-miss runtime');
`], {encoding:'utf8',timeout:15000,maxBuffer:1024 * 1024});
assert(!result.error, result.error?.message);
assert.equal(result.status, 0, result.stderr);
console.log(result.stdout.trim());
