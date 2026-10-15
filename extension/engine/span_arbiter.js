/**
 * SafeShare-AI — Priority Span Arbiter
 *
 * Parallel Character-Offset Interval Arbiter for Non-Destructive Dual-Gate Defense.
 * Resolves Priority Spans:
 *   Tier 0 (Protected / Veto): Developer tokens, code blocks, CVE, RFC, DNS, IP/CIDR, SQL
 *   Tier 1 (Deterministic PII): Luhn CC, SSN, NINO, SIN, NRIC, IBAN, Email, E.164 Phone
 *   Tier 2 (Open-Domain NER): MiniLM Q4 Transformer (Names, Streets, Cities)
 *
 * Standard: Black Hat Asia 2027 & USENIX Security
 */

class PrioritySpanArbiter {
  constructor(options = {}) {
    this.thresholds = Object.assign(
      {
        GIVEN_NAME: 0.35,
        SURNAME: 0.35,
        STREET_NAME: 0.30,
        BUILDING_NUMBER: 0.35,
        SECONDARY_ADDRESS: 0.30,
        CITY: 0.40,
        STATE: 0.45,
        ZIP_CODE: 0.40,
        DEFAULT: 0.40
      },
      options.thresholds || {}
    );

    this.technicalDensityCutoff = options.technicalDensityCutoff || 0.60;
  }

  /**
   * Fast-path lexer: computes technical token density of text or block.
   * Compares ratio of code syntax tokens, keywords, symbols, and camelCase to total tokens.
   * If > cutoff (default 0.50), caller can bypass Tier 2 NER entirely (0 ms, 0% FP on code).
   */
  computeTechnicalDensity(text) {
    if (!text || typeof text !== "string") return 0;
    const tokens = text.trim().split(/\s+/);
    if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === "")) return 0;

    const codePunctRx = /[{}()\[\];<>=+\-*\/\\|&^%$#@!~`'":]/;
    const codeKeywordRx = /^(?:function|const|let|var|return|class|import|export|from|def|fn|func|public|private|static|async|await|select|insert|update|delete|where|from|table|null|true|false|undefined|throw|catch|try|if|else|elif|while|for|break|continue)$/i;
    const camelOrSnakeRx = /^[a-z]+[A-Z0-9][a-zA-Z0-9]*$|^[a-z0-9]+_[a-z0-9_]+$/;

    let codeTokenCount = 0;
    for (const tok of tokens) {
      if (
        codePunctRx.test(tok) ||
        codeKeywordRx.test(tok) ||
        camelOrSnakeRx.test(tok) ||
        /\b(?:0x[0-9a-fA-F]+|\d+\.\d+\.\d+)\b/.test(tok)
      ) {
        codeTokenCount++;
      }
    }

    return codeTokenCount / tokens.length;
  }

  /**
   * Identifies Tier 0 Protected Technical Spans that must NEVER be redacted by NER.
   * Return: Array of { start, end, label, raw }
   */
  extractProtectedSpans(text) {
    if (!text) return [];
    const protectedSpans = [];

    const patterns = [
      // 1. Fenced Code Blocks & Inline Code
      { label: "CODE_FENCE", regex: /```[a-zA-Z0-9_-]*[\s\S]*?```/g },
      { label: "INLINE_CODE", regex: /`[^`\n\r]+`/g },

      // 2. Public DNS resolvers (Cloudflare, Google, Quad9)
      { label: "PUBLIC_DNS", regex: /\b(?:1\.1\.1\.1|1\.0\.0\.1|8\.8\.8\.8|8\.8\.4\.4|9\.9\.9\.9|149\.112\.112\.112)\b/g },

      // 3. CIDR Subnet Masks & Internal Ranges
      { label: "CIDR_MASK", regex: /\b(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}\/(?:[0-9]|[12][0-9]|3[0-2])\b/g },

      // 4. Security Advisories, RFC Standards & Versioning
      { label: "SEC_ADVISORY", regex: /\b(?:CVE|GHSA|OSV)-\d{4}-\d{4,8}\b/gi },
      { label: "RFC_STANDARD", regex: /\bRFC-?\d{3,5}\b/gi },
      { label: "SEM_VER", regex: /\bv?\d+\.\d+\.\d+(?:-[a-zA-Z0-9_.]+)?\b/g },

      // 5. Model Names, Benchmarks, Git Hashes, Hex Offsets
      { label: "MODEL_TAG", regex: /\b(?:claude|gpt|gemini|llama|mistral|bert|distilbert)-[a-zA-Z0-9._-]+\b/gi },
      { label: "GIT_HASH", regex: /\b[0-9a-f]{7,40}\b/g },
      { label: "HEX_ADDR", regex: /\b0x[0-9a-fA-F]{4,16}\b/g },

      // 6. SQL Query Keywords & Database Syntax
      { label: "SQL_SYNTAX", regex: /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE|GROUP\s+BY|ORDER\s+BY|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN)\b/gi },

      // 7. CLI Command Flags & Shell Arguments
      { label: "CLI_FLAG", regex: /(?<=\s|^)(?:--[a-zA-Z0-9_-]{2,30}|-[a-zA-Z0-9])(?=[\s=]|$)/g },

      // 8. File Paths (Unix & Windows)
      { label: "FILE_PATH", regex: /(?:(?:\/[a-zA-Z0-9._-]+){2,}|\b[A-Z]:\\[a-zA-Z0-9._\-\\]+)/g }
    ];

    for (const pat of patterns) {
      const rx = new RegExp(pat.regex.source, pat.regex.flags);
      let m;
      while ((m = rx.exec(text)) !== null) {
        protectedSpans.push({
          start: m.index,
          end: m.index + m[0].length,
          label: pat.label,
          raw: m[0]
        });
      }
    }

    return protectedSpans;
  }

  /**
   * Main Arbitrator: Resolves overlapping intervals using Priority Rules.
   *
   * @param {Object} params
   * @param {string} params.text - Original unmodified string
   * @param {Array} params.tier0Allow - Protected technical spans (VETO)
   * @param {Array} params.tier1Det - Validated deterministic PII spans (Confidence 1.0)
   * @param {Array} params.tier2Ner - Open-domain NER candidates { start, end, label, score, raw }
   * @returns {Object} { resolvedSpans, vetoedSpans, technicalDensity }
   */
  arbitrate({ text, tier0Allow = [], tier1Det = [], tier2Ner = [] }) {
    const density = this.computeTechnicalDensity(text);

    // Auto-detect tier0 if not passed
    const allowSpans = tier0Allow.length > 0 ? tier0Allow : this.extractProtectedSpans(text);

    // Helper: checks if span [s1, e1) overlaps with [s2, e2)
    const overlaps = (s1, e1, s2, e2) => Math.max(s1, s2) < Math.min(e1, e2);

    const vetoedSpans = [];
    const vettedTier2 = [];

    // If technical density exceeds cutoff, veto ALL Tier 2 candidates
    if (density > this.technicalDensityCutoff) {
      for (const cand of tier2Ner) {
        vetoedSpans.push(Object.assign({}, cand, { reason: "TECHNICAL_DENSITY_BYPASS" }));
      }
    } else {
      for (const cand of tier2Ner) {
        // 1. Score threshold check
        const reqThreshold = this.thresholds[cand.label] || this.thresholds.DEFAULT;
        if (typeof cand.score === "number" && cand.score < reqThreshold) {
          vetoedSpans.push(Object.assign({}, cand, { reason: "BELOW_CONFIDENCE_THRESHOLD" }));
          continue;
        }

        // 2. VETO RULE: Drop if candidate overlaps with any Tier 0 protected span
        let vetoedByTech = false;
        for (const prot of allowSpans) {
          if (overlaps(cand.start, cand.end, prot.start, prot.end)) {
            vetoedSpans.push(Object.assign({}, cand, { reason: "VETO_PROTECTED_TECH", overlappedWith: prot.label }));
            vetoedByTech = true;
            break;
          }
        }
        if (vetoedByTech) continue;

        // 3. BOUNDARY SNAPPING: If overlaps with Tier 1, let Tier 1 take absolute precedence
        let coveredByTier1 = false;
        for (const det of tier1Det) {
          if (overlaps(cand.start, cand.end, det.start, det.end)) {
            coveredByTier1 = true;
            vetoedSpans.push(Object.assign({}, cand, { reason: "COVERED_BY_DETERMINISTIC_TIER1", overlappedWith: det.label || det.type }));
            break;
          }
        }
        if (coveredByTier1) continue;

        vettedTier2.push(cand);
      }
    }

    // Combine Tier 1 and vetted Tier 2
    const allCandidates = [
      ...tier1Det.map(d => ({
        start: d.start !== undefined ? d.start : (d.index !== undefined ? d.index : 0),
        end: d.end !== undefined ? d.end : ((d.index !== undefined && d.length) ? d.index + d.length : 0),
        label: d.type || d.label || "SENSITIVE",
        category: d.category || "GENERAL",
        score: 1.0,
        raw: d.raw || (text ? text.slice(d.start, d.end) : ""),
        tier: 1
      })),
      ...vettedTier2.map(n => ({
        start: n.start,
        end: n.end,
        label: n.label,
        category: n.category || "PROFILE",
        score: n.score !== undefined ? n.score : 0.85,
        raw: n.raw || (text ? text.slice(n.start, n.end) : ""),
        tier: 2
      }))
    ];

    // Span Consolidation: Sort by start index, tie-break by longer length
    allCandidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    // Resolve any remaining internal overlaps
    const resolvedSpans = [];
    for (const span of allCandidates) {
      if (span.start >= span.end) continue;

      let hasCollision = false;
      for (const accepted of resolvedSpans) {
        if (overlaps(span.start, span.end, accepted.start, accepted.end)) {
          hasCollision = true;
          break;
        }
      }
      if (!hasCollision) {
        resolvedSpans.push(span);
      }
    }

    // Sort final spans ascending
    resolvedSpans.sort((a, b) => a.start - b.start);

    return {
      resolvedSpans,
      vetoedSpans,
      technicalDensity: density
    };
  }
}

// Export CommonJS
if (typeof module !== "undefined" && module.exports) {
  module.exports = PrioritySpanArbiter;
}
