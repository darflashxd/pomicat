/** Local, unverified credential candidates for the share review only. No network or storage. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./heuristics.js"));
  else root.SafeShareMaybe = factory(HeuristicsRedactor);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Heuristics) {
  const heuristics = new Heuristics();
  const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Punctuation and path separators delimit an occurrence; letters/digits never do.
  const literal = (s) => new RegExp(`(?<![\\p{L}\\p{N}_+\\-])${escaped(s)}(?![\\p{L}\\p{N}_+\\-])`, "gu");
  // SafeShare's own placeholders, including the numbered ones from before sending ([PASSWORD_1], [API_KEY_2])
  const placeholders = /\[(?:(?:REDACTED|CONFIDENTIAL|INTERNAL|HR|ANONYMIZED)_[A-Z0-9_]+|User_[A-Z]+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_\d+|user_\d+@protected\.local|user|host|password|sandbox_path)\]|<S\d+>|\$\{[^}\n]*\}|\$[A-Za-z_][\w]*/g;

  /**
   * Context score (0-1), added on top of the detectors below; it ranks the list and pre-ticks
   * strong candidates. ponytail: hand-set weights, to be calibrated on labelled data.
   *   source:  value assigned to a credential name 0.55 · random-looking string 0.30 ·
   *            local model span 0.5 x its probability
   *   entropy: +0.20 at >= 4.5 bits/char (>= 3.5 for hex), +0.10 at >= 4.0 (>= 3.0 for hex)
   *   context: +0.25 when a credential word is within 40 characters before the value
   *   shape:   +0.05 if it mixes upper case, lower case and digits; +0.05 if it has a symbol
   *   damping: -0.20 when "example", "sample", "dummy" or "placeholder" is within 40 characters
   * Pre-ticked ("risky"): assigned to a credential name (as before), or score >= 0.75.
   */
  const CREDENTIAL_WORD = /(?:\b(?:token|api[_ -]?key|key|secret|pass(?:word|wd|phrase)?|pwd|auth|bearer|credentials?|otp|pin|kata\s+sandi|sandi)\b|(?:^|\s)-p\s*)[^\n]{0,40}$/i;
  // The local model tags field labels ("My NIK is …") and our own name as entities; the values
  // after them are the rules' job. Exact word, acronyms in capitals only ("Sim" or "Pin" can be a
  // name), so "Rina" or "NIK 3201…" still go through.
  const LABEL_WORDS = /^(?:[Ss]afe[Ss]hare(?:-AI)?|NIK|NPWP|KTP|KK|SIM|BPJS|NIP|NISN|NIB|SSN|NINO|IBAN|SWIFT|BIC|CVV|CVC|OTP|PIN|API|URL|IP|ID|[Ee]-?mail)$/;
  const DAMPING_WORD =/\b(?:example|sample|dummy|placeholder|contoh)\b/i;
  function contextScore(raw, text, start, source, modelScore = 0) {
    const why = [];
    let score = source === "assignment" ? 0.55 : source === "model" ? 0.5 * modelScore : 0.3;
    const isHex = /^[a-f0-9]+$/i.test(raw);
    const h = heuristics.shannonEntropy(raw);
    if (h >= (isHex ? 3.5 : 4.5)) { score += 0.2; why.push(`very random (${h.toFixed(1)} bits/char)`); }
    else if (h >= (isHex ? 3 : 4)) { score += 0.1; why.push(`random-looking (${h.toFixed(1)} bits/char)`); }
    const before = text.slice(Math.max(0, start - 40), start);
    const around = text.slice(Math.max(0, start - 40), start + raw.length + 40);
    if (CREDENTIAL_WORD.test(before)) { score += 0.25; why.push("credential word just before it"); }
    if (/[a-z]/.test(raw) && /[A-Z]/.test(raw) && /\d/.test(raw)) { score += 0.05; why.push("mixed case and digits"); }
    if (/[^\w\s]/.test(raw)) score += 0.05;
    if (DAMPING_WORD.test(around)) { score -= 0.2; why.push("example/placeholder wording nearby"); }
    return { score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)), why };
  }

  function scan(turns, modelSpans = []) {
    const candidates = new Map();
    // The text as typed (minus smuggling characters): the share keeps everything else unchanged
    const normalized = turns.map(({ role, content }) => ({ role, content: heuristics.stripSmuggled(content) }));
    const excludedByTurn = normalized.map(t => [...t.content.matchAll(placeholders)].map(m => [m.index, m.index + m[0].length]));
    const occurrencesByTurn = normalized.map(t => [...t.content.matchAll(/\$\{[^}\n]*\}|\$[A-Za-z_][\w]*/g)].map(m => [m.index, m.index + m[0].length]));
    normalized.forEach((turn, turnIndex) => {
      const text = turn.content;
      const excluded = excludedByTurn[turnIndex];
      const add = (raw, start, risky, reason, source, modelScore) => {
        if (excluded.some(([s, e]) => start < e && start + raw.length > s)) return;
        if (/^(?:true|false|null|undefined|none)$/i.test(raw) || (!risky && /^\d+$/.test(raw))) return;
        const { score, why } = contextScore(raw, text, start, source, modelScore);
        const old = candidates.get(raw);
        if (old && old.score >= score && (old.risky || !risky)) return;
        candidates.set(raw, { raw, risky: risky || score >= 0.75 || Boolean(old && old.risky), reason, score, why });
      };
      for (const span of modelSpans.filter(s => s.turnIndex === turnIndex)) {
        if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > text.length ||
          !Number.isFinite(span.score) || span.score < 0.15 || span.score > 1) continue;
        if (LABEL_WORDS.test(text.slice(span.start, span.end).trim())) continue;
        add(text.slice(span.start, span.end), span.start, false, `Local model: ${span.label} (uncalibrated score ${span.score.toFixed(2)})`, "model", span.score);
      }
      // A credential assignment matters even for a low-entropy human password. '=' alone does not.
      const assignments = /(?<![\w.-])([\w.-]{0,96}(?:password|passwd|pwd|secret|token|api[_-]?key|credential)[\w.-]{0,32})["']?\s*(?:=|:|\bis\b)\s*(?:"([^"\r\n]{6,})"|'([^'\r\n]{6,})'|([^\s"'`,;<>]{6,}))/gi;
      for (const m of text.matchAll(assignments)) {
        if (/(?:public|example|sample)[_.-]?(?:key|token)|(?:name|path|file|length|size|endpoint|url|uri|budget|expiry|expires|expiration|algorithm|policy|type|rotation|enabled|count|limit)$/i.test(m[1])) continue;
        const raw = m[2] || m[3] || m[4].replace(/\.+$/, "");
        if (raw.length < 6) continue;
        if (m[0].match(/\bis\s+/i) && /^(?:returned|required|generated|optional|missing|invalid|expired|provided|needed)$/i.test(raw)) continue;
        const start = m.index + m[0].lastIndexOf(raw);
        add(raw, start, true, `Value assigned to ${m[1]}`, "assignment");
      }
      // ponytail: generic ASCII credential strings only; names, amounts and encoded secrets need separate evaluation.
      for (const m of text.matchAll(/(?<![\w+/.-])[A-Za-z0-9_+/-]{20,}={0,2}(?![\w+/=-])/g)) {
        const raw = m[0];
        if (!/[A-Za-z]/.test(raw) || !/\d/.test(raw)) continue;
        const before = text.slice(Math.max(0, m.index - 80), m.index);
        const isHex = /^[a-f0-9]+$/i.test(raw);
        const isUuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(raw);
        if ((isHex || isUuid) && /\b(?:git|commit|sha\d*|checksum|digest|uuid|request[_-]?id|trace[_-]?id|public[_-]?key)\b[^\n]*$/i.test(before)) continue;
        if (heuristics.shannonEntropy(raw) >= (isHex ? 3 : 4)) add(raw, m.index, false, "Random-looking value; not verified as a secret", "random");
      }
    });
    // Highest score first, so the review list shows the likeliest misses at the top
    return [...candidates.values()].sort((a, b) => b.score - a.score).map((c, i) => {
      const occurrences = normalized.flatMap((t, turnIndex) => [...t.content.matchAll(literal(c.raw))]
        .filter(m => !occurrencesByTurn[turnIndex].some(([s, e]) => m.index < e && m.index + c.raw.length > s))
        .map((m) => ({ turnIndex, start: m.index, end: m.index + c.raw.length })));
      return { ...c, id: `maybe_${i + 1}`, replacement: `[REDACTED_POSSIBLE_SECRET_${i + 1}]`, occurrences };
    }).filter(c => c.occurrences.length);
  }

  function apply(turns, candidates, choices) {
    return turns.map(({ role, content }, turnIndex) => {
      content = heuristics.stripSmuggled(content);
      const spans = candidates.filter((c) => choices.get(c.raw) ?? c.risky)
        .flatMap((c) => c.occurrences.filter((o) => o.turnIndex === turnIndex).map((o) => ({ ...o, replacement: c.replacement })))
        .sort((a, b) => a.start - b.start || b.end - a.end);
      // Hide the union of selected intervals: an inner match must not cancel an outer secret.
      const merged = [];
      for (const span of spans) {
        const previous = merged[merged.length - 1];
        if (previous && span.start < previous.end) previous.end = Math.max(previous.end, span.end);
        else merged.push({ ...span });
      }
      for (const s of merged.reverse()) {
        content = content.slice(0, s.start) + s.replacement + content.slice(s.end);
      }
      return { role, content };
    });
  }

  return { scan, apply };
});
