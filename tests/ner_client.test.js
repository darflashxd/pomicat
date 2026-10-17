// node tests/ner_client.test.js — local transport validation and explicit failure states.
const assert = require("node:assert/strict");
const { analyze } = require("../extension/engine/ner_client.js");
(async () => {
  assert.equal((await analyze("hello")).state, "unsupported");
  let calls = 0;
  global.browser = { runtime: { sendMessage: async request => {
    calls++;
    assert.equal(request.review, true);
    return { success: true, state: "ready", spans: [{ start: 0, end: 5, label: "PERSON", score: 0.4 }] };
  } } };
  assert.equal((await analyze("hello", 100, true)).spans.length, 1);
  assert.equal((await analyze("x".repeat(512 * 1024 + 1))).state, "failed");
  assert.equal(calls, 1, "invalid text never sent");
  browser.runtime.sendMessage = async () => { throw new Error("runtime restarting"); };
  assert.equal((await analyze("hello")).error, "runtime restarting");
  browser.runtime.sendMessage = () => new Promise(() => {});
  assert.equal((await analyze("hello", 5)).error, "Local model timed out");
  delete global.browser;
  global.chrome = { runtime: { sendMessage: (_request, callback) => callback({ success: true, spans: [] }) } };
  assert.equal((await analyze("hello")).success, true);
  console.log("NER client: Firefox promise/Chrome callback, validation, failure, timeout passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
