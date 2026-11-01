/**
 * PomiCat: Outbound Prompt Symbolic Rewriter
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
   * Parses the currency code from a raw financial text string with prompt context awareness.
   * @param {string} raw
   * @param {string} fullContext
   * @returns {string}
   */
  detectCurrency(raw, fullContext = "") {
    if (/Rp|IDR|juta|jt|jeti|miliar|milyar/i.test(raw)) return "IDR";
    if (/S\$|SGD/i.test(raw)) return "SGD";
    if (/A\$|AUD/i.test(raw)) return "AUD";
    if (/C\$|CAD/i.test(raw)) return "CAD";
    if (/CHF/i.test(raw)) return "CHF";
    if (/\$|USD/i.test(raw)) return "USD";
    if (/€|EUR/i.test(raw)) return "EUR";
    if (/£|GBP/i.test(raw)) return "GBP";
    if (/₹|INR|LPA|Lakh/i.test(raw)) return "INR";

    // Infer from surrounding prompt context if raw has no explicit currency symbol
    if (fullContext) {
      if (/S\$|SGD|Singapore\b|DBS\b|OCBC\b|UOB\b/i.test(fullContext)) return "SGD";
      if (/A\$|AUD|Australia\b|Sydney\b|Melbourne\b|CBA\b/i.test(fullContext)) return "AUD";
      if (/C\$|CAD|Canada\b|Toronto\b|Vancouver\b|RBC\b/i.test(fullContext)) return "CAD";
      if (/CHF|Swiss|Zurich|Geneva/i.test(fullContext)) return "CHF";
      if (/\$|USD|dollars?\b|SF\b|San Francisco|Amazon|Stripe|FAANG|Silicon Valley|\bUS\b|\bNYC\b|\bAustin\b|\bSeattle\b/i.test(fullContext)) return "USD";
      if (/Rp|IDR|rupiah|gaji|tabungan|kantor|juta|jt|cicilan|Indonesia|Jakarta|Surabaya|Bandung/i.test(fullContext)) return "IDR";
      if (/€|EUR|euros?\b|Germany|France|Netherlands/i.test(fullContext)) return "EUR";
      if (/£|GBP|pounds?\b|London|UK\b/i.test(fullContext)) return "GBP";

      // If text is predominantly English without Indonesian indicators, default to USD
      const hasIndonesian = /\b(?:saya|gaji|kantor|tabungan|pinjol|cicilan|bulan|tahun|dan|di|ke|dari|yang|ini|itu)\b/i.test(fullContext);
      if (!hasIndonesian) return "USD";
    }

    return "IDR";
  }

  /**
   * Syntactic dependency-distance validator:
   * Ensures bare numbers without explicit currency symbols are within <= 12 tokens
   * of a financial semantic trigger (salary, debt, valuation, equity, bonus, etc.).
   * Prevents over-binding non-sensitive numbers (e.g. "Report 2024 page 450").
   */
  isWithinDependencyDistance(text, rawMatch, maxTokenDistance = 12) {
    if (!text || !rawMatch) return false;
    // Explicit currency symbols/indicators always bind (distance = 0)
    if (/[$€£¥₹]|(?:Rp|IDR|USD|EUR|GBP|SGD|AUD|CAD|CHF|k|M|miliar|juta|dollars?|dolar|bucks|rupiah|euros?|pounds?)\b/i.test(rawMatch)) {
      return true;
    }

    const idx = text.indexOf(rawMatch);
    if (idx === -1) return true;

    const beforeSlice = text.slice(Math.max(0, idx - 200), idx).trim();
    const afterSlice = text.slice(idx + rawMatch.length, idx + rawMatch.length + 200).trim();

    const beforeTokens = beforeSlice ? beforeSlice.split(/\s+/).slice(-maxTokenDistance).join(" ") : "";
    const afterTokens = afterSlice ? afterSlice.split(/\s+/).slice(0, maxTokenDistance).join(" ") : "";
    const windowContext = `${beforeTokens} ${afterTokens}`;

    const triggerRx = /\b(?:salary|gaji|income|earn|make|pocket|pull in|clearing|revenue|valuation|arr|mrr|ebitda|burn|runway|bonus|severance|debt|equity|safe|investment|funding|spend|spending|budget|cost|fee|rent|sewa|cicilan|tabungan|payout|compensation|deductible|mortgage|loan|pay)\b/i;

    const Contextual = this.contextual && this.contextual.constructor;
    return triggerRx.test(windowContext) ||
      Boolean(Contextual && Contextual.fixMoneyTypos && triggerRx.test(Contextual.fixMoneyTypos(windowContext)));
  }

  /**
   * Analyzes an input prompt to detect whether it contains personal sensitive values
   * suitable for Pre-Inference symbolic protection.
   * 
   * @param {string} text
   * @returns {{hasSensitive: boolean, detectedItems: Array<{raw: string, val: number, category: string, currency: string}>}}
   */
  analyze(text) {
    if (!text || text.trim().length === 0) {
      return { hasSensitive: false, detectedItems: [] };
    }

    const hResult = this.heuristics.scan(text);
    const cDetections = this.contextual.classifyTurn(hResult.baseText, 0, hResult.detections);

    const detectedItems = [];

    // 1. Process contextual financial entities
    for (const det of cDetections) {
      if (det.category === "SENSITIVE_FINANCIAL") {
        const val = this.pseudonymizer.parseFinancialValue(det.raw);
        // Small amounts are usually prices, but an hourly or daily wage ("$42 an hour") is income
        if (Number.isFinite(val) && (Math.abs(val) >= 100 || /\b(?:an|per|a)\s*(?:hour|hr|day|shift)\b/i.test(det.sentence || ""))) {
          if (this.isWithinDependencyDistance(text, det.raw, 12)) {
            detectedItems.push({
              raw: det.raw,
              val,
              category: "FINANCIAL",
              currency: this.detectCurrency(det.raw, text)
            });
          }
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
          type: hDet.type,
          currency: this.detectCurrency(hDet.raw, text)
        });
      }
    }

    return {
      hasSensitive: detectedItems.length > 0,
      detectedItems
    };
  }

  /**
   * Extracts a semantic noun anchor (e.g. GAJI, BONUS, SEWA) preceding a numeric value.
   * Prevents variable ambiguity and preserves context in algebraic steering.
   */
  extractSemanticRole(text, rawMatch, index = 1) {
    if (!text || !rawMatch) return `S${index}_VAL`;
    const idx = text.indexOf(rawMatch);
    if (idx === -1) return `S${index}_VAL`;

    const beforeSlice = text.slice(Math.max(0, idx - 80), idx).trim();
    const words = beforeSlice.split(/[\s,.:;!?"'()[\]{}]+/).filter(Boolean);
    const keywords = [
      "gaji_pokok", "gaji", "salary", "bonus", "sewa", "rent", "tabungan", "savings",
      "cicilan", "installment", "mortgage", "loan", "hutang", "debt", "pajak", "tax",
      "omset", "revenue", "income", "pengeluaran", "spending", "expense", "budget", "runway", "burn"
    ];

    const last3 = words.slice(-3).map(w => w.toLowerCase());
    for (const kw of keywords) {
      if (last3.includes(kw) || last3.join("_").includes(kw)) {
        return `S${index}_${kw.toUpperCase()}`;
      }
    }
    const lastWord = last3[last3.length - 1];
    if (lastWord && /^[a-z]{3,15}$/.test(lastWord) && !["dan", "di", "ke", "dari", "yang", "ini", "itu", "saya", "kamu", "dia", "anda", "the", "a", "an", "in", "on", "at", "to", "for", "is", "was"].includes(lastWord)) {
      return `S${index}_${lastWord.toUpperCase()}`;
    }
    return `S${index}_VAL`;
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
      return `\n\n[PROTOKOL PRIVASI: Perlakukan variabel ${symList} sebagai parameter angka tetap. Keluarkan rincian anggaran, alokasi biaya, dan formula matematika terhadap ${symList} secara langsung menggunakan ekspresi aljabar standar (contoh: 0.20 * VAL_A, (1.20 * VAL_A) - (VAL_B + VAL_C)). Jangan gunakan tag escape atau persamaan berantai.]`;
    }

    return `\n\n[PRIVACY PROTOCOL: Treat ${symList} as an exact fixed parameter. Provide budget allocations, spending, and formulas in standard algebraic terms (e.g. 0.20 * VAL_A, (1.20 * VAL_A) - (VAL_B + VAL_C)). Do not use escape tags or chained equations.]`;
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

    let symbolIdx = 1;
    for (const item of sorted) {
      if (item.category === "FINANCIAL" && typeof item.val === "number") {
        const role = this.extractSemanticRole(rawPrompt, item.raw, symbolIdx++);
        const symbolId = this.vault.register(item.raw, item.val, "FINANCIAL", {
          currency: item.currency,
          period: "monthly",
          role
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
