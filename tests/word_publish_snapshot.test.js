const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function check(mode) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '3600', textContent: '', hidden: true, disabled: false, checked: true, addEventListener() {} });
    return nodes.get(id);
  };
  const bytes = new Uint8Array([1, 2, 3]);
  let uploads = 0;
  const context = vm.createContext({
    document: { getElementById: node }, window: {}, console,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    sanitizedBytes: bytes, reviewGeneration: 1, attackLeaks: 0,
    appliedSnapshot: { bytes, preview: '<p>reviewed</p>', signature: 'original', generation: 1 },
    currentSignature: () => mode === 'stale' ? 'changed' : 'original',
    chrome: {
      storage: { local: { get: async () => ({}), set: async () => {} } },
      runtime: { sendMessage: async () => { uploads++; return { success: true, data: { revoke_token: 'fictional' } }; } }
    },
    SafeShareCrypto: class {
      constructor(url) { this.relayBaseUrl = url; }
      async encrypt(payload) {
        assert.equal(payload.preview, '<p>reviewed</p>');
        if (mode === 'changed-during-encryption') context.reviewGeneration++;
        return { ciphertext: 'synthetic', shareId: 'synthetic', fullShareUrl: 'https://example.invalid/' };
      }
    }
  });
  vm.runInContext(fs.readFileSync('extension/word/publish.js', 'utf8'), context);
  await vm.runInContext('publishSanitized()', context);
  assert.equal(uploads, mode === 'current' ? 1 : 0, mode);
  if (mode !== 'current') assert.equal(node('create-link').disabled, true, mode);
}

(async () => {
  for (const mode of ['stale', 'changed-during-encryption', 'current']) await check(mode);
  console.log('Word publication snapshot checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
