/**
 * SafeShare-AI — Ephemeral Symbolic Secret Vault
 * Securely holds mapping between symbolic variables (<S1>, <S2>) and their
 * actual secret parameters in local browser RAM / the extension's session storage.
 * 
 * Guarantees:
 * 1. Zero network exposure: Secrets never leave client device.
 * 2. Ephemeral lifecycle: Automatically purged on session reset or tab close.
 * 3. Multi-turn consistency: Re-uses the same symbol ID for the same raw secret across turns.
 */

/**
 * Where the vault persists. In the extension: storage.session, private to the extension (the chat
 * site's own scripts can read the page's sessionStorage, so that isn't used there) and cleared
 * when the browser closes. Elsewhere (tests, Node): sessionStorage if there is one.
 * storage.session is async, so reads come from a cache filled once at start.
 */
function vaultStore(onReady) {
  const ext = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
  const area = ext && ext.storage && ext.storage.session;
  if (!area) return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  const cache = new Map();
  Promise.resolve(area.get(null)).then((all) => {
    for (const [k, v] of Object.entries(all || {})) if (typeof v === "string") cache.set(k, v);
    onReady();
  }).catch(() => {});
  return {
    getItem: (k) => (cache.has(k) ? cache.get(k) : null),
    setItem: (k, v) => { cache.set(k, v); Promise.resolve(area.set({ [k]: v })).catch(() => {}); },
    removeItem: (k) => { cache.delete(k); Promise.resolve(area.remove(k)).catch(() => {}); }
  };
}

class SafeShareSymbolicVault {
  constructor(storagePrefix = "safeshare_vault_") {
    this.storagePrefix = storagePrefix;
    this.inMemoryVault = new Map();
    this.counter = 1;
    this.activeChatId = null;
    this.store = vaultStore(() => {
      if (this.inMemoryVault.size === 0) this.loadFromSession(this.activeChatId);
    });
    this.loadFromSession();
  }

  /**
   * Loads any existing ephemeral secrets from sessionStorage for this tab or specific chat.
   */
  loadFromSession(chatId = null) {
    this.activeChatId = chatId;
    if (!this.store) return;
    try {
      this.inMemoryVault.clear();
      this.counter = 1;
      const key = chatId ? `${this.storagePrefix}data_${chatId}` : `${this.storagePrefix}data_new`;
      const data = this.store.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        for (const [k, v] of Object.entries(parsed)) {
          this.inMemoryVault.set(k, v);
          const num = parseInt(k.replace(/\D/g, ""), 10);
          if (!isNaN(num) && num >= this.counter) {
            this.counter = num + 1;
          }
        }
      }
    } catch (_) {}
  }

  /**
   * Persists active ephemeral secrets to sessionStorage.
   */
  saveToSession(chatId = null) {
    if (chatId) this.activeChatId = chatId;
    if (!this.store) return;
    try {
      const obj = {};
      for (const [k, v] of this.inMemoryVault.entries()) {
        obj[k] = v;
      }
      const serialized = JSON.stringify(obj);
      const key = this.activeChatId ? `${this.storagePrefix}data_${this.activeChatId}` : `${this.storagePrefix}data_new`;
      this.store.setItem(key, serialized);
    } catch (_) {}
  }

  /**
   * Registers a secret entity into the vault and returns its symbolic variable token.
   * If the secret already exists with the same numeric value and currency, returns the existing symbol.
   * 
   * @param {string} raw - Original text snippet, e.g. "Rp 3.000.000" or "$4,200"
   * @param {number} numericValue - Parsed numerical value, e.g. 3000000 or 4200
   * @param {string} category - "FINANCIAL", "PROFILE", etc.
   * @param {object} metadata - { currency: "IDR", period: "monthly", ... }
   * @returns {string} - e.g. "<S1>"
   */
  register(raw, numericValue, category = "FINANCIAL", metadata = {}) {
    // Check if identical secret is already registered in active vault
    for (const [symbolId, secretObj] of this.inMemoryVault.entries()) {
      if (
        secretObj.numericValue === numericValue &&
        secretObj.currency === (metadata.currency || "IDR")
      ) {
        return symbolId;
      }
    }

    const symbolId = `<S${this.counter++}>`;
    const secretRecord = {
      symbolId,
      role: metadata.role || null,
      raw: raw.trim(),
      numericValue,
      value: numericValue,
      category,
      currency: metadata.currency || "IDR",
      period: metadata.period || "monthly",
      timestamp: Date.now()
    };

    this.inMemoryVault.set(symbolId, secretRecord);
    this.saveToSession();
    return symbolId;
  }

  /**
   * Retrieves secret record by symbol token (<S1>, S1, or role e.g. S1_GAJI).
   * @param {string} symbolId
   * @returns {object|null}
   */
  get(symbolId) {
    const key = symbolId.startsWith("<") && symbolId.endsWith(">") ? symbolId : `<${symbolId}>`;
    if (this.inMemoryVault.has(key)) return this.inMemoryVault.get(key);
    for (const record of this.inMemoryVault.values()) {
      if (record.role === symbolId || `<${record.role}>` === symbolId) {
        return record;
      }
    }
    return null;
  }

  /**
   * Returns a plain dictionary mapping symbols to their secret records.
   * @returns {Record<string, object>}
   */
  getAll() {
    const out = {};
    for (const [k, v] of this.inMemoryVault.entries()) {
      out[k] = v;
    }
    return out;
  }

  /**
   * Returns the count of registered secrets.
   * @returns {number}
   */
  size() {
    return this.inMemoryVault.size;
  }

  /**
   * Completely purges the vault in memory and in storage.
   */
  clear(chatId = null) {
    this.inMemoryVault.clear();
    this.counter = 1;
    const targetId = chatId || this.activeChatId;
    this.activeChatId = null;
    if (this.store) {
      try {
        const key = targetId ? `${this.storagePrefix}data_${targetId}` : `${this.storagePrefix}data_new`;
        this.store.removeItem(key);
        this.store.removeItem(`${this.storagePrefix}data`);
      } catch (_) {}
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SafeShareSymbolicVault;
}
