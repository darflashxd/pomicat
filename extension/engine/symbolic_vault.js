/**
 * SafeShare-AI — Ephemeral Symbolic Secret Vault
 * Securely holds mapping between symbolic variables (<S1>, <S2>) and their
 * actual secret parameters in local browser RAM / sessionStorage.
 * 
 * Guarantees:
 * 1. Zero network exposure: Secrets never leave client device.
 * 2. Ephemeral lifecycle: Automatically purged on session reset or tab close.
 * 3. Multi-turn consistency: Re-uses the same symbol ID for the same raw secret across turns.
 */

class SafeShareSymbolicVault {
  constructor(storagePrefix = "safeshare_vault_") {
    this.storagePrefix = storagePrefix;
    this.inMemoryVault = new Map();
    this.counter = 1;
    this.loadFromSession();
  }

  /**
   * Loads any existing ephemeral secrets from sessionStorage for this tab.
   */
  loadFromSession() {
    if (typeof sessionStorage === "undefined") return;
    try {
      const data = sessionStorage.getItem(`${this.storagePrefix}data`);
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
  saveToSession() {
    if (typeof sessionStorage === "undefined") return;
    try {
      const obj = {};
      for (const [k, v] of this.inMemoryVault.entries()) {
        obj[k] = v;
      }
      sessionStorage.setItem(`${this.storagePrefix}data`, JSON.stringify(obj));
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
   * Retrieves secret record by symbol token (<S1> or S1).
   * @param {string} symbolId
   * @returns {object|null}
   */
  get(symbolId) {
    const key = symbolId.startsWith("<") && symbolId.endsWith(">") ? symbolId : `<${symbolId}>`;
    return this.inMemoryVault.get(key) || null;
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
   * Completely purges the vault in memory and in sessionStorage.
   */
  clear() {
    this.inMemoryVault.clear();
    this.counter = 1;
    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.removeItem(`${this.storagePrefix}data`);
      } catch (_) {}
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SafeShareSymbolicVault;
}
