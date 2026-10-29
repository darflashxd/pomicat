// node tests/viewer_redirect.test.js
const assert = require('node:assert/strict');
const logic = require('../extension/viewer/redirect_logic.js');

const id = '402ef10d-514c-43ee-a675-0398a107ec9b';
assert.equal(logic.isRelaySharePath(`/v/${id}`, '#abc'), true);
assert.equal(logic.isRelaySharePath(`/s/${id}/`, '#abc'), true);
assert.equal(logic.isRelaySharePath('/v/not-a-uuid', '#abc'), false);
assert.equal(logic.isRelaySharePath(`/v/${id}`, ''), false);
assert.equal(logic.isRelaySharePath(`/v/${id}`, '#'), false);

assert.equal(logic.isHashShare('#d=cipher&k=key&exp=1'), true);
assert.equal(logic.isHashShare('#d=cipher'), false);
assert.equal(logic.isHashShare(''), false);

const href = `https://blackline-relay.bleedguard.workers.dev/v/${id}#KEY`;
const fallback = logic.buildFallbackHref(href);
assert.match(fallback, /\?web=1/);
assert.ok(fallback.endsWith('#KEY'));
assert.equal(logic.isWebFallback(fallback), true);
assert.equal(logic.buildFallbackHref(fallback), fallback, 'fallback URL must be idempotent');
assert.equal(logic.isWebFallback(href), false);

assert.equal(logic.shouldFallback({ success: true }), false);
assert.equal(logic.shouldFallback({ success: false, reason: 'relay_not_allowed' }), true);
assert.equal(logic.shouldFallback({ success: false, reason: 'reload_required' }), true);
assert.equal(logic.shouldFallback(undefined), true);
assert.equal(logic.shouldFallback(null), true);

// The fallback decision must be driven by the response, not by a truthy object.
assert.equal(logic.shouldFallback({ reason: 'no_success_field' }), true);

console.log('viewer redirect logic: ok');
