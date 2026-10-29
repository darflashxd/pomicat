// node tests/relay_migration.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const hosts = require('../extension/relay_hosts.js');
for (const name of ['safeshare', 'blackline']) {
  assert.ok(hosts.isRelayOrigin(`https://${name}-relay.bleedguard.workers.dev`));
}
for (const host of ['https://blackline-relay.bleedguard.workers.dev.evil.invalid', 'http://blackline-relay.bleedguard.workers.dev', 'https://other.workers.dev']) {
  assert.ok(!hosts.isRelayOrigin(host));
}
const background = fs.readFileSync('extension/background.js', 'utf8');
assert.match(background, /RelayHosts\.isRelayOrigin/);
assert.match(background, /relayHostsGranted|relayHostGranted/);
const config = fs.readFileSync('relay/wrangler.blackline.toml', 'utf8');
assert.match(config, /run_worker_first = true/);
assert.match(config, /preview_urls = false/);
assert.match(config, /database_id = "b16c35b1-8428-4ccd-b4bb-e4bdc4f51954"/);
assert.ok(!config.includes('[triggers]'));
assert.match(config, /namespace_id = "1001"/);
assert.match(config, /namespace_id = "1002"/);
const Crypto = require('../extension/engine/crypto.js');
assert.equal(new Crypto().relayBaseUrl, 'https://blackline-relay.bleedguard.workers.dev');
assert.equal(new Crypto().viewerBaseUrl, 'https://blackline-relay.bleedguard.workers.dev');
assert.match(fs.readFileSync('extension/word/publish.js', 'utf8'), /BlacklineRelayHosts\.DEFAULT_RELAY/);
console.log('Both official hosts accepted; unrelated hosts rejected; new Worker shares DB/limiters without extra cron.');
