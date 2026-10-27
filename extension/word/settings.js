/* Word review preferences live in extension storage, never in the page. */
(function (root) {
  const KEY = "word_preferences";
  const DEFAULTS = { reader: "public", numbers: "remove", categories: null };
  const area = () => {
    try {
      const api = typeof browser !== "undefined" ? browser : chrome;
      return api && api.storage && api.storage.local ? api.storage.local : null;
    } catch (_) { return null; }
  };
  async function load() {
    const store = area();
    if (!store) return { ...DEFAULTS };
    try {
      const bag = await store.get(KEY);
      return { ...DEFAULTS, ...(bag && bag[KEY] ? bag[KEY] : {}) };
    } catch (_) { return { ...DEFAULTS }; }
  }
  async function save(patch) {
    const store = area();
    if (!store) return;
    const current = await load();
    try { await store.set({ [KEY]: { ...current, ...patch } }); } catch (_) {}
  }
  async function reset() {
    const store = area();
    if (!store) return;
    try { await store.remove(KEY); } catch (_) {}
  }
  root.SafeShareWordSettings = { DEFAULTS, load, save, reset };
})(typeof globalThis !== "undefined" ? globalThis : this);
