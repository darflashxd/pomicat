// node tests/word_capture_limits.test.js — execute the actual injected fetch function.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('extension/word/setup.js', 'utf8');
const begin = source.indexOf('func:async ') + 5;
const end = source.indexOf('},args:', begin) + 1;
const limit = 10 * 1024 * 1024;
(async () => {
  for (const header of [null, '1', String(limit + 1)]) {
    for (const length of [limit - 1, limit, limit + 1]) {
      let cancelled = false, delivered = false;
      const context = {
        URL, Uint8Array, AbortSignal, location: { origin: 'https://word.invalid' },
        btoa: value => Buffer.from(value, 'binary').toString('base64'),
        fetch: async () => ({ ok: true, headers: { get: key => key === 'content-length' ? header : 'application/octet-stream' }, body: {
          cancel: async () => { cancelled = true; },
          getReader: () => ({ read: async () => {
            if (delivered) return { done: true };
            delivered = true;
            const value = new Uint8Array(length); value[0] = 80; value[1] = 75;
            return { done: false, value };
          }, cancel: async () => { cancelled = true; } })
        } })
      };
      vm.createContext(context);
      const capture = vm.runInContext(`(${source.slice(begin, end)})`, context);
      const result = await capture('https://word.invalid/file', limit);
      if (length > limit || Number(header) > limit) assert.equal(result.error, 'size');
      else assert.equal(Buffer.from(result.data, 'base64').length, length);
      assert.ok(cancelled, 'response body must be cancelled after success or rejection');
    }
  }
  console.log('10 MiB capture boundaries: absent, misleading and oversize Content-Length; streams cancelled.');
})().catch(error => { console.error(error); process.exitCode = 1; });
