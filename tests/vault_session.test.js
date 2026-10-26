// Run: node tests/vault_session.test.js (offline, no browser or network dependency).
//
// A new chat has no /c/<id> URL until after the first send. The symbol mapping is written
// under "..._data_new" at that point. If the site reloads the page when the URL changes, the
// fresh content script has to move that mapping to "..._data_<chatId>" or the sent note and
// the restored amounts disappear.
const assert = require("node:assert/strict");

function fakeSessionStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    _keys: () => [...data.keys()].sort(),
    _raw: data
  };
}

global.sessionStorage = fakeSessionStorage();
const SafeShareSymbolicVault = require("../extension/engine/symbolic_vault.js");
const store = global.sessionStorage;

// 1. A brand new chat: the secret is registered before the chat has an id.
let vault = new SafeShareSymbolicVault();
const symbol = vault.register("$4,800", 4800, "FINANCIAL", { currency: "USD", role: "S1_SALARY" });
assert.equal(symbol, "<S1>");
assert.deepEqual(store._keys(), ["safeshare_vault_data_new"]);

// 2. The page reloads on /c/chat-1. The new script promotes "new" before reading the chat.
vault = new SafeShareSymbolicVault();
assert.equal(vault.size(), 1, "the constructor still sees the pending mapping");
vault.promotePendingSession("chat-1");
vault.loadFromSession("chat-1");
assert.equal(vault.size(), 1);
assert.equal(vault.get("<S1>").raw, "$4,800");
assert.deepEqual(store._keys(), ["safeshare_vault_data_chat-1"], "pending key is gone");

// 3. A later reload on the same URL keeps the mapping and the symbol counter.
vault = new SafeShareSymbolicVault();
vault.promotePendingSession("chat-1");
vault.loadFromSession("chat-1");
assert.equal(vault.size(), 1);
assert.equal(vault.register("$120", 120, "FINANCIAL", { currency: "USD" }), "<S2>");

// 4. Another chat does not inherit this one's secrets.
vault.loadFromSession("chat-2");
assert.equal(vault.size(), 0);

// 5. Promotion never overwrites a mapping the chat already has of its own.
store.setItem("safeshare_vault_data_chat-3", JSON.stringify({
  "<S1>": { symbolId: "<S1>", raw: "$9,999", numericValue: 9999, value: 9999, currency: "USD" }
}));
store.setItem("safeshare_vault_data_new", JSON.stringify({
  "<S1>": { symbolId: "<S1>", raw: "$1", numericValue: 1, value: 1, currency: "USD" }
}));
vault = new SafeShareSymbolicVault();
vault.promotePendingSession("chat-3");
vault.loadFromSession("chat-3");
assert.equal(vault.get("<S1>").raw, "$9,999");
assert.equal(store.getItem("safeshare_vault_data_new"), null, "stale pending copy is dropped");

// 6. clearPending leaves a real chat mapping alone.
vault.loadFromSession("chat-1");
vault.clearPending();
assert.notEqual(store.getItem("safeshare_vault_data_chat-1"), null);

// 6b. dropSession removes one chat's stored copy but keeps the values in memory.
vault.dropSession("chat-1");
assert.equal(store.getItem("safeshare_vault_data_chat-1"), null);
assert.equal(vault.size(), 2);

// 7. clear() purges both memory and the active chat's stored copy.
vault.clear("chat-1");
assert.equal(vault.size(), 0);
assert.equal(store.getItem("safeshare_vault_data_chat-1"), null);

console.log("vault session: all assertions passed");
