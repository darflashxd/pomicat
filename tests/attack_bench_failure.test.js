const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const filename = path.resolve('tools/attack_bench/run.js');
const localRequire = createRequire(filename);
let report = '';
const processMock = { argv: ['node', filename, '--llm', '--cases', '2', '--llm-delay', '0'],
  env: { LLM_MODEL: 'fictional-attacker', OPENAI_API_KEY: 'fictional' }, pid: 1, platform: process.platform };
const context = {
  __dirname: path.dirname(filename), process: processMock, setTimeout,
  console: { log() {}, error() {} },
  require: name => name === 'fs' ? { existsSync: () => false, writeFileSync: (_, content) => { report = content; } } : localRequire(name),
  fetch: async () => ({ ok: false, status: 503 })
};
(async () => {
  await vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  assert.equal(processMock.exitCode, 1);
  assert.match(report, /Incomplete evidence/);
  assert.match(report, /Invalid/);
  assert.ok(!report.includes('SafeShare held'), 'service failure must not become success headline');
  console.log('Attack bench: service failures stay inconclusive and return nonzero.');
})().catch(error => { console.error(error); process.exitCode = 1; });
