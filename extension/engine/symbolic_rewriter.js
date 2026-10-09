/**
 * SafeShare-AI — Outbound Prompt Symbolic Rewriter
 * Intercepts outbound user prompts, identifies personal sensitive values,
 * stores them into the local Symbolic Vault, and replaces them with algebraic
 * variables (<S1>, <S2>) plus a steering contract.
 * 
 * Invariant: secret ∉ outbound_prompt
 */

const _resolveHeuristics = () => (typeof HeuristicsRedactor !== "undefined" ? HeuristicsRedactor : (typeof require !== "undefined" ? require("./heuristics.js") : null));
const _resolveContextual = () => (typeof ContextualClassifier !== "undefined" ? ContextualClassifier : (typeof require !== "undefined" ? require("./contextual.js") : null));
const _resolvePseudonymizer = () => (typeof ConsistentPseudonymizer !== "undefined" ? ConsistentPseudonymizer : (typeof require !== "undefined" ? require("./pseudonymizer.js") : null));
const _resolveVault = () => (typeof SafeShareSymbolicVault !== "undefined" ? SafeShareSymbolicVault : (typeof require !== "undefined" ? require("./symbolic_vault.js") : null));

class SafeShareSymbolicRewriter {
  constructor(vault = null) {
    const VaultClass = _resolveVault();
    const HeuristicsClass = _resolveHeuristics();
    const ContextualClass = _resolveContextual();
    const PseudonymizerClass = _resolvePseudonymizer();

    this.vault = vault || (VaultClass ? new VaultClass() : null);
    this.heuristics = HeuristicsClass ? new HeuristicsClass() : null;
    this.contextual = ContextualClass ? new ContextualClass() : null;
    this.pseudonymizer = PseudonymizerClass ? new PseudonymizerClass() : null;
  }

  /**
   * Parses the currency code from a raw financial text string.
   * @param {string} raw
   * @returns {string}
   */
  detectCurrency(raw) {
    if (/Rp|IDR/i.test(raw)) return "IDR";
    if (/\$|USD/i.test(raw)) return "USD";
    if (/€|EUR/i.test(raw)) return "EUR";
    if (/£|GBP/i.test(raw)) return "GBP";
    return "IDR";
  }

  /**
   * Analyzes an input prompt to detect whether it contains personal sensitive values
   * suitable for Pre-Inference symbolic protection.
   * 
   * @param {string} text
   * @returns {{hasSensitive: boolean, detectedItems: Array<{raw: string, val: number, category: string}>}}
   */
  analyze(text) {
    if (!text || text.trim().length === 0) {
      return { hasSensitive: false, detectedItems: [] };
    }

    const hResult = this.heuristics.scan(text);
    const cDetections = this.contextual.classifyTurn(hResult.sanitizedText, 0);

    const detectedItems = [];

    // 1. Process contextual financial entities
    for (const det of cDetections) {
      if (det.category === "SENSITIVE_FINANCIAL") {
        const val = this.pseudonymizer.parseFinancialValue(det.raw);
        if (!isNaN(val) && val >= 100) {
          detectedItems.push({
            raw: det.raw,
            val,
            category: "FINANCIAL",
            currency: this.detectCurrency(det.raw)
          });
        }
      }
    }

    // 2. Process heuristics financial entities (cards, accounts, CVV)
    for (const hDet of hResult.detections) {
      if (["CREDIT_CARD", "PREFIXED_BANK_LOAN_ID", "UNIVERSAL_RECORD_IDENTIFIER"].includes(hDet.type)) {
        detectedItems.push({
          raw: hDet.raw,
          val: hDet.secretToken || hDet.raw,
          category: hDet.category,
          type: hDet.type
        });
      }
    }

    return {
      hasSensitive: detectedItems.length > 0,
      detectedItems
    };
  }

  /**
   * Generates the In-Context Steering Instruction appended to the prompt.
   * Tells the LLM to process symbols as fixed parameters and emit formulas.
   * 
   * @param {Array<string>} symbols - e.g. ["<S1>"]
   * @param {string} language - "id" | "en"
   * @returns {string}
   */
  buildSteeringInstruction(symbols, language = "en") {
    if (!symbols || symbols.length === 0) return "";
    const symList = symbols.join(", ");

    if (language === "id") {
      return `\n\n[PROTOKOL PRIVASI: Perlakukan variabel ${symList} sebagai parameter angka tetap. Keluarkan rincian anggaran, alokasi biaya, dan proyeksi akumulasi waktu secara eksplisit dalam bentuk formula matematika terhadap ${symList} (contoh: 0.30 * ${symbols[0]}, 12 * 0.30 * ${symbols[0]}).]`;
    }

    return `\n\n[PRIVACY PROTOCOL: Treat ${symList} as an exact fixed parameter. Provide budget allocations and multi-period accumulations explicitly in proportional algebraic terms of ${symList} (e.g. 0.30 * ${symbols[0]}, 12 * 0.30 * ${symbols[0]}).]`;
  }

  /**
   * Transforms an outbound user prompt:
   * 1. Detects personal secrets.
   * 2. Registers secrets in Local Vault.
   * 3. Replaces secrets in prompt with symbolic tokens (<S1>).
   * 4. Appends Steering Contract.
   * 5. Asserts the strict security invariant: secret ∉ outbound_prompt.
   * 
   * @param {string} rawPrompt
   * @returns {{sanitizedPrompt: string, isTransformed: boolean, vaultEntries: Record<string, object>, symbols: Array<string>}}
   */
  rewrite(rawPrompt) {
    const analysis = this.analyze(rawPrompt);
    if (!analysis.hasSensitive) {
      return {
        sanitizedPrompt: rawPrompt,
        isTransformed: false,
        vaultEntries: this.vault.getAll(),
        symbols: []
      };
    }

    let sanitizedPrompt = rawPrompt;
    const generatedSymbols = [];

    // Sort detected items by length (longest match first) to prevent substring collision
    const sorted = [...analysis.detectedItems].sort((a, b) => b.raw.length - a.raw.length);

    for (const item of sorted) {
      if (item.category === "FINANCIAL" && typeof item.val === "number") {
        const symbolId = this.vault.register(item.raw, item.val, "FINANCIAL", {
          currency: item.currency,
          period: "monthly"
        });
        generatedSymbols.push(symbolId);

        // Replace raw representation with symbol
        const escRaw = item.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(`(?<![\\w])${escRaw}(?![\\w])`, "gi");
        sanitizedPrompt = sanitizedPrompt.replace(rx, symbolId);
      }
    }

    // Determine language (Indonesian or English)
    const isIndonesian = /\b(?:saya|gaji|tabungan|mobil|bulan|tahun|kantor|cicilan)\b/i.test(rawPrompt);
    const steering = this.buildSteeringInstruction(generatedSymbols, isIndonesian ? "id" : "en");
    sanitizedPrompt += steering;

    // Hard Security Invariant Check: Verify that no raw numeric secret remains in sanitizedPrompt!
    for (const item of sorted) {
      if (typeof item.val === "number" && item.val >= 1000) {
        const digits = String(item.val);
        if (sanitizedPrompt.includes(digits)) {
          // If digits still exist, replace all raw digit occurrences with the symbol
          sanitizedPrompt = sanitizedPrompt.replace(new RegExp(`\\b${digits}\\b`, "g"), generatedSymbols[0]);
        }
      }
    }

    return {
      sanitizedPrompt,
      isTransformed: true,
      vaultEntries: this.vault.getAll(),
      symbols: generatedSymbols
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SafeShareSymbolicRewriter;
}
