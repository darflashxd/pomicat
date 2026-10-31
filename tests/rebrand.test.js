// node tests/rebrand.test.js — brand changes must not reset identity or change protocol.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const read = path => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
for (const path of ['extension/manifest.json', 'extension/manifest.firefox.json']) {
  const manifest = JSON.parse(read(path));
  assert.equal(manifest.name, 'PomiCat');
  assert.equal(manifest.action.default_title, 'PomiCat');
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.host_permissions.includes('https://safeshare-relay.bleedguard.workers.dev/*'));
  assert.ok(manifest.host_permissions.includes('https://blackline-relay.bleedguard.workers.dev/*'));
  assert.match(manifest.content_security_policy.extension_pages, /https:\/\/safeshare-relay\.bleedguard\.workers\.dev/);
  assert.match(manifest.content_security_policy.extension_pages, /https:\/\/blackline-relay\.bleedguard\.workers\.dev/);
  if (path.includes('firefox')) assert.equal(manifest.browser_specific_settings.gecko.id, 'safeshare@research.local');
}
assert.equal(pkg.name, 'pomicat');
assert.equal(pkg.bin.blackline, pkg.bin.safeshare);
assert.equal(pkg.bin.safeshare, pkg.bin.pomicat);
// Normalized hashes; viewer_redirect.js changed in 2.5.6 for the web-viewer fallback.
for (const [path, hash] of Object.entries({
  'extension/engine/settings.js': '57f3173e764083949621f8c1eff915c5c2d4ed6b9861b0907da8ae5a59cd8511',
  'extension/word/settings.js': '42dde966b726b26d73368781d8d9a8824d152aa8c34f2bbd2bb0a46caa16cce6',
  'extension/viewer_redirect.js': 'bb17ccdc5d0e87de7eec59567cc58abfd71ce0764c802bc356ff8e41bc7c5199',
  'relay/wrangler.toml': 'd7c393dbfda07094b1e65be493dfbe2539d3fcf5dca421ab9a50b3ec378e3450'
})) {
  assert.equal(createHash('sha256').update(read(path).replace(/\r\n/g, '\n')).digest('hex'), hash, path + ' compatibility');
}
assert.equal(read('extension/engine/crypto.js').replace(/\r\n/g, '\n').replaceAll('blackline-relay.bleedguard.workers.dev', 'safeshare-relay.bleedguard.workers.dev'), read('extension/viewer/crypto.js').replace(/\r\n/g, '\n'), 'only encrypting client defaults change; crypto format stays identical');
assert.match(read('extension/word/launcher.js'), /button.textContent = "PomiCat"/);
assert.match(read('extension/content_script.js'), /POMICAT_MARK/);
assert.match(read('extension/viewer/index.html'), /class="brand-title">PomiCat</);
assert.match(read('extension/ui/modal.js'), /PomiCat · End-to-end encrypted/);
assert.match(read('tools/build_extension.py'), /PomiCat-\{version\}/);
const maybe = require('../extension/engine/maybe.js');
for (const name of ['PomiCat', 'Blackline', 'SafeShare']) {
  const candidates = maybe.scan([{role:'user',content:name}], [{start:0,end:name.length,label:'ORGANIZATION',score:0.99,turnIndex:0}]);
  assert.ok(!candidates.some(item => item.raw === name), 'product label should not become a model suggestion');
}
console.log('PomiCat brand; legacy extension identity, settings, relay and crypto unchanged.');
