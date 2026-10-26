// Run: node tests/chat_id.test.js (offline, no browser or network dependency).
//
// The id decides which vault entry a chat reads. Two chats sharing an id means one chat can show
// the other's protected values, so these cases are exact on purpose.
const assert = require("node:assert/strict");
const ChatId = require("../extension/engine/chat_id.js");

// ChatGPT: plain UUID, and the Oct 2026 "local-chatgpt:<uuid>" form (colon arrives encoded).
assert.equal(ChatId.of("https://chatgpt.com/c/6adf559c-4b38-83ec-bcab-12192de93794"),
  "6adf559c-4b38-83ec-bcab-12192de93794");
assert.equal(ChatId.of("https://chatgpt.com/c/local-chatgpt%3A6d6f1516-1612-464c-93d1-7ef679a15744"),
  "local-chatgpt:6d6f1516-1612-464c-93d1-7ef679a15744");
assert.notEqual(
  ChatId.of("https://chatgpt.com/c/local-chatgpt%3A6d6f1516-1612-464c-93d1-7ef679a15744"),
  ChatId.of("https://chatgpt.com/c/local-chatgpt%3A11111111-1111-1111-1111-111111111111"),
  "two local chats must not share a vault entry"
);

// Claude and DeepSeek.
assert.equal(ChatId.of("https://claude.ai/chat/a78cac5a-13a4-4a07-97fd-28e0cb20b3a2"),
  "a78cac5a-13a4-4a07-97fd-28e0cb20b3a2");
assert.equal(ChatId.of("https://chat.deepseek.com/a/chat/s/c6103e2e-93f8-4926-859d-5426d05abe23"),
  "c6103e2e-93f8-4926-859d-5426d05abe23");

// Pages without a conversation id.
for (const url of ["https://chatgpt.com/", "https://claude.ai/new", "https://chat.deepseek.com/", ""]) {
  assert.equal(ChatId.of(url), null, url);
}

// A query string or fragment is not part of the id.
assert.equal(ChatId.of("https://chatgpt.com/c/abc-123?src=history#turn-2"), "abc-123");
assert.equal(ChatId.of("https://chatgpt.com/c/local-chatgpt%3Aabc-123?model=x"), "local-chatgpt:abc-123");

// A malformed escape must not throw; the raw segment is used instead.
assert.equal(ChatId.of("https://chatgpt.com/c/bad%ZZ"), "bad%ZZ");

// ChatGPT's first id for a new chat is temporary; the server id that replaces it is not.
assert.equal(ChatId.isTemporary("local-chatgpt:6d6f1516-1612-464c-93d1-7ef679a15744"), true);
assert.equal(ChatId.isTemporary("6adf69c6-09f4-83ec-90da-dfa1bae5989f"), false);
assert.equal(ChatId.isTemporary(null), false);

console.log("chat id: all assertions passed");
