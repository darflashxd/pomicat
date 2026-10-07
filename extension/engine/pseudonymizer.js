/**
 * SafeShare-AI — Tier 3: Canonical Equivalence Class & Global Cross-Turn Sweeper
 * 
 * Neutralizes "Echo & Derivation Leakage":
 * When an AI assistant echoes user data, formats it with abbreviations (e.g. "Rp28,5 jt"),
 * calculates annualized earnings ("Rp342 juta/tahun"), computes remainders ("Rp14,3 juta"),
 * or ratios ("49,8%"), this engine builds canonical equivalence clusters and scrubs
 * the entire conversation history (User and Assistant turns) using consistent pseudonyms.
 */

/**
 * SafeShare-AI — Adversary-Oracle Reconstruction Solver
 * 
 * Replaces naive hardcoded blocklists with a dynamic mathematical solver.
 * Probes whether any visible numbers in LLM responses can invert/reconstruct
 * the original secret parameter (e.g. 10.8M / 12 / 0.30 = 3M).
 * If reconstructable, suppresses the minimal hitting set using whole-token spans.
 */
class AdversaryOracleSolver {
  constructor(tolerance = 0.015) {
    this.tolerance = tolerance;
    // Periodic accumulation constants: months in 1 to 10 years, weeks, quarters
    this.PERIODIC_CONSTANTS = [1, 2, 3, 4, 5, 6, 10, 12, 24, 36, 48, 52, 60, 120, 100];
    this.publicAnchorsRx = /\b(?:rata-rata|median|benchmark|standar|survei|indeks|umr|laporan publik|indeed|glassdoor|levels\.fyi)\b/i;
    this.hasExplicitPersonRx = /\b(?:saya|ku|kami|Anda|kamu|mu|gw|gue|aku|my|your)\b/i;
  }

  findCodeBlockSpans(text) {
    const spans = [];
    const rx = /```[a-zA-Z0-9_-]*[\s\S]*?```/g;
    let m;
    while ((m = rx.exec(text)) !== null) {
      spans.push([m.index, m.index + m[0].length]);
    }
    return spans;
  }

  isSafePublicSpan(text, start, end) {
    const lineStart = Math.max(0, text.lastIndexOf("\n", start));
    const nextNewline = text.indexOf("\n", end);
    const lineEnd = nextNewline === -1 ? text.length : nextNewline;
    const line = text.substring(lineStart, lineEnd);
    return this.publicAnchorsRx.test(line) && !this.hasExplicitPersonRx.test(line);
  }

  lexNumericSpans(text) {
    // Regex matching whole numerical tokens with currency, units, decimals, and %
    const rx = /(?:(?:\(\s*(?:(?:Rp\.?|IDR|\$|USD|€|EUR|£|GBP|CHF|SGD)\s*)?\d+(?:[.,]\d+)*(?:\s*(?:k|m|million|billion|juta|jt))?\s*\))|(?:(?:Rp\.?|IDR|\$|USD|€|EUR|£|GBP|CHF|SGD)\s*)?\d+(?:[.,]\d+)*(?:\s*(?:juta|jt|jeti|jetong|miliar|milyar|million|\bm\b|billion|\bb\b|k|rb|ribu|thousand|racks|bands|ember|%(?!\w)))?|half\s+a\s+mil\b)/gi;
    const nonFinUnits = /^\s*(?:copies\s*\/\s*m[lL]|cells\s*\/\s*u[lL]|gwei|wei|eth|btc|sol|mmol\s*\/\s*l|mg\s*\/\s*dl|u\s*\/\s*l|gas|saham|lembar|shares|bps|basis\s+points|years?|months?)\b/i;
    const tokens = [];
    let m;
    while ((m = rx.exec(text)) !== null) {
      const raw = m[0].trim();
      if (!raw) continue;

      // Ensure we don't start in the middle of a word or tag or dot (e.g. 10.244.0.15)
      if (m.index > 0 && /[\w.]/.test(text[m.index - 1])) {
        continue;
      }

      const afterText = text.substring(m.index + m[0].length);
      // Skip if followed by dot and digits (IP address check)
      if (/^\.\d+/.test(afterText)) {
        continue;
      }

      // Skip if followed by non-financial technical/lab units
      if (nonFinUnits.test(afterText)) {
        continue;
      }

      // Skip if inside technical container / OS user configs
      const lineStart = Math.max(0, text.lastIndexOf("\n", m.index));
      const beforeInLine = text.substring(lineStart, m.index);
      if (/(?:runAsUser|runAsGroup|fsGroup|port|containerPort|uid|gid)\s*[:=]\s*$/i.test(beforeInLine)) {
        continue;
      }

      const cleanLower = raw.toLowerCase();
      const isRatio = cleanLower.endsWith("%");

      let val = 0;
      if (cleanLower.includes("half a mil")) {
        val = 500000;
      } else if (isRatio) {
        val = parseFloat(cleanLower.replace(/[^\d.,]/g, "").replace(",", ".")) / 100;
      } else if (/(?:miliar|billion|\bb\b|ember)/i.test(cleanLower)) {
        val = Math.round(parseFloat(cleanLower.replace(/[^\d.,]/g, "").replace(",", ".")) * 1e9);
      } else if (/(?:juta|jt|jeti|jetong|million|\bm\b)/i.test(cleanLower)) {
        val = Math.round(parseFloat(cleanLower.replace(/[^\d.,]/g, "").replace(",", ".")) * 1e6);
      } else if (/(?:k|rb|ribu|thousand|racks|bands)/i.test(cleanLower)) {
        val = Math.round(parseFloat(cleanLower.replace(/[^\d.,]/g, "").replace(",", ".")) * 1e3);
      } else {
        const digits = cleanLower.replace(/\D/g, "");
        if (digits.length >= 4) val = parseInt(digits, 10);
        else val = parseInt(digits, 10) || 0;
      }

      if (val > 0) {
        tokens.push({
          raw: m[0],
          start: m.index,
          end: m.index + m[0].length,
          val: val,
          isRatio: isRatio,
          isSmallInt: !isRatio && val <= 100 && !/(?:Rp|IDR|\$|USD|€|EUR|£|GBP|CHF|SGD)/i.test(raw)
        });
      }
    }
    return tokens;
  }

  solveAndRedact(text, secretValues) {
    if (!secretValues || secretValues.length === 0) return text;
    const tokens = this.lexNumericSpans(text);
    const ratios = tokens.filter(t => t.isRatio && t.val > 0).map(t => t.val);
    const codeBlocks = this.findCodeBlockSpans(text);
    const leaks = [];

    for (const secret of secretValues) {
      if (secret < 1000) continue;

      for (const token of tokens) {
        if (token.isRatio || token.isSmallInt || token.val < 1000) continue;
        if (codeBlocks.some(([s, e]) => token.start >= s && token.start < e)) continue;
        if (this.isSafePublicSpan(text, token.start, token.end)) continue;

        let isLeak = false;

        // 1. Direct equality with secret
        if (Math.abs(token.val - secret) / secret <= this.tolerance) {
          isLeak = true;
        }

        // 2. Periodic multiplier/divisor (months, years, weeks)
        if (!isLeak) {
          for (const c of this.PERIODIC_CONSTANTS) {
            if (Math.abs(token.val * c - secret) / secret <= this.tolerance || Math.abs(token.val / c - secret) / secret <= this.tolerance) {
              isLeak = true;
              break;
            }
          }
        }

        // 3. Ratio inversion and Periodic Accumulation
        if (!isLeak) {
          for (const r of ratios) {
            if (Math.abs(token.val / r - secret) / secret <= this.tolerance || Math.abs(token.val * r - secret) / secret <= this.tolerance) {
              isLeak = true;
              break;
            }
            for (const c of this.PERIODIC_CONSTANTS) {
              const c1 = (token.val / c) / r;
              if (Math.abs(c1 - secret) / secret <= this.tolerance) {
                isLeak = true;
                break;
              }
              const c2 = (token.val * c) / r;
              if (Math.abs(c2 - secret) / secret <= this.tolerance) {
                isLeak = true;
                break;
              }
            }
            if (isLeak) break;
          }
        }

        // 4. Percentage raise / projection inversions
        if (!isLeak) {
          for (const p of [0.05, 0.10, 0.12, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]) {
            if (Math.abs(token.val / (1 + p) - secret) / secret <= this.tolerance || Math.abs(token.val / p - secret) / secret <= this.tolerance) {
              isLeak = true;
              break;
            }
          }
        }

        // 5. Midpoint percentage raise inversions (e.g. 15-20% midpoint on 28.5M = 33M)
        if (!isLeak) {
          const midpoints = [0.125, 0.175, 0.15, 0.225, 0.25];
          for (const mp of midpoints) {
            if (Math.abs(token.val / (1 + mp) - secret) / secret <= 0.03) {
              isLeak = true;
              break;
            }
          }
        }

        if (isLeak) {
          const lineStart = Math.max(0, text.lastIndexOf("\n", token.start));
          const nextNl = text.indexOf("\n", token.end);
          const lineEnd = nextNl === -1 ? text.length : nextNl;
          const line = text.substring(lineStart, lineEnd).toLowerCase();

          let tag = "[REDACTED_BUDGET_ALLOCATION]";
          if (line.includes("year") || line.includes("tahun") || line.includes("timeline") || line.includes("akumulasi")) {
            tag = "[REDACTED_SAVINGS_ACCUMULATION]";
          } else if (line.includes("kenaikan") || line.includes("increment") || line.includes("delta") || line.includes("tambahan")) {
            tag = "[REDACTED_SALARY_INCREMENT]";
          } else if (/\bnaik\b/i.test(line) || line.includes("proyeksi") || line.includes("projected") || line.includes("menjadi")) {
            tag = "[REDACTED_PROJECTED_SALARY]";
          } else if (line.includes("sisa") || line.includes("remainder") || line.includes("cicilan") || line.includes("cashflow") || line.includes("kpr")) {
            tag = "[REDACTED_REMAINDER_CASHFLOW]";
          } else if (line.includes("budget") || line.includes("anggaran") || line.includes("alokasi") || line.includes("car") || line.includes("food") || line.includes("transport") || line.includes("saving") || line.includes("tabungan")) {
            tag = "[REDACTED_BUDGET_ALLOCATION]";
          } else if (Math.abs(token.val - secret) / secret <= this.tolerance) {
            tag = "[REDACTED_FINANCIAL_1]";
          }

          leaks.push({
            start: token.start,
            end: token.end,
            replacement: tag
          });
        }
      }
    }

    // Sort leaks in reverse position order and deduplicate
    leaks.sort((a, b) => b.start - a.start);
    const seen = new Set();
    const dedupedLeaks = [];
    let out = text;
    for (const l of leaks) {
      const key = `${l.start}:${l.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedupedLeaks.push(l);
        out = out.substring(0, l.start) + l.replacement + out.substring(l.end);
      }
    }

    this.lastLeaks = dedupedLeaks;
    return out;
  }
}

class ConsistentPseudonymizer {
  constructor() {
    this.entityMap = new Map();
    this.counters = {
      USER: 1,
      CORP: 1,
      FINANCIAL: 1,
      HEALTH: 1,
      HR: 1,
      PROJECT: 1
    };
  }

  reset() {
    this.entityMap.clear();
    for (let k in this.counters) {
      this.counters[k] = 1;
    }
  }

  /**
   * Robustly parses formatted, casual, or abbreviated currency strings into base integer.
   * Handles: Rp 28.500.000, 28,5 juta, 15jt, 90k, $150,000, 2.5 miliar.
   */
  parseFinancialValue(raw) {
    if (!raw || typeof raw !== "string") return 0;
    const clean = raw.trim().toLowerCase();

    if (clean.includes("half a mil")) return 500000;

    // Billions (miliar, milyar, billion, b, ember)
    if (/(?:miliar|milyar|billion|\bb\b|ember)/i.test(clean)) {
      const numPart = clean.replace(/[^\d.,]/g, "").replace(/,/g, ".");
      const val = parseFloat(numPart);
      if (!isNaN(val)) return Math.round(val * 1e9);
    }

    // Millions (juta, jt, jeti, jetong, million, m)
    if (/(?:juta|jt|jeti|jetong|million|\bm\b)/i.test(clean)) {
      const numPart = clean.replace(/[^\d.,]/g, "").replace(/,/g, ".");
      const val = parseFloat(numPart);
      if (!isNaN(val)) return Math.round(val * 1e6);
    }

    // Thousands (k, rb, ribu, thousand, racks, bands)
    if (/(?:k|rb|ribu|thousand|racks|bands)/i.test(clean)) {
      const numPart = clean.replace(/[^\d.,]/g, "").replace(/,/g, ".");
      const val = parseFloat(numPart);
      if (!isNaN(val)) return Math.round(val * 1e3);
    }

    // Standard integers with dots or commas (e.g. 28.500.000 or 150,000)
    const digitsOnly = clean.replace(/\D/g, "");
    return parseInt(digitsOnly, 10) || 0;
  }

  /**
   * Generates or retrieves an existing consistent pseudonym for an entity.
   */
  getPseudonym(rawEntity, category) {
    const key = `${category}::${rawEntity.trim().toLowerCase()}`;
    if (this.entityMap.has(key)) {
      return this.entityMap.get(key);
    }

    let pseudonym;
    switch (category) {
      case "SENSITIVE_FINANCIAL":
        pseudonym = `[REDACTED_FINANCIAL_${this.counters.FINANCIAL++}]`;
        break;
      case "SENSITIVE_HEALTH":
        pseudonym = `[CONFIDENTIAL_HEALTH_RECORD_${this.counters.HEALTH++}]`;
        break;
      case "SENSITIVE_CORP":
        pseudonym = `[INTERNAL_CORP_ASSET_${this.counters.CORP++}]`;
        break;
      case "SENSITIVE_LEGAL_HR":
        pseudonym = `[HR_DISCIPLINARY_RECORD_${this.counters.HR++}]`;
        break;
      case "SENSITIVE_USER":
      case "USER":
        pseudonym = `[User_${String.fromCharCode(64 + this.counters.USER++)}]`;
        break;
      default:
        pseudonym = `[ANONYMIZED_ENTITY_${this.counters.PROJECT++}]`;
    }

    this.entityMap.set(key, pseudonym);
    return pseudonym;
  }

  /**
   * Builds an Equivalence Class of regex patterns for an entity, capturing all
   * abbreviations, reformattings, and arithmetic derivations made by LLMs.
   */
  buildEquivalenceVariants(raw, category, allEntities = []) {
    const variants = [];
    const escapedRaw = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    variants.push(escapedRaw);

    if (category === "SENSITIVE_FINANCIAL") {
      variants.push(`\\b${escapedRaw}\\b`);
      const num = this.parseFinancialValue(raw);
      if (num && !isNaN(num) && num >= 1000) {
        const idFormatted = num.toLocaleString("id-ID").replace(/\./g, "\\.");
        const enFormatted = num.toLocaleString("en-US").replace(/,/g, ",");

        // 1. Currency prefix + formatted number or plain number
        variants.push(`\\b(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${idFormatted}\\b`);
        variants.push(`\\b(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${enFormatted}\\b`);
        variants.push(`\\b${num}\\b`);

        // 2. Millions abbreviations (e.g. 28,5 juta, 28.5 jt, 28,5 jt)
        if (num >= 1e5) {
          const millions = num / 1e6;
          const milDot = millions.toString().replace(".", "\\.");
          const milComma = millions.toString().replace(".", ",");
          variants.push(`\\b(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${milDot}|${milComma})\\s*(?:juta|jt|million|m)\\b`);
          
          if (millions === Math.floor(millions)) {
            variants.push(`\\b(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${Math.floor(millions)}\\s*(?:juta|jt|million|m)\\b`);
          }

          // 3. Annualized derivations (LLM multiplying monthly salary by 12)
          const annual = num * 12;
          const annualM = annual / 1e6;
          const annDot = annualM.toString().replace(".", "\\.");
          const annComma = annualM.toString().replace(".", ",");
          variants.push(`\\b(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${annDot}|${annComma})\\s*(?:juta|jt|million|m)(?:\\s*\\/\\s*tahun|\\s*per\\s*tahun)?\\b`);
          variants.push(`\\b(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${annual.toLocaleString("id-ID").replace(/\./g, "\\.")}\\b`);
        }
      }
    } else if (category === "SENSITIVE_HEALTH") {
      const drugEquivalents = {
        "lexapro": ["escitalopram", "cipralex"],
        "escitalopram": ["lexapro", "cipralex"],
        "cipralex": ["escitalopram", "lexapro"],
        "zoloft": ["sertraline"],
        "sertraline": ["zoloft"],
        "prozac": ["fluoxetine"],
        "fluoxetine": ["prozac"],
        "xanax": ["alprazolam"],
        "alprazolam": ["xanax"],
        "valium": ["diazepam"],
        "diazepam": ["valium"],
        "clonazepam": ["klonopin", "rivotril"],
        "klonopin": ["clonazepam", "rivotril"],
        "rivotril": ["clonazepam", "klonopin"],
        "risperidone": ["risperdal"],
        "risperdal": ["risperidone"],
        "lithium": ["lithium carbonate", "eskalith", "priadel"],
        "clozapine": ["clozaril"],
        "clozaril": ["clozapine"],
        "adderall": ["amphetamine", "dextroamphetamine"],
        "ritalin": ["methylphenidate", "concerta"],
        "concerta": ["methylphenidate", "ritalin"],
        "methylphenidate": ["ritalin", "concerta"],
        "cymbalta": ["duloxetine"],
        "duloxetine": ["cymbalta"],
        "glucophage": ["metformin"],
        "metformin": ["glucophage"],
        "lipitor": ["atorvastatin"],
        "atorvastatin": ["lipitor"]
      };

      const words = raw.toLowerCase().split(/\s+/);
      const synonyms = new Set();
      for (let w of words) {
        if (drugEquivalents[w]) {
          drugEquivalents[w].forEach(syn => synonyms.add(syn));
        }
      }

      // Add base drug brand/name variants if 2 tokens e.g. "Lexapro 20mg"
      const parts = raw.split(/\s+/);
      if (parts.length === 2 && /^\d+\s*mg$/i.test(parts[1])) {
        const brandName = parts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        variants.push(`\\b(?:obat\\s+)?${brandName}(?:\\s+\\d+\\s*mg)?\\b`);
      }

      // Add all recognized generic/brand synonyms
      for (let syn of synonyms) {
        const escapedSyn = syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        variants.push(`\\b(?:obat\\s+)?${escapedSyn}(?:\\s+\\d+\\s*mg)?\\b`);
      }
    } else if (category === "SENSITIVE_CORP") {
      // e.g. "Project Valkyrie Core" -> also match "Project Valkyrie", "Valkyrie Core"
      const match = raw.match(/Project\s+([A-Z][a-z0-9]+)/i);
      if (match) {
        variants.push(`\\bProject\\s+${match[1]}(?:\\s+[A-Z][a-z0-9]+)?\\b`);
      }
    } else if (category === "USER" || category === "SENSITIVE_USER") {
      // Build full name, handles, and individual name words
      const cleanRaw = raw.replace(/^@/, "").trim();
      variants.push(`@?${cleanRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

      const words = cleanRaw.split(/\s+/);
      // 1. Full name
      variants.push(`\\b${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`);
      
      // 2. Multi-word sub-combinations (e.g. "Budianto Kusuma", "Kusuma Alama")
      for (let i = 0; i < words.length; i++) {
        for (let j = i + 2; j <= words.length; j++) {
          if (j - i < words.length) {
            variants.push(`\\b${words.slice(i, j).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`);
          }
        }
      }

      // 3. Individual name tokens (>= 3 chars to prevent false matches with prepositions)
      for (let w of words) {
        if (w.length >= 3) {
          variants.push(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        }
      }
    }

    return variants;
  }

  /**
   * Sweeps and neutralizes entities and their equivalence classes across ALL turns (User & Assistant).
   * @param {Array<{role: string, content: string}>} turns
   * @param {Array<{turnIndex: number, raw: string, category: string}>} detectedEntities
   */
  anonymizeConversation(turns, detectedEntities) {
    const updatedTurns = JSON.parse(JSON.stringify(turns));

    // Extract user name if introduced in user prompt, respecting stop-words and clause boundaries
    const userIntroMatches = [];
    const nameStopWords = new Set([
      "alamat", "tinggal", "umur", "usia", "nomor", "no", "telfon", "telepon", "hp", "wa",
      "email", "bekerja", "dan", "dari", "lahir", "nik", "nim", "kpr", "gaji", "di", "jalan", "jl",
      "address", "phone", "living", "working", "born", "age", "years", "my", "saya", "staf",
      "seorang", "karyawan", "pekerja", "adalah", "applying", "looking", "seeking", "interested",
      "planning", "trying", "wondering", "hoping", "writing", "asking", "building", "using", "here",
      "not", "currently", "just", "also", "now", "reaching", "facing", "dealing", "having",
      "struggling", "earning", "making", "paying", "saving", "investing", "borrowing", "holding",
      "reporting", "filing", "a", "an", "the", "in", "on", "to", "for", "with", "at", "by", "from",
      "debt", "loan", "consolidation"
    ]);

    turns.forEach((turn, idx) => {
      if (turn.role === "user") {
        const nameIntroRx = /(?:(?:(?:\b(?:nama\s+(?:lengkap\s+)?(?:saya|gw|gue|ku)|namaku|perkenalkan\s+(?:nama\s+saya|saya|namaku)?|panggil\s+(?:saja\s+)?(?:saya|aku)|my\s+(?:full\s+)?name\s+is|i\s*[\x27\x60]?\s*(?:am|m)|call\s+me|halo\s+saya))\s+)|(?:(?:\b(?:nama\s+lengkap|full\s+name|name|nama)\s*[:=\-]\s*)))([^,.\n!?]+)/gi;
        let nm;
        while ((nm = nameIntroRx.exec(turn.content)) !== null) {
          const rawPhrase = nm[1].trim();
          const words = rawPhrase.split(/\s+/);
          const nameTokens = [];
          for (const w of words) {
            const clean = w.toLowerCase().replace(/[^a-z]/g, "");
            if (nameStopWords.has(clean)) break;
            nameTokens.push(w);
            if (nameTokens.length >= 4) break; // Max 4 words for a realistic name
          }
          if (nameTokens.length > 0 && !nameStopWords.has(nameTokens[0].toLowerCase())) {
            // Ensure for "i am / i'm", it looks like a proper name (starts with uppercase)
            if (/^(?:i\s*[\x27\x60]?\s*(?:am|m)|call\s+me)/i.test(nm[0]) && !/^[A-Z]/.test(nameTokens[0])) {
              // skip
            } else {
              userIntroMatches.push({
                turnIndex: idx,
                raw: nameTokens.join(" "),
                category: "USER"
              });
            }
          }
        }
      }
    });

    const allTargets = [...detectedEntities, ...userIntroMatches];

    // Compute arithmetic derivations between financial pairs (e.g. Remainder and Ratios)
    const financialNums = allTargets
      .filter(e => e.category === "SENSITIVE_FINANCIAL")
      .map(e => ({ raw: e.raw, val: this.parseFinancialValue(e.raw) }))
      .filter(e => !isNaN(e.val) && e.val >= 1000);

    const derivedPatterns = [];
    if (financialNums.length >= 2) {
      const sorted = [...financialNums].sort((a, b) => b.val - a.val);
      const valA = sorted[0].val; // e.g. 28.5M
      const valB = sorted[1].val; // e.g. 14.2M
      const diff = valA - valB;   // e.g. 14.3M

      if (diff >= 100000) {
        const diffM = diff / 1e6;
        const diffDot = diffM.toFixed(1).replace(".", "\\.");
        const diffComma = diffM.toFixed(1).replace(".", ",");
        derivedPatterns.push({
          pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${diffDot}|${diffComma})\\s*(?:juta|jt|million|m))\\b`,
          replacement: "[REDACTED_REMAINDER_CASHFLOW]"
        });
        derivedPatterns.push({
          pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${diff.toLocaleString("id-ID").replace(/\./g, "\\.")})\\b`,
          replacement: "[REDACTED_REMAINDER_CASHFLOW]"
        });
      }

      // Debt ratio e.g. 14.2 / 28.5 = 49.8%
      const ratio = ((valB / valA) * 100).toFixed(1);
      const ratioDot = ratio.replace(".", "\\.");
      const ratioComma = ratio.replace(".", ",");
      derivedPatterns.push({
        pattern: `\\b(?:${ratioDot}|${ratioComma})\\s*%(?!\\w)`,
        replacement: "[REDACTED_DEBT_RATIO]"
      });
    }

    // Neutralize Percentage Projection Clusters & Compound Residuals
    const percentages = [5, 10, 12, 15, 20, 25, 30, 35, 40, 50];
    for (const item of financialNums) {
      const val = item.val;
      for (const p of percentages) {
        const total = Math.round(val * (1 + p / 100));
        const delta = Math.round(val * (p / 100));
        const roundedTotal = Math.round(total / 1e6) * 1e6; // e.g. 32.775.000 -> 33.000.000!

        const allCandidateTotals = [];
        if (total >= 1000 && total !== val) allCandidateTotals.push(total);
        if (roundedTotal >= 100000 && roundedTotal !== total && roundedTotal !== val) allCandidateTotals.push(roundedTotal);

        for (const candTotal of allCandidateTotals) {
          // 1. Full formatted total
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${candTotal.toLocaleString("id-ID").replace(/\./g, "\\.")})\\b`,
            replacement: "[REDACTED_PROJECTED_SALARY]"
          });
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${candTotal.toLocaleString("en-US").replace(/,/g, ",")})\\b`,
            replacement: "[REDACTED_PROJECTED_SALARY]"
          });

          // 2. Abbreviated millions total (e.g. 33 juta, 33 jt)
          const candM = candTotal / 1e6;
          const totDot = candM.toString().replace(".", "\\.");
          const totComma = candM.toString().replace(".", ",");
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${totDot}|${totComma})\\s*(?:juta|jt|million|m))\\b`,
            replacement: "[REDACTED_PROJECTED_SALARY]"
          });
        }

        // 3. Full formatted delta increment
        if (delta >= 1000) {
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${delta.toLocaleString("id-ID").replace(/\./g, "\\.")})\\b`,
            replacement: "[REDACTED_SALARY_INCREMENT]"
          });
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${delta.toLocaleString("en-US").replace(/,/g, ",")})\\b`,
            replacement: "[REDACTED_SALARY_INCREMENT]"
          });

          // 4. Abbreviated millions delta
          const deltaM = delta / 1e6;
          const delDot = deltaM.toString().replace(".", "\\.");
          const delComma = deltaM.toString().replace(".", ",");
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${delDot}|${delComma})\\s*(?:juta|jt|million|m)(?:\\s*(?:per bulan|\\/bulan))?)\\b`,
            replacement: "[REDACTED_SALARY_INCREMENT]"
          });
        }

        // 5. Compound Residual Formula: (Gaji * (1 + p)) - Hutang
        if (financialNums.length >= 2) {
          const debtVal = financialNums.find(f => f.val < val)?.val;
          if (debtVal) {
            const remainder = total - debtVal;
            if (remainder >= 1000) {
              const remM = remainder / 1e6;
              const remDot = remM.toString().replace(".", "\\.");
              const remComma = remM.toString().replace(".", ",");
              derivedPatterns.push({
                pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${remainder.toLocaleString("id-ID").replace(/\./g, "\\.")})\\b`,
                replacement: "[REDACTED_PROJECTED_CASHFLOW]"
              });
              derivedPatterns.push({
                pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${remDot}|${remComma})\\s*(?:juta|jt|million|m))\\b`,
                replacement: "[REDACTED_PROJECTED_CASHFLOW]"
              });
            }
          }
        }
      }

      // Range Midpoint Projections (e.g. 15-20% midpoint on 28.5M = 33.487.500 -> 33.000.000)
      const rangePairs = [[10, 15], [15, 20], [10, 20], [20, 25], [20, 30]];
      for (const [p1, p2] of rangePairs) {
        const midRate = (p1 + p2) / 200;
        const midTotal = Math.round(val * (1 + midRate));
        const midRounded = Math.round(midTotal / 1e6) * 1e6;
        for (const midVal of [midTotal, midRounded]) {
          if (midVal >= 1000 && midVal !== val) {
            derivedPatterns.push({
              pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${midVal.toLocaleString("id-ID").replace(/\./g, "\\.")})\\b`,
              replacement: "[REDACTED_PROJECTED_SALARY]"
            });
            const mM = midVal / 1e6;
            derivedPatterns.push({
              pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${mM.toString().replace(".", "\\.")}|${mM.toString().replace(".", ",")})\\s*(?:juta|jt|million|m))\\b`,
              replacement: "[REDACTED_PROJECTED_SALARY]"
            });
          }
        }
      }
    }

    // Build replacement clusters for all target entities
    const replacementRules = [];

    for (const ent of allTargets) {
      const pseudo = this.getPseudonym(ent.raw, ent.category);
      const variants = this.buildEquivalenceVariants(ent.raw, ent.category, allTargets);

      for (const v of variants) {
        replacementRules.push({
          regexStr: v,
          replacement: pseudo,
          length: v.length
        });
      }
    }

    // Add derived arithmetic patterns
    for (const dp of derivedPatterns) {
      replacementRules.push({
        regexStr: dp.pattern,
        replacement: dp.replacement,
        length: dp.pattern.length
      });
    }

    // Sort replacement rules by pattern specificity (longest pattern first)
    replacementRules.sort((a, b) => b.length - a.length);

    // Helper to check if a match is inside an existing bracket tag e.g. [REDACTED_...]
    const isInsideBracket = (text, offset, length) => {
      const lastOpen = text.lastIndexOf("[", offset);
      const lastClose = text.lastIndexOf("]", offset);
      if (lastOpen === -1 || lastOpen < lastClose) {
        return false;
      }
      const nextClose = text.indexOf("]", offset + length - 1);
      const nextOpen = text.indexOf("[", offset + length - 1);
      if (nextClose === -1 || (nextOpen !== -1 && nextClose > nextOpen)) {
        return false;
      }
      return true;
    };

    // Global sweep across EVERY turn in the conversation, never mutating inside existing [bracket tags]
    for (const rule of replacementRules) {
      const reg = new RegExp(rule.regexStr, "gi");
      for (let turn of updatedTurns) {
        if (turn.content) {
          turn.content = turn.content.replace(reg, (match, ...args) => {
            const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];
            if (isInsideBracket(turn.content, offset, match.length)) {
              return match; // Inside [REDACTED_...], preserve!
            }
            return rule.replacement;
          });
        }
      }
    }

    // Syntactic Arrow Sweeper: e.g. "[REDACTED_FINANCIAL_1] → Rp32,775 jt"
    const arrowRx = /(\[REDACTED_FINANCIAL_\d+\]\s*(?:→|->|menjadi|naik menjadi)\s*)(?:Rp\s*|IDR\s*|\$\s*)?[\d.,]+(?:\s*(?:jt|juta|k|million))?/gi;
    for (let turn of updatedTurns) {
      if (turn.content) {
        turn.content = turn.content.replace(arrowRx, "$1[REDACTED_PROJECTED_SALARY]");
      }
    }

    // Syntactic Increment Sweeper: e.g. "Kenaikan hanya:\nRp4,275 jt/bulan"
    const incRx = /(Kenaikan(?:\s+hanya|\s+sebesar)?\s*:\s*)(?:Rp\s*|IDR\s*|\$\s*)?[\d.,]+(?:\s*(?:jt|juta|k|million))?(?:\s*(?:per bulan|\/bulan))?/gi;
    for (let turn of updatedTurns) {
      if (turn.content) {
        turn.content = turn.content.replace(incRx, "$1[REDACTED_SALARY_INCREMENT]");
      }
    }

    // Phase 3: Adversary-Oracle Reconstruction Solver
    // Evaluates all visible numbers against known secret values and suppresses derived leaks
    const financialSecrets = financialNums.map(f => f.val);
    const allSolverLeaks = [];
    if (financialSecrets.length > 0) {
      const solver = new AdversaryOracleSolver();
      for (let turn of updatedTurns) {
        if (turn.content && turn.role === "assistant") {
          turn.content = solver.solveAndRedact(turn.content, financialSecrets);
          if (solver.lastLeaks && solver.lastLeaks.length > 0) {
            allSolverLeaks.push(...solver.lastLeaks);
          }
        }
      }
    }

    return {
      anonymizedTurns: updatedTurns,
      mappings: Array.from(this.entityMap.entries()).map(([k, v]) => {
        const [cat, raw] = k.split("::");
        return { category: cat, original: raw, pseudonym: v };
      }),
      solverLeaks: allSolverLeaks
    };
  }
}

ConsistentPseudonymizer.AdversaryOracleSolver = AdversaryOracleSolver;

if (typeof module !== "undefined" && module.exports) {
  module.exports = ConsistentPseudonymizer;
  module.exports.AdversaryOracleSolver = AdversaryOracleSolver;
}
