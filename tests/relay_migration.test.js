// node tests/relay_migration.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const hosts = require('../extension/relay_hosts.js');
for (const name of ['safeshare', 'blackline', 'pomicat']) {
  assert.ok(hosts.isRelayOrigin(`https://${name}-relay.bleedguard.workers.dev`));
}
for (const host of ['https://blackline-relay.bleedguard.workers.dev.evil.invalid', 'http://blackline-relay.bleedguard.workers.dev', 'https://other.workers.dev']) {
  assert.ok(!hosts.isRelayOrigin(host));
}
const background = fs.readFileSync('extension/background.js', 'utf8');
assert.match(background, /RelayHosts\.isRelayOrigin/);
assert.match(background, /relayHostsGranted|relayHostGranted/);
for (const config of ['relay/wrangler.pomicat.toml', 'relay/wrangler.blackline.toml']) {
  const text = fs.readFileSync(config, 'utf8');
  assert.match(text, /run_worker_first = true/, config);
  assert.match(text, /preview_urls = false/, config);
  assert.match(text, /database_id = "b16c35b1-8428-4ccd-b4bb-e4bdc4f51954"/, config);
  assert.ok(!text.includes('[triggers]'), `${config}: cleanup cron stays on safeshare-relay`);
  assert.match(text, /namespace_id = "1001"/, config);
  assert.match(text, /namespace_id = "1002"/, config);
}
const Crypto = require('../extension/engine/crypto.js');
assert.equal(new Crypto().relayBaseUrl, 'https://pomicat-relay.bleedguard.workers.dev');
assert.equal(new Crypto().viewerBaseUrl, 'https://pomicat-relay.bleedguard.workers.dev');
assert.match(fs.readFileSync('extension/word/publish.js', 'utf8'), /BlacklineRelayHosts\.DEFAULT_RELAY/);
console.log('All official hosts accepted; unrelated hosts rejected; PomiCat and Blackline Workers share DB/limiters without extra cron.');
