/**
 * SafeShare-AI — settings (protection mode, debug details, reader, amounts, categories).
 *
 * In the extension they live in the extension's own storage. They used to live in the chat site's
 * localStorage, where the site's scripts could switch protection off or quietly set the next share
 * to "Someone I trust" (names and amounts kept); checked on claude.ai, Oct 2026. Old values there
 * are not imported, since they may have been tampered with: everything starts at the safe defaults.
 * Reads are synchronous from a cache filled at start (defaults until then) and kept in sync across
 * tabs. Without extension storage (test pages, Node) it falls back to localStorage.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SafeShareSettings = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ext = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
  const area = ext && ext.runtime && ext.runtime.id && ext.storage && ext.storage.local ? ext.storage.local : null;
  const KEY = "safeshare_settings";
  const cache = {};

  const ready = area
    ? Promise.resolve(area.get(KEY)).then((r) => { Object.assign(cache, (r && r[KEY]) || {}); }).catch(() => {})
    : Promise.resolve();
  if (area && ext.storage.onChanged) {
    ext.storage.onChanged.addListener((changes, name) => {
      if (name !== "local" || !changes[KEY]) return;
      for (const k of Object.keys(cache)) delete cache[k];
      Object.assign(cache, changes[KEY].newValue || {});
    });
  }

  const parse = (v) => { try { return JSON.parse(v); } catch (_) { return v; } };

  function get(key, fallback) {
    if (area) return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : fallback;
    try {
      const v = localStorage.getItem(`safeshare_${key}`);
      return v === null ? fallback : parse(v);
    } catch (_) {
      return fallback;
    }
  }

  function set(key, value) {
    if (area) {
      cache[key] = value;
      Promise.resolve(area.set({ [KEY]: { ...cache } })).catch(() => {});
      return;
    }
    try { localStorage.setItem(`safeshare_${key}`, typeof value === "string" ? value : JSON.stringify(value)); } catch (_) {}
  }

  return { get, set, ready, inExtensionStorage: Boolean(area) };
});
