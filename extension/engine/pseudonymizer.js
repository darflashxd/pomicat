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
// Function words and programming type names that are never part of a person's name.
const COMMON_WORDS = new Set(("the a an and or but if of to in on at by for with from as is are was were be been being " +
  "that this these those it its he she they them his her their we our you your i me my one ones would could should " +
  "will can may might must shall do does did done have has had not no yes so than then there here what which who whom " +
  "whose when where why how all any some each every both more most other such only own same too very just also now " +
  "about into over after before under again further once out up down off above below between through during without " +
  "yang dan di ke dari ini itu untuk dengan pada adalah akan juga tidak atau saya aku kamu anda dia mereka kami kita " +
  "string str int integer long double float boolean bool char byte object any list map array dict set tuple void null " +
  "none true false item items name names value values key data type id").split(/\s+/));

// Lowercase name particles allowed after the first token ("Vincent van Gogh", "Mohammed bin Salman")
const NAME_PARTICLES = new Set("van von de der den du del della da di la le bin binti al el".split(" "));

// A learned "name" must be letters only, contain no common words, and (for loose forms such as
// "I'm X") start each token with a capital letter.
function looksLikeName(tokens, { requireCapital = false } = {}) {
  return tokens.length > 0 && tokens.every((t, i) =>
    (i > 0 && NAME_PARTICLES.has(t)) ||
    (/^\p{L}[\p{L}'-]*$/u.test(t) && t.length >= 2 && !COMMON_WORDS.has(t.toLowerCase()) &&
      (!requireCapital || /^\p{Lu}/u.test(t))));
}

// 1 -> A, 26 -> Z, 27 -> AA (spreadsheet style), so name labels never run into symbols
function letterLabel(n) {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

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
    // Identify telephone spans to avoid lexing phone digits (like 1-800-869-3557) as financial amounts
    const phoneSpans = [];
    const phoneRx = /(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
    let pm;
    while ((pm = phoneRx.exec(text)) !== null) {
      phoneSpans.push([pm.index, pm.index + pm[0].length]);
    }

    // Identify address spans to avoid lexing house numbers (e.g. 742 Evergreen Terrace) or postal codes as financial amounts
    const addressSpans = [];
    const addrRx = /\b(?:(?:(?:residential|shipping|mailing|home|street|billing)\s+)?address\s*[:=\-]?\s*(?:to\s+my\s+residential\s+address\s*:\s*)?|(?:(?:shipping|deliver(?:y|ing)?|ship|send|sent)\s+to\s+))?((?:(?:Flat|Unit|Apt|Apartment|Suite)\s+\d+[a-zA-Z]?,?\s*(?:[0-9]{1,5}\s+)?|[0-9]{1,5}\s+)[A-Za-z0-9\s.,\/-]+?\b(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Terrace|Ter|Place|Pl|Circle|Cir|Parkway|Pkwy)\b(?:[A-Za-z0-9\s.,\/-]*?(?:[A-Z]{2}\s+\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}))?)/gi;
    let am;
    while ((am = addrRx.exec(text)) !== null) {
      addressSpans.push([am.index, am.index + am[0].length]);
    }
    const idAddrRx = /\b(?:alamat(?:\s+(?:ktp|domisili|saya|tinggal|rumah))?(?:\s+di|\s+adalah|\s*:)?\s*)([A-Za-z0-9\s.,\/-]+?)(?=\s*(?:nomor\s+telfon|nomor\s+hp|no\s+hp|no\s+telp|telfon|telepon|phone|email|nik|nim|npwp|paspor|passport|sim|bpjs|gaji|[\r\n]|$))/gi;
    let iam;
    while ((iam = idAddrRx.exec(text)) !== null) {
      if (/\b(?:jalan|jl\.?|gang|gg\.?|kampung|kp\.?|komplek|perumahan|dusun|desa|kelurahan|kecamatan|rt\s*\d+|rw\s*\d+|no(?:mor)?\s*\d+|blok\s*[a-z0-9]+)\b/i.test(iam[0])) {
        addressSpans.push([iam.index, iam.index + iam[0].length]);
      }
    }

    // Regex matching whole numerical tokens with currency, units, decimals, and %
    const rx = /(?:(?:\(\s*(?:(?:Rp\.?|IDR|\$|USD|€|EUR|£|GBP|CHF|SGD)\s*)?\d+(?:[.,]\d+)*(?:\s*(?:k|m|million|billion|juta|jt))?\s*\))|(?:(?:Rp\.?|IDR|\$|USD|€|EUR|£|GBP|CHF|SGD)\s*)?\d+(?:[.,]\d+)*(?:\s*(?:juta|jt|jeti|jetong|miliar|milyar|million|billion|k|rb|ribu|thousand|racks|bands|ember|%(?!\w)|[mb](?!\w)|\s+[mb]\b))?|half\s+a\s+mil\b)/gi;
    const nonFinUnits = /^\s*(?:(?:additional|more|extra|fewer|less)\s+)?(?:months?|years?|days?|hours?|weeks?|quarters?|percentage\s+points?|basis\s+points?|bps|points?|pts?|shares?|tokens?|users?|employees?|engineers?|customers?|plates?|guests?|items?|copies|cells|copies\s*\/\s*m[lL]|cells\s*\/\s*u[lL]|gwei|wei|eth|btc|sol|mmol\s*\/\s*l|mg\s*\/\s*dl|u\s*\/\s*l|gas|saham|lembar)\b/i;
    const tokens = [];
    let m;
    while ((m = rx.exec(text)) !== null) {
      const raw = m[0].trim();
      if (!raw) continue;

      // Skip if inside a telephone number or physical address
      if (phoneSpans.some(([s, e]) => m.index >= s && (m.index + m[0].length) <= e)) {
        continue;
      }
      if (addressSpans.some(([s, e]) => m.index >= s && (m.index + m[0].length) <= e)) {
        continue;
      }

      // Ensure we don't start in the middle of a word or tag or dot or port (e.g. 10.244.0.15, :5432)
      if (m.index > 0 && /[\w.:]/.test(text[m.index - 1])) {
        continue;
      }

      const afterText = text.substring(m.index + m[0].length);
      // Skip if followed by dot and digits (IP address check) or URL path (:5432/db), but allow financial time periods (/month, /year, /bulan)
      if (/^\.\d+/.test(afterText) || (/^\/[a-zA-Z0-9_]/.test(afterText) && !/^\/(?:month|mo|year|yr|bulan|thn|tahun|day|hari|hr|hour|jam|week|minggu)\b/i.test(afterText))) {
        continue;
      }

      // Skip if followed by non-financial technical/lab units
      if (nonFinUnits.test(afterText)) {
        continue;
      }

      // Skip if inside technical container / OS user / network port configs
      const lineStart = Math.max(0, text.lastIndexOf("\n", m.index));
      const beforeInLine = text.substring(lineStart, m.index);
      if (/\b(?:runAsUser|runAsGroup|fsGroup|port|listen_port|containerPort|uid|gid)\s*[:=]\s*$/i.test(beforeInLine)) {
        continue;
      }

      // Skip calendar years (1950-2040) unless explicitly preceded by currency symbols
      if (/^\d{4}$/.test(raw)) {
        const yNum = parseInt(raw, 10);
        if (yNum >= 1950 && yNum <= 2040 && !/(?:Rp|IDR|\$|USD|€|EUR|£|GBP|CHF|SGD)/i.test(raw)) {
          const beforeSnippet = text.substring(Math.max(0, m.index - 40), m.index).toLowerCase();
          const afterSnippet = text.substring(m.index + m[0].length, Math.min(text.length, m.index + m[0].length + 20)).toLowerCase();
          const isExplicitFinancial = /(?:rent|salary|gaji|income|pay|bonus|debt|owe|making|earning|take-home|spending|spent|balance|cost|fee|bill|charge|saving|tabungan)\s+(?:is\s+|of\s+)?$/i.test(beforeSnippet) || /^\s*(?:\/month|\/mo|\/year|\/bulan|per\s+month|per\s+year)/i.test(afterSnippet);
          if (!isExplicitFinancial) {
            continue; // Treat as calendar year, not financial leak
          }
        }
      }

      const cleanLower = raw.toLowerCase();
      const isRatio = cleanLower.endsWith("%");

      let val = 0;
      if (cleanLower.includes("half a mil")) {
        val = 500000;
      } else if (isRatio) {
        val = parseFloat(cleanLower.replace(/[^\d.,]/g, "").replace(",", ".")) / 100;
      } else if (/(?:miliar|billion|\bb\b|ember|b$)/i.test(cleanLower)) {
        val = Math.round(parseFloat(cleanLower.replace(/[^\d.,]/g, "").replace(",", ".")) * 1e9);
      } else if (/(?:crores?)/i.test(cleanLower)) {
        val = Math.round(parseFloat(cleanLower.replace(/[^\d.,]/g, "").replace(",", ".")) * 1e7);
      } else if (/(?:juta|jt|jeti|jetong|million|\bm\b|m$)/i.test(cleanLower)) {
        val = Math.round(parseFloat(cleanLower.replace(/[^\d.,]/g, "").replace(",", ".")) * 1e6);
      } else if (/(?:lakhs?|lpa)/i.test(cleanLower)) {
        val = Math.round(parseFloat(cleanLower.replace(/[^\d.,]/g, "").replace(",", ".")) * 1e5);
      } else if (/(?:k|rb|ribu|thousand|racks|bands|k$)/i.test(cleanLower)) {
        val = Math.round(parseFloat(cleanLower.replace(/[^\d.,]/g, "").replace(",", ".")) * 1e3);
      } else {
        // Strip currency prefix first: "Rp 900.000" used to parse as NaN and slip past the solver.
        const num = cleanLower.replace(/[^\d.,]/g, "");
        if (/^\d{1,3}(?:[.,]\d{3})+$/.test(num)) {
          // Grouped thousands in either locale: 900.000, 10.800.000, 1,500
          val = parseInt(num.replace(/[.,]/g, ""), 10);
        } else if (/[.,]\d{3}[.,]\d{1,2}$/.test(num)) {
          // Mixed separators: the last one is the decimal point (1.234,56 / 1,234.56)
          const i = Math.max(num.lastIndexOf("."), num.lastIndexOf(","));
          val = parseFloat(num.slice(0, i).replace(/[.,]/g, "") + "." + num.slice(i + 1));
        } else {
          val = parseFloat(num.replace(",", ".")) || 0;
        }
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

  solveAndRedact(text, secretValues, disabledLeaks = []) {
    if (!secretValues || secretValues.length === 0) return text;
    const tokens = this.lexNumericSpans(text);
    const ratios = tokens.filter(t => t.isRatio && t.val > 0).map(t => t.val);
    const codeBlocks = this.findCodeBlockSpans(text);
    const leaks = [];

    // 1. Extend secret values with pairwise arithmetic combinations (sums, differences, remainders)
    const extendedSecrets = new Set(secretValues);
    for (let i = 0; i < secretValues.length; i++) {
      for (let j = i + 1; j < secretValues.length; j++) {
        const sA = secretValues[i];
        const sB = secretValues[j];
        if (sA + sB >= 500) extendedSecrets.add(sA + sB);
        if (Math.abs(sA - sB) >= 500) extendedSecrets.add(Math.abs(sA - sB));
      }
    }

    // 2. Depth 2 differences & multi-item deductions (e.g. 6200 - 2400 - 580 = 3220)
    const cur = Array.from(extendedSecrets);
    for (let i = 0; i < cur.length; i++) {
      for (let j = i + 1; j < cur.length; j++) {
        const diff = Math.abs(cur[i] - cur[j]);
        if (diff >= 500 && extendedSecrets.size < 500) {
          extendedSecrets.add(diff);
        }
      }
    }

    // 3. Monthly debt amortization targets
    for (const s of secretValues) {
      if (s >= 5000) {
        for (const r of [0.05, 0.08, 0.10, 0.15, 0.20, 0.249, 0.25, 0.30]) {
          const rm = r / 12;
          const pmt = Math.round(s * (rm / (1 - Math.pow(1 + rm, -12))));
          if (pmt > 500) extendedSecrets.add(pmt);
        }
      }
    }

    // 4. Debt monthly remainder cashflows: e.g. 3220 - 1710 = 1510
    const cur2 = Array.from(extendedSecrets);
    for (let i = 0; i < cur2.length; i++) {
      for (let j = i + 1; j < cur2.length; j++) {
        const diff = Math.abs(cur2[i] - cur2[j]);
        if (diff >= 500 && extendedSecrets.size < 1000) {
          extendedSecrets.add(diff);
        }
      }
    }

    const secretsToTest = Array.from(extendedSecrets);

    for (const secret of secretsToTest) {
      if (secret < 100) continue;

      for (const token of tokens) {
        if (token.isRatio || token.isSmallInt || (token.val < 100 && !/(?:Rp|IDR|\$|USD|€|EUR|£|GBP|CHF|SGD)/i.test(token.raw))) continue;
        if (codeBlocks.some(([s, e]) => token.start >= s && token.start < e)) continue;
        if (this.isSafePublicSpan(text, token.start, token.end)) continue;
        if (disabledLeaks && (disabledLeaks.includes(token.raw) || disabledLeaks.includes(String(token.val)) || disabledLeaks.some(dl => {
          const dlNum = parseFloat(String(dl).replace(/[^\d.]/g, ""));
          return !isNaN(dlNum) && Math.abs(token.val - dlNum) <= 0.01;
        }))) continue;

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
          const allRatios = [...ratios, ...ratios.map(x => 1 - x).filter(x => x > 0 && x < 1)];
          for (const r of allRatios) {
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

        // 6. Pairwise Additive / System of Equations Inversion (e.g. (A + B)/2 = secret or A - B = secret)
        if (!isLeak && tokens.length >= 2) {
          for (const other of tokens) {
            if (other === token) continue;
            if (this.isSafePublicSpan(text, other.start, other.end)) continue;
            const sum = token.val + other.val;
            const diff = Math.abs(token.val - other.val);
            if (
              Math.abs(sum / 2 - secret) / secret <= this.tolerance ||
              Math.abs(diff / 2 - secret) / secret <= this.tolerance ||
              Math.abs(sum - secret) / secret <= this.tolerance ||
              Math.abs(diff - secret) / secret <= this.tolerance
            ) {
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
          // 1. Direct equality with user base secrets takes precedence over derived labels!
          if (secretValues.some(sv => Math.abs(token.val - sv) / sv <= this.tolerance)) {
            tag = "[REDACTED_FINANCIAL_1]";
          } else if (/\b(?:year|years|tahun|timeline|akumulasi)\b/i.test(line)) {
            tag = "[REDACTED_SAVINGS_ACCUMULATION]";
          } else if (/\b(?:kenaikan|increment|delta|tambahan|raise)\b/i.test(line)) {
            tag = "[REDACTED_SALARY_INCREMENT]";
          } else if (/\b(?:naik|proyeksi|projected|menjadi|target)\b/i.test(line)) {
            tag = "[REDACTED_PROJECTED_SALARY]";
          } else if (/\b(?:sisa|remainder|cicilan|cashflow|kpr|debt|payoff|discretionary|available)\b/i.test(line)) {
            tag = "[REDACTED_REMAINDER_CASHFLOW]";
          } else if (/\b(?:pro-forma|runway|pre-money|burn|budget|anggaran|alokasi|car|cars|food|transport|saving|savings|tabungan|rent|groceries)\b/i.test(line)) {
            tag = "[REDACTED_BUDGET_ALLOCATION]";
          }

          leaks.push({
            start: token.start,
            end: token.end,
            raw: token.raw,
            val: token.val,
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

  setEntityMap(map) {
    this.entityMap = new Map(map || []);
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
    if (/(?:miliar|milyar|billion|\bb\b|ember|b$)/i.test(clean)) {
      const numPart = clean.replace(/[^\d.,]/g, "").replace(/,/g, ".");
      const val = parseFloat(numPart);
      if (!isNaN(val)) return Math.round(val * 1e9);
    }

    // Crores (crore, crores)
    if (/(?:crores?)/i.test(clean)) {
      const numPart = clean.replace(/[^\d.,]/g, "").replace(/,/g, ".");
      const val = parseFloat(numPart);
      if (!isNaN(val)) return Math.round(val * 1e7);
    }

    // Millions (juta, jt, jeti, jetong, million, m)
    if (/(?:juta|jt|jeti|jetong|million|\bm\b|m$)/i.test(clean)) {
      const numPart = clean.replace(/[^\d.,]/g, "").replace(/,/g, ".");
      const val = parseFloat(numPart);
      if (!isNaN(val)) return Math.round(val * 1e6);
    }

    // Lakhs / LPA (lakh, lakhs, lpa)
    if (/(?:lakhs?|lpa)/i.test(clean)) {
      const numPart = clean.replace(/[^\d.,]/g, "").replace(/,/g, ".");
      const val = parseFloat(numPart);
      if (!isNaN(val)) return Math.round(val * 1e5);
    }

    // Thousands (k, rb, ribu, thousand, racks, bands)
    if (/(?:k|rb|ribu|thousand|racks|bands|k$)/i.test(clean)) {
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
        pseudonym = `[User_${letterLabel(this.counters.USER++)}]`;
        break;
      default:
        // Other categories (e.g. LOCATION from an external detector) get their own numbered label
        this.counters[category] = this.counters[category] || 1;
        pseudonym = `[${category}_${this.counters[category]++}]`;
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
    // Whole-token match: a short value like "pa" must not be replaced inside "spatial".
    // Amounts keep the plain form so "Rp3.000.000" still matches "3.000.000".
    variants.push(category === "SENSITIVE_FINANCIAL" ? escapedRaw : `(?<!\\w)${escapedRaw}(?!\\w)`);

    if (category === "SENSITIVE_FINANCIAL") {
      variants.push(`\\b${escapedRaw}\\b`);

      // Card number formats with spaces, hyphens, or no separators
      const cardDigits = raw.replace(/\D/g, "");
      if (cardDigits.length >= 15 && cardDigits.length <= 19) {
        variants.push(`\\b${cardDigits}\\b`);
        variants.push(`\\b${cardDigits.replace(/(\d{4})/g, "$1 ").trim()}\\b`);
        variants.push(`\\b${cardDigits.replace(/(\d{4})/g, "$1-").slice(0, -1)}\\b`);
      }

      // Bank account / loan prefix code variants (e.g. WF-990218374, SOFI-99821174)
      const pfxMatch = raw.match(/^([A-Za-z]{2,6})[-_ ]?(\d{6,14})$/);
      if (pfxMatch) {
        const pfx = pfxMatch[1];
        const numPart = pfxMatch[2];
        variants.push(`\\b${pfx}[-_ ]?${numPart}\\b`);
        variants.push(`\\b${numPart}\\b`);
      }

      // Card expiration date variants (e.g. "exp 08/27" -> also match raw "08/27")
      const expDateMatch = raw.match(/\b((?:0[1-9]|1[0-2])[\/-](?:20)?\d{2})\b/);
      if (expDateMatch) {
        variants.push(`\\b${expDateMatch[1]}\\b`);
      }

      // Card last 4 digits variants (e.g. "ends in 4417" -> also match "ending in 4417", "ends in 4417")
      const last4Match = raw.match(/\b(?:(?:card|debit|credit|account)\s+)?(?:ends|ending)\s+in\s+([0-9]{4})\b/i);
      if (last4Match) {
        variants.push(`\\bending\\s+in\\s+${last4Match[1]}\\b`);
        variants.push(`\\bends\\s+in\\s+${last4Match[1]}\\b`);
      }

      const num = this.parseFinancialValue(raw);
      if (num && !isNaN(num) && num >= 1000) {
        const idFormatted = num.toLocaleString("id-ID").replace(/\./g, "\\.");
        const enFormatted = num.toLocaleString("en-US").replace(/,/g, ",");

        // 1. Currency prefix + formatted number or plain number
        variants.push(`(?<![\\w.,$€£¥])(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${idFormatted}(?![\\w.,])`);
        variants.push(`(?<![\\w.,$€£¥])(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${enFormatted}(?![\\w.,])`);
        variants.push(`(?<![\\w.,])${num}(?![\\w.,])`);

        // 1b. Thousands abbreviations (e.g. 145k, 340k, 18k, 25k, $340K)
        if (num >= 1e3 && num < 1e9) {
          const thousands = num / 1e3;
          if (thousands === Math.floor(thousands) || thousands.toFixed(1).endsWith(".5")) {
            const kth = thousands.toString().replace(".", "\\.");
            variants.push(`(?<![\\w.,$€£¥])(?:(?:Rp\\.?|IDR|\\$|USD|€|EUR|£|GBP|CHF|SGD)\\s*)?${kth}\\s*(?:k|rb|ribu|thousand)(?![\\w.,])`);
          }
        }

        // 2. Millions abbreviations (e.g. 28,5 juta, 28.5 jt, 28,5 jt, $1.5M, $18M)
        if (num >= 1e5) {
          const millions = num / 1e6;
          const milDot = millions.toString().replace(".", "\\.");
          const milComma = millions.toString().replace(".", ",");
          variants.push(`(?<![\\w.,$€£¥])(?:(?:Rp\\.?|IDR|\\$|USD|€|EUR|£|GBP|CHF|SGD)\\s*)?(?:${milDot}|${milComma})\\s*(?:juta|jt|jeti|million|m)(?![\\w.,])`);
          
          if (millions === Math.floor(millions)) {
            variants.push(`(?<![\\w.,$€£¥])(?:(?:Rp\\.?|IDR|\\$|USD|€|EUR|£|GBP|CHF|SGD)\\s*)?${Math.floor(millions)}\\s*(?:juta|jt|jeti|million|m)(?![\\w.,])`);
          }

          // 3. Annualized derivations ONLY if raw explicitly indicated monthly frequency
          const isMonthlyEntity = /(?:month|mo|bulan|per\s+month|\/mo|\/month|\/bulan|sebulan|monthly)/i.test(raw);
          if (isMonthlyEntity) {
            const annual = num * 12;
            const annualM = annual / 1e6;
            const annDot = annualM.toString().replace(".", "\\.");
            const annComma = annualM.toString().replace(".", ",");
            variants.push(`(?<![\\w.,$€£¥])(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${annDot}|${annComma})\\s*(?:juta|jt|million|m)(?:\\s*\\/\\s*tahun|\\s*per\\s*tahun)?(?![\\w.,])`);
            variants.push(`(?<![\\w.,$€£¥])(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${annual.toLocaleString("id-ID").replace(/\./g, "\\.")}(?![\\w.,])`);
          }
        }
      }
    } else if (category === "SENSITIVE_HEALTH") {
      const drugEquivalents = {
        "lexapro": ["escitalopram", "cipralex"],
        "escitalopram": ["lexapro", "cipralex"],
        "cipralex": ["escitalopram", "lexapro"],
        "zoloft": ["sertraline"],
        "sertraline": ["zoloft"],
        "wellbutrin": ["bupropion", "zyban"],
        "bupropion": ["wellbutrin", "zyban"],
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

      // Add base drug brand/name variants without dosage (e.g. "150mg Wellbutrin XL" -> "Wellbutrin XL", "Wellbutrin")
      const strippedDose = raw.replace(/\b\d+\s*(?:mg|iu|mcg|ml)\b/gi, "").trim();
      if (strippedDose.length >= 3) {
        variants.push(`\\b(?:obat\\s+)?${strippedDose.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+\\d+\\s*(?:mg|iu|mcg|ml))?\\b`);
        // If it's a multi-token brand with formulation suffix (XL, XR, SR, CR, IR), also match root brand
        if (/(?:XL|XR|SR|CR|IR)\b/i.test(strippedDose)) {
          const firstToken = strippedDose.split(/\s+/)[0];
          if (firstToken.length >= 4 && !/^(?:tablet|capsule|liquid|oral|daily|twice)$/i.test(firstToken)) {
            variants.push(`\\b(?:obat\\s+)?${firstToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(?:XL|XR|SR|CR|IR))?(?:\\s+\\d+\\s*(?:mg|iu|mcg|ml))?\\b`);
          }
        }
      }

      // Add all recognized generic/brand synonyms
      for (let syn of synonyms) {
        const escapedSyn = syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        variants.push(`\\b(?:obat\\s+)?${escapedSyn}(?:\\s+\\d+\\s*mg)?\\b`);
      }
    } else if (category === "SENSITIVE_CORP") {
      const match = raw.match(/Project\s+([A-Z][a-z0-9]+)/i);
      if (match) {
        variants.push(`\\bProject\\s+${match[1]}\\b`);
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

      // 3. Individual name tokens (>= 3 chars, never a common word: one bad name must not
      //    turn every "that" in the chat into a placeholder)
      for (let w of words) {
        if (w.length >= 3 && !COMMON_WORDS.has(w.toLowerCase())) {
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
   * @param {Array<{type: string, raw: string, replacement: string}>} heuristicDetections
   */
  anonymizeConversation(turns, detectedEntities, heuristicDetections = [], options = {}) {
    if (options.masterEntityMap) {
      this.entityMap = new Map(options.masterEntityMap);
    }
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
      if (turn.role === "user" && !options.keepNames) {
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
            const isLooseForm = /^(?:i\s*[\x27\x60]?\s*(?:am|m)|call\s+me)/i.test(nm[0]);
            const lineStart = turn.content.lastIndexOf("\n", nm.index) + 1;
            const lineEnd = turn.content.indexOf("\n", nm.index);
            const line = turn.content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
            if (!looksLikeName(nameTokens, { requireCapital: isLooseForm })) {
              // skip: code, prose fragments ("one that would carry") or type names
            } else if (/[:=\-]\s*$/.test(nm[0]) && /[{}()\[\];<>"'`]|\b(?:val|var|let|const|def|fn|func|public|private)\b/.test(line)) {
              // skip: "name: String" style key-value inside code
            } else {
              userIntroMatches.push({
                turnIndex: idx,
                raw: nameTokens.join(" "),
                category: "USER"
              });
            }
          }
        }

        // Markdown table row extraction (e.g. | Employee | ... \n | Alexander Pierce | ...)
        const tableLines = turn.content.split("\n");
        let employeeColIdx = -1;
        for (let lIdx = 0; lIdx < tableLines.length; lIdx++) {
          const line = tableLines[lIdx].trim();
          if (line.startsWith("|") && line.endsWith("|")) {
            const cells = line.split("|").slice(1, -1).map(c => c.trim());
            if (employeeColIdx === -1) {
              const foundIdx = cells.findIndex(c => /^(?:Employee|Name|User|Karyawan|Nama|Person)$/i.test(c));
              if (foundIdx !== -1) employeeColIdx = foundIdx;
            } else if (!line.includes("---") && cells[employeeColIdx]) {
              const cellVal = cells[employeeColIdx].trim();
              if (cellVal && cellVal.split(/\s+/).length <= 4 && looksLikeName(cellVal.split(/\s+/))) {
                userIntroMatches.push({
                  turnIndex: idx,
                  raw: cellVal,
                  category: "USER"
                });
              }
            }
          }
        }

        // Legal & HR report party: e.g. "harassment from Vice President Robert Vance at Vance Refrigeration"
        const legalPartyRx = /(?:from|against)\s+(?:(?:Vice\s+President|President|Director|Manager|Lead)\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+at\s+([A-Z][a-zA-Z0-9_-]+(?:\s+[A-Z][a-zA-Z0-9_-]+)*)/g;
        let lp;
        while ((lp = legalPartyRx.exec(turn.content)) !== null) {
          userIntroMatches.push({
            turnIndex: idx,
            raw: lp[1].trim(),
            category: "USER"
          });
          userIntroMatches.push({
            turnIndex: idx,
            raw: lp[2].trim(),
            category: "CORP"
          });
        }

        // Email sign-off / closing signature detection:
        // e.g. "Best regards,\nDr. Jonathan Vance\nHead of Research"
        const signOffRx = /(?:(?:Best\s+regards|Warm\s+regards|Kind\s+regards|Sincerely|Regards|Thanks\s+(?:and\s+regards)?|Warmly|Cheers|Respectfully|Yours\s+truly|Salam),?\s*[\r\n]+)(?:(?:Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)[ \t]+)?([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)+)/gi;
        let so;
        while ((so = signOffRx.exec(turn.content)) !== null) {
          const sigName = so[1].trim();
          if (sigName && !nameStopWords.has(sigName.toLowerCase()) && sigName.split(/\s+/).length <= 4) {
            userIntroMatches.push({
              turnIndex: idx,
              raw: sigName,
              category: "USER"
            });
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
    const uniqueFinancialVals = Array.from(new Set(financialNums.map(e => e.val))).sort((a, b) => b - a);

    if (uniqueFinancialVals.length >= 2) {
      const valA = uniqueFinancialVals[0]; // Primary/highest financial value e.g. 28.5M
      const valB = uniqueFinancialVals[1]; // Secondary financial value e.g. 14.2M
      const diff = valA - valB;

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
      if (valA > 0) {
        const ratioNum = (valB / valA) * 100;
        if (ratioNum >= 15 && ratioNum <= 95) {
          const ratio = ratioNum.toFixed(1);
          const ratioDot = ratio.replace(".", "\\.");
          const ratioComma = ratio.replace(".", ",");
          derivedPatterns.push({
            pattern: `\\b(?:${ratioDot}|${ratioComma})\\s*%(?!\\w)`,
            replacement: "[REDACTED_DEBT_RATIO]"
          });
        }
      }
    }

    // Neutralize Percentage Projection Clusters & Compound Residuals
    const percentages = [5, 10, 12, 15, 20, 25, 30, 35, 40, 50];
    const fullConvText = updatedTurns.map(t => t.content || "").join(" ").toLowerCase();
    const hasSalaryContext = /\b(?:salary|gaji|upah|penghasilan|pay|compensation|thp)\b/i.test(fullConvText);
    const projectionTag = hasSalaryContext ? "[REDACTED_PROJECTED_SALARY]" : "[REDACTED_BUDGET_ALLOCATION]";

    for (const val of uniqueFinancialVals) {
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
            replacement: projectionTag
          });
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${candTotal.toLocaleString("en-US").replace(/,/g, ",")})\\b`,
            replacement: projectionTag
          });

          // 2. Abbreviated millions total (e.g. 33 juta, 33 jt)
          const candM = candTotal / 1e6;
          const totDot = candM.toString().replace(".", "\\.");
          const totComma = candM.toString().replace(".", ",");
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${totDot}|${totComma})\\s*(?:juta|jt|million|m))\\b`,
            replacement: projectionTag
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
        if (uniqueFinancialVals.length >= 2) {
          const debtVal = uniqueFinancialVals.find(v => v < val);
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
              replacement: projectionTag
            });
            const mM = midVal / 1e6;
            derivedPatterns.push({
              pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${mM.toString().replace(".", "\\.")}|${mM.toString().replace(".", ",")})\\s*(?:juta|jt|million|m))\\b`,
              replacement: projectionTag
            });
          }
        }
      }
    }

    // 1. Build replacement clusters for all target entities (Highest Priority)
    const baseRules = [];
    for (const ent of allTargets) {
      const pseudo = this.getPseudonym(ent.raw, ent.category);
      const variants = this.buildEquivalenceVariants(ent.raw, ent.category, allTargets);

      for (const v of variants) {
        baseRules.push({
          regexStr: v,
          replacement: pseudo,
          length: v.length,
          isDerived: false
        });
      }
    }
    baseRules.sort((a, b) => b.length - a.length);

    // 2. Add cross-turn sweep rules from Tier 1 Heuristic Detections
    const heuristicRules = [];
    for (const hd of heuristicDetections) {
      if (hd && hd.raw) {
        const hEsc = hd.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        heuristicRules.push({
          regexStr: `\\b${hEsc}\\b`,
          replacement: hd.replacement,
          length: hd.raw.length,
          isDerived: false
        });

        const token = hd.secretToken || hd.raw;

        // Special handling for physical addresses (sweep pure street address string across assistant turns)
        if (hd.type === "ENGLISH_PHYSICAL_ADDRESS" || hd.type === "ADDRESS_ID") {
          if (token && token.length >= 6) {
            const aEsc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            heuristicRules.push({
              regexStr: `\\b${aEsc}\\b`,
              replacement: "[REDACTED_ADDRESS]",
              length: token.length,
              isDerived: false
            });
          }
        }

        // Special handling for card expiration dates (e.g. "exp 08/27" -> also sweep raw date "08/27")
        if (hd.type === "CARD_EXPIRY_DATE") {
          const m = token.match(/((?:0[1-9]|1[0-2])[\/-](?:20)?\d{2})/);
          if (m) {
            heuristicRules.push({
              regexStr: `\\b${m[1]}\\b`,
              replacement: "[REDACTED_CARD_EXPIRY]",
              length: m[1].length,
              isDerived: false
            });
          }
        }

        // Special handling for card security codes (e.g. "CVV 339" -> also sweep raw code "339")
        if (hd.type === "CARD_SECURITY_CODE") {
          const cleanDigits = (token || "").replace(/\D/g, "");
          if (cleanDigits.length >= 3 && cleanDigits.length <= 4) {
            heuristicRules.push({
              regexStr: `\\b${cleanDigits}\\b`,
              replacement: "[REDACTED_CVV]",
              length: cleanDigits.length,
              isDerived: false
            });
            const spacedDigits = cleanDigits.split("").join("\\s+");
            heuristicRules.push({
              regexStr: `\\b${spacedDigits}\\b`,
              replacement: "[REDACTED_CVV]",
              length: spacedDigits.length,
              isDerived: false
            });
          }
        }

        // Special handling for international identity numbers and life PII (sweep raw normalized token)
        if ([
          "UK_NINO", "CA_SIN", "IN_AADHAAR", "IN_PAN", "SG_NRIC",
          "BR_CPF", "ES_DNI", "IT_CODICE_FISCALE", "UK_SORT_CODE",
          "IN_IFSC", "AU_BSB", "UK_NHS", "US_MRN", "GITHUB_FINE_GRAINED", "TELEGRAM_BOT_TOKEN",
          "ID_DOB", "ID_MOTHER_MAIDEN", "ID_PLATE_RI", "US_PLATE", "VEHICLE_VIN", "DEVICE_IMEI",
          "NETWORK_IPV6", "HARDWARE_MAC", "GPS_COORDINATES", "CN_CITIZEN_ID", "KR_RRN",
          "JP_MY_NUMBER", "AU_TFN", "AU_MEDICARE", "MX_CURP", "MX_RFC"
        ].includes(hd.type)) {
          if (token && token.length >= 3) {
            const rawClean = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            heuristicRules.push({
              regexStr: `\\b${rawClean}\\b`,
              replacement: hd.replacement,
              length: token.length,
              isDerived: false
            });
            // If token contains hyphens, spaces, colons, or dots, also sweep unformatted variant
            const unspaced = token.replace(/[\s\-_.:]/g, "");
            if (unspaced.length >= 5 && unspaced !== token) {
              heuristicRules.push({
                regexStr: `\\b${unspaced}\\b`,
                replacement: hd.replacement,
                length: unspaced.length,
                isDerived: false
              });
            }
          }
        }

        // Special handling for credit/debit card numbers (sweep raw digits, spaced, and dashed)
        if (hd.type === "CREDIT_CARD") {
          const cardDigits = token.replace(/\D/g, "");
          if (cardDigits.length >= 13 && cardDigits.length <= 19) {
            heuristicRules.push({ regexStr: `\\b${cardDigits}\\b`, replacement: "[REDACTED_CARD_NUMBER]", length: cardDigits.length, isDerived: false });
            const spaced = cardDigits.replace(/(\d{4})/g, "$1 ").trim();
            const dashed = cardDigits.replace(/(\d{4})/g, "$1-").replace(/-$/, "");
            heuristicRules.push({ regexStr: `\\b${spaced.replace(/\s+/g, "\\s+")}\\b`, replacement: "[REDACTED_CARD_NUMBER]", length: spaced.length, isDerived: false });
            heuristicRules.push({ regexStr: `\\b${dashed}\\b`, replacement: "[REDACTED_CARD_NUMBER]", length: dashed.length, isDerived: false });
            // Amex 4-6-5 format
            if (cardDigits.length === 15) {
              const amexDashed = `${cardDigits.slice(0, 4)}-${cardDigits.slice(4, 10)}-${cardDigits.slice(10)}`;
              const amexSpaced = `${cardDigits.slice(0, 4)} ${cardDigits.slice(4, 10)} ${cardDigits.slice(10)}`;
              heuristicRules.push({ regexStr: `\\b${amexDashed}\\b`, replacement: "[REDACTED_CARD_NUMBER]", length: amexDashed.length, isDerived: false });
              heuristicRules.push({ regexStr: `\\b${amexSpaced.replace(/\s+/g, "\\s+")}\\b`, replacement: "[REDACTED_CARD_NUMBER]", length: amexSpaced.length, isDerived: false });
            }
          }
        }

        // Special handling for bank accounts, loan prefix IDs, and universal record identifiers
        if (hd.type === "PREFIXED_BANK_LOAN_ID" || hd.type === "UNIVERSAL_RECORD_IDENTIFIER") {
          const idVal = token;
          if (idVal && idVal.length >= 4) {
            const idEsc = idVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            heuristicRules.push({ regexStr: `\\b${idEsc}\\b`, replacement: "[REDACTED_RECORD_ID]", length: idVal.length, isDerived: false });

            const pfxMatch = idVal.match(/^([A-Za-z]{2,6})[-_ ]?(\d{6,14})$/);
            if (pfxMatch) {
              heuristicRules.push({ regexStr: `\\b${pfxMatch[1]}[-_ ]?${pfxMatch[2]}\\b`, replacement: "[REDACTED_RECORD_ID]", length: idVal.length, isDerived: false });
              heuristicRules.push({ regexStr: `\\b${pfxMatch[2]}\\b`, replacement: "[REDACTED_RECORD_ID]", length: pfxMatch[2].length, isDerived: false });
            }
          }
        }
      }
    }
    heuristicRules.sort((a, b) => b.length - a.length);

    // 3. Add derived arithmetic patterns (Lowest priority, applies only to non-base calculations in assistant turns)
    const derivedRules = [];
    for (const dp of derivedPatterns) {
      derivedRules.push({
        regexStr: dp.pattern,
        replacement: dp.replacement,
        length: dp.pattern.length,
        isDerived: true
      });
    }
    derivedRules.sort((a, b) => b.length - a.length);

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
      const bracketContent = text.substring(lastOpen, nextClose + 1);
      return /^\[(?:REDACTED|CONFIDENTIAL|INTERNAL|HR|User|ANONYMIZED)_[A-Z0-9_]+\]$/.test(bracketContent);
    };

    const solverHelper = new AdversaryOracleSolver();
    const allDerivedLeaks = [];

    // Step A: Apply Base Rules (Immutable Primary User Secrets)
    for (const rule of baseRules) {
      const reg = new RegExp(rule.regexStr, "gi");
      for (let turn of updatedTurns) {
        if (turn.content) {
          turn.content = turn.content.replace(reg, (match, ...args) => {
            const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];
            if (isInsideBracket(turn.content, offset, match.length)) {
              return match;
            }
            return rule.replacement;
          });
        }
      }
    }

    // Step B: Apply Heuristic Cross-Turn Sweep Rules
    for (const rule of heuristicRules) {
      const reg = new RegExp(rule.regexStr, "gi");
      for (let turn of updatedTurns) {
        if (turn.content) {
          turn.content = turn.content.replace(reg, (match, ...args) => {
            const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];
            if (isInsideBracket(turn.content, offset, match.length)) {
              return match;
            }
            return rule.replacement;
          });
        }
      }
    }

    // Step C: Apply Derived Calculations (Never Overwrites Bracketed Base Secrets)
    for (const rule of derivedRules) {
      const reg = new RegExp(rule.regexStr, "gi");
      for (let turn of updatedTurns) {
        if (turn.content) {
          turn.content = turn.content.replace(reg, (match, ...args) => {
            const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];
            if (isInsideBracket(turn.content, offset, match.length)) {
              return match;
            }
            if (solverHelper.isSafePublicSpan(turn.content, offset, offset + match.length)) {
              return match; // Safe public benchmark line, preserve!
            }
            const cleanMatch = match.trim();
            if (options.disabledLeaks && options.disabledLeaks.some(dl => dl && (cleanMatch.toLowerCase() === dl.toLowerCase() || dl.toLowerCase().includes(cleanMatch.toLowerCase())))) {
              return match;
            }
            allDerivedLeaks.push({
              raw: cleanMatch,
              replacement: rule.replacement,
              category: "FINANCIAL",
              isDerived: true,
              isAlgebraic: true
            });
            return rule.replacement;
          });
        }
      }
    }

    // Syntactic Arrow Sweeper: e.g. "[REDACTED_FINANCIAL_1] → Rp32,775 jt"
    const arrowRx = /(\[REDACTED_FINANCIAL_\d+\]\s*(?:→|->|menjadi|naik menjadi)\s*)((?:Rp\s*|IDR\s*|\$\s*)?[\d.,]+(?:\s*(?:jt|juta|k|million))?)/gi;
    for (let turn of updatedTurns) {
      if (turn.content) {
        turn.content = turn.content.replace(arrowRx, (fullMatch, p1, rawNum) => {
          const cleanNum = rawNum.trim();
          if (options.disabledLeaks && options.disabledLeaks.some(dl => dl && (cleanNum.toLowerCase() === dl.toLowerCase() || dl.toLowerCase().includes(cleanNum.toLowerCase())))) {
            return fullMatch;
          }
          allDerivedLeaks.push({
            raw: cleanNum,
            replacement: "[REDACTED_PROJECTED_SALARY]",
            category: "FINANCIAL",
            isDerived: true,
            isAlgebraic: true
          });
          return `${p1}[REDACTED_PROJECTED_SALARY]`;
        });
      }
    }

    // Syntactic Increment Sweeper: e.g. "Kenaikan hanya:\nRp4,275 jt/bulan"
    const incRx = /(Kenaikan(?:\s+hanya|\s+sebesar)?\s*:\s*)((?:Rp\s*|IDR\s*|\$\s*)?[\d.,]+(?:\s*(?:jt|juta|k|million))?(?:\s*(?:per bulan|\/bulan))?)/gi;
    for (let turn of updatedTurns) {
      if (turn.content) {
        turn.content = turn.content.replace(incRx, (fullMatch, p1, rawNum) => {
          const cleanNum = rawNum.trim();
          if (options.disabledLeaks && options.disabledLeaks.some(dl => dl && (cleanNum.toLowerCase() === dl.toLowerCase() || dl.toLowerCase().includes(cleanNum.toLowerCase())))) {
            return fullMatch;
          }
          allDerivedLeaks.push({
            raw: cleanNum,
            replacement: "[REDACTED_SALARY_INCREMENT]",
            category: "FINANCIAL",
            isDerived: true,
            isAlgebraic: true
          });
          return `${p1}[REDACTED_SALARY_INCREMENT]`;
        });
      }
    }

    // Phase 3: Adversary-Oracle Reconstruction Solver
    // Evaluates all visible numbers against known secret values and suppresses derived leaks
    const disabledFinancialVals = (options.disabledFinancialVals || []);
    const financialSecrets = financialNums
      .map(f => f.val)
      .filter(v => !disabledFinancialVals.some(dv => Math.abs(v - dv) / v <= 0.01));
    const allSolverLeaks = [];
    if (financialSecrets.length > 0) {
      const solver = new AdversaryOracleSolver();
      for (let turn of updatedTurns) {
        if (turn.content && turn.role === "assistant") {
          turn.content = solver.solveAndRedact(turn.content, financialSecrets, options.disabledLeaks || []);
          if (solver.lastLeaks && solver.lastLeaks.length > 0) {
            allSolverLeaks.push(...solver.lastLeaks);
          }
        }
      }
    }

    // Deduplicate combined leaks by raw string and replacement tag
    const seenLeakRaws = new Set();
    const combinedLeaks = [];
    for (const lk of [...allSolverLeaks, ...allDerivedLeaks]) {
      if (lk && lk.raw) {
        const k = `${lk.raw.toLowerCase()}::${lk.replacement}`;
        if (!seenLeakRaws.has(k)) {
          seenLeakRaws.add(k);
          combinedLeaks.push(lk);
        }
      }
    }

    return {
      anonymizedTurns: updatedTurns,
      mappings: Array.from(this.entityMap.entries()).map(([k, v]) => {
        const [cat, raw] = k.split("::");
        return { category: cat, original: raw, pseudonym: v };
      }),
      solverLeaks: combinedLeaks
    };
  }
}

ConsistentPseudonymizer.AdversaryOracleSolver = AdversaryOracleSolver;
ConsistentPseudonymizer.looksLikeName = looksLikeName;

if (typeof module !== "undefined" && module.exports) {
  module.exports = ConsistentPseudonymizer;
  module.exports.AdversaryOracleSolver = AdversaryOracleSolver;
}
