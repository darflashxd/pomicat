const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { document: { addEventListener() {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('extension/viewer/app.js', 'utf8'), context);
const valid = context.validChatPayload;
assert.ok(valid({ turns: [{ role: 'user', content: 'Legacy fictional chat' }] }));
assert.ok(valid({ version: 3, turns: [{ role: 'assistant', content: 'Fictional reply' }] }));
for (const payload of [null, { turns: {} }, { turns: [null] }, { turns: [{ role: 'user', content: {} }] },
  { turns: [{ role: 'admin', content: 'x' }] }, { kind: 'unknown', turns: [] }, { version: 99, turns: [] }]) {
  assert.ok(!valid(payload), JSON.stringify(payload));
}
console.log('Viewer accepts supported chat schemas and rejects malformed payloads.');
