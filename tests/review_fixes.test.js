// node tests/review_fixes.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const Contextual = require('../extension/engine/contextual.js');
const detect = require('../extension/word/detect.js');
const TextMap = require('../extension/word/textmap.js');
const H = require('../extension/engine/heuristics.js');
const redact = require('../extension/word/redact.js');
(async () => {
  const classifier = new Contextual();
  for (const text of ['Use pip install package.', 'Picture in picture PIP settings.']) {
    assert.ok(!classifier.classifyTurn(text, 0).some(hit => hit.category === 'SENSITIVE_LEGAL_HR'));
  }
  assert.ok(classifier.classifyTurn('My manager placed me on a PIP.', 0).some(hit => hit.category === 'SENSITIVE_LEGAL_HR'));
  const doc = { blocks: [{ text: 'My doctor diagnosed me with diabetes. My manager put me on a performance improvement plan.' }], supplementary: [] };
  const findings = await detect.detect({ doc, map: TextMap.flatten(doc), heuristics: new H(), TextMap });
  assert.ok(findings.some(item => item.category === 'HEALTH'));
  assert.ok(findings.some(item => item.ruleName === 'Contextual LEGAL_HR'));
  const source = fs.readFileSync('extension/word/review.js', 'utf8');
  const ctx = { wordPrefs: { reader: 'trusted' } };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function defaultFindingChecked('), source.indexOf('function resetFindingState(')), ctx);
  for (const category of ['FINANCIAL', 'PROFILE', 'HEALTH']) assert.equal(ctx.defaultFindingChecked({ category, source: 'rule', preChecked: true }), true);
  assert.equal(ctx.defaultFindingChecked({ category: 'FINANCIAL', source: 'amount', preChecked: true }), false);
  const rule = { value: '4,800', replacement: '[REDACTED]', excludeValues: ['USD 4,800'] };
  const spans = redact.spansFor('USD 4,800; EUR 4,800; 4,800', [rule]);
  assert.equal(spans.length, 2);
  const setup = fs.readFileSync('extension/word/setup.js', 'utf8');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { disabled: false, hidden: false, textContent: '', replaceChildren() {} });
    return elements.get(id);
  };
  const captureContext = { $: element, reviewGeneration: 1, sourceBytes: new Uint8Array([1]), lastDoc: {}, providedFindings: [{}],
    sanitizedBytes: new Uint8Array([2]), appliedSnapshot: {}, query: new URLSearchParams('tab=1'),
    api: { tabs: { get: async () => { throw new Error('Synthetic access failure'); } } } };
  vm.createContext(captureContext);
  vm.runInContext(setup.slice(setup.indexOf('async function runCapture()'), setup.indexOf('$("capture").addEventListener')), captureContext);
  await captureContext.runCapture();
  for (const field of ['sourceBytes', 'lastDoc', 'providedFindings', 'sanitizedBytes', 'appliedSnapshot']) assert.equal(captureContext[field], null);
  for (const id of ['review-section', 'download-sanitized', 'share-panel']) assert.equal(element(id).hidden, true);

  const workerSource = fs.readFileSync('relay/worker.js', 'utf8');
  const worker = (await import('data:text/javascript,' + encodeURIComponent(workerSource))).default;
  for (const path of ['/api/share', '/api/revoke/' + crypto.randomUUID()]) {
    const response = await worker.fetch(new Request('https://relay.invalid' + path, { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), ciphertext: 'synthetic', ignored: 'x'.repeat(600000) }) }), {}, {});
    assert.equal(response.status, 413);
  }
  let hits = 0;
  const upstream = http.createServer((req, res) => {
    hits++;
    if (req.url === '/redirect') { res.writeHead(302, { Location: `http://127.0.0.1:${upstream.address().port}/unexpected` }); res.end(); }
    else res.end('unexpected');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = require('../bin/proxy.js').start({ port: 0, upstream: `http://127.0.0.1:${upstream.address().port}` });
  await new Promise(resolve => proxy.once('listening', resolve));
  try {
    for (const path of [`http://127.0.0.1:${upstream.address().port}/models`, '//other.invalid/models', '/\\other.invalid/models']) {
      const status = await new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: proxy.address().port, path }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
      });
      assert.equal(status, 400);
    }
    assert.equal(hits, 0);
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/redirect`);
    assert.equal(response.status, 502);
    assert.equal(hits, 1, 'redirect destination must not be fetched');
  } finally { proxy.close(); upstream.close(); }
  console.log('Review fixes: HR context, Word policy, overlap exclusions, bounded relay and fixed proxy target.');
})().catch(error => { console.error(error); process.exitCode = 1; });
