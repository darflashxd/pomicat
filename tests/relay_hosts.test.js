// node tests/relay_hosts.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const hosts = require('../extension/relay_hosts.js');

for (const file of ['extension/manifest.json', 'extension/manifest.firefox.json']) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const declared = manifest.host_permissions
    .filter((pattern) => /relay\.bleedguard\.workers\.dev/.test(pattern))
    .map((pattern) => new URL(pattern.replace(/\*$/, '')).origin);
  assert.ok(declared.length >= 2, `${file}: expected both relay hosts`);
  for (const origin of declared) {
    assert.ok(hosts.isRelayOrigin(origin), `${file}: ${origin} missing from relay_hosts.js`);
  }
  assert.ok(
    manifest.content_scripts[0].js.includes('relay_hosts.js'),
    `${file}: viewer redirect must load relay_hosts.js first`
  );
}

assert.equal(hosts.DEFAULT_RELAY, 'https://pomicat-relay.bleedguard.workers.dev');
assert.ok(hosts.isRelayOrigin('https://pomicat-relay.bleedguard.workers.dev'));
assert.ok(hosts.isRelayOrigin('https://safeshare-relay.bleedguard.workers.dev'));
assert.ok(hosts.isRelayOrigin('https://blackline-relay.bleedguard.workers.dev'));
assert.ok(hosts.isRelayOrigin('http://localhost:8787'));
assert.ok(hosts.isRelayOrigin('http://127.0.0.1:8899'));
assert.equal(hosts.isRelayOrigin('https://evil.example'), false);
assert.equal(hosts.isRelayOrigin('https://blackline-relay.bleedguard.workers.dev.evil.example'), false);
assert.equal(hosts.isRelayOrigin(''), false);

assert.equal(hosts.permissionPattern('http://127.0.0.1:8899'), 'http://127.0.0.1/*');
assert.equal(
  hosts.permissionPattern('https://blackline-relay.bleedguard.workers.dev'),
  'https://blackline-relay.bleedguard.workers.dev/*'
);

console.log('relay hosts: ok');
