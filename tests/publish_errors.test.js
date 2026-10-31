// node tests/publish_errors.test.js
const assert = require('node:assert/strict');
const { describePublishError } = require('../extension/word/publish_errors.js');

const relay = 'https://blackline-relay.bleedguard.workers.dev';

let result = describePublishError(
  Object.assign(new Error(`Extension reload required to grant access to ${relay}.`), { code: 'RELOAD_REQUIRED' }),
  relay
);
assert.match(result.hint, /Reload the PomiCat extension/);
assert.match(result.hint, /blackline-relay/);

result = describePublishError(new Error('Encrypted copy exceeds the relay limit (512 KB). Download the file instead.'), relay);
assert.match(result.hint, /Download DOCX/);
assert.match(result.hint, /512 KB/);

result = describePublishError(new Error('Relay returned status 413: {"error":"Share too large"}'), relay);
assert.match(result.hint, /Download DOCX/);

result = describePublishError(new Error('Relay returned status 429: Too many requests'), relay);
assert.match(result.hint, /Wait about a minute/);

result = describePublishError(new Error('Relay returned status 500: internal error'), relay);
assert.match(result.hint, /could not be reached/);

result = describePublishError(new Error('Failed to fetch'), relay);
assert.match(result.hint, /could not be reached/);

result = describePublishError(new Error('Relay returned status 409: Share ID already exists'), relay);
assert.match(result.hint, /collision/);

result = describePublishError(new Error('something odd'), relay);
assert.equal(result.message, 'something odd');
assert.match(result.hint, new RegExp(relay.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

console.log('publish errors: ok');
