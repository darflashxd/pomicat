const assert = require('node:assert/strict');
const api = require('../extension/word/redact.js');

(async () => {
  const encoder = new TextEncoder();
  const parts = new Map([['word/document.xml', encoder.encode('<document>Public control</document>')]]);
  const bytes = await api.zip(parts);
  const opened = await api.unzip(bytes);
  const overlap = api.spansFor('Alpha Beta Gamma', [
    {value: 'Alpha Beta', replacement: '[A]'}, {value: 'Beta Gamma', replacement: '[B]'}
  ]);
  assert.equal(overlap.length, 1);
  assert.equal(overlap[0].end, 16);
  assert.equal(overlap[0].replacement, '[REDACTED]');
  assert.equal(new TextDecoder().decode(opened.get('word/document.xml')), '<document>Public control</document>');

  const corrupt = bytes.slice();
  const view = new DataView(corrupt.buffer);
  for (let i = 0; i < corrupt.length - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 16, view.getUint32(i + 16, true) ^ 1, true);
      break;
    }
  }
  await assert.rejects(api.unzip(corrupt), /checksum/);
  const oversized = await api.zip(new Map([['word/document.xml', new Uint8Array(8 * 1024 * 1024 + 1)]]));
  await assert.rejects(api.unzip(oversized), /oversized/);
  const traversal = await api.zip(new Map([['../private.xml', encoder.encode('private')]]));
  await assert.rejects(api.unzip(traversal), /Unsupported/);
  console.log('Shared DOCX reader rejects corrupt, oversized and traversal entries');
})().catch(error => { console.error(error); process.exitCode = 1; });
