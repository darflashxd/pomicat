/** Local, unverified credential candidates for the share review only. No network or storage. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./heuristics.js"));
  else root.SafeShareMaybe = factory(HeuristicsRedactor);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Heuristics) {
  const heuristics = new Heuristics();
  const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Punctuation and path separators delimit an occurrence; letters/digits never do.
  const literal = (s) => new RegExp(`(?<![\\p{L}\\p{N}_+\\-])${escaped(s)}(?![\\p{L}\\p{N}_+\\-])`, "gu");
  const placeholders = /\[(?:(?:REDACTED|CONFIDENTIAL|INTERNAL|HR|ANONYMIZED)_[A-Z0-9_]+|User_[A-Z]+|(?:NAME|PLACE|LOCATION|NIK)_\d+|user_\d+@protected\.local)\]|<S\d+>|\$\{[^}\n]*\}|\$[A-Za-z_][\w]*/g;

  function scan(turns, modelSpans = []) {
    const candidates = new Map();
    const normalized = turns.map(({ role, content }) => ({ role, content: heuristics.normalizeHomoglyphs(content) }));
    const excludedByTurn = normalized.map(t => [...t.content.matchAll(placeholders)].map(m => [m.index, m.index + m[0].length]));
    const occurrencesByTurn = normalized.map(t => [...t.content.matchAll(/\$\{[^}\n]*\}|\$[A-Za-z_][\w]*/g)].map(m => [m.index, m.index + m[0].length]));
    normalized.forEach((turn, turnIndex) => {
      const text = turn.content;
      const excluded = excludedByTurn[turnIndex];
      const add = (raw, start, risky, reason) => {
        if (excluded.some(([s, e]) => start < e && start + raw.length > s)) return;
        if (/^(?:true|false|null|undefined|none)$/i.test(raw) || (!risky && /^\d+$/.test(raw))) return;
        const old = candidates.get(raw);
        if (!old || risky) candidates.set(raw, { raw, risky, reason });
      };
      for (const span of modelSpans.filter(s => s.turnIndex === turnIndex)) {
        if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > text.length ||
          !Number.isFinite(span.score) || span.score < 0.15 || span.score > 1) continue;
        add(text.slice(span.start, span.end), span.start, false, `Local model: ${span.label} (uncalibrated score ${span.score.toFixed(2)})`);
      }
      // A credential assignment matters even for a low-entropy human password. '=' alone does not.
      const assignments = /(?<![\w.-])([\w.-]{0,96}(?:password|passwd|pwd|secret|token|api[_-]?key|credential)[\w.-]{0,32})["']?\s*(?:=|:|\bis\b)\s*(?:"([^"\r\n]{6,})"|'([^'\r\n]{6,})'|([^\s"'`,;<>]{6,}))/gi;
      for (const m of text.matchAll(assignments)) {
        if (/(?:public|example|sample)[_.-]?(?:key|token)|(?:name|path|file|length|size|endpoint|url|uri|budget|expiry|expires|expiration|algorithm|policy|type|rotation|enabled|count|limit)$/i.test(m[1])) continue;
        const raw = m[2] || m[3] || m[4].replace(/\.+$/, "");
        if (raw.length < 6) continue;
        if (m[0].match(/\bis\s+/i) && /^(?:returned|required|generated|optional|missing|invalid|expired|provided|needed)$/i.test(raw)) continue;
        const start = m.index + m[0].lastIndexOf(raw);
        add(raw, start, true, `Value assigned to ${m[1]}`);
      }
      // ponytail: generic ASCII credential strings only; names, amounts and encoded secrets need separate evaluation.
      for (const m of text.matchAll(/(?<![\w+/.-])[A-Za-z0-9_+/-]{20,}={0,2}(?![\w+/=-])/g)) {
        const raw = m[0];
        if (!/[A-Za-z]/.test(raw) || !/\d/.test(raw)) continue;
        const before = text.slice(Math.max(0, m.index - 80), m.index);
        const isHex = /^[a-f0-9]+$/i.test(raw);
        const isUuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(raw);
        if ((isHex || isUuid) && /\b(?:git|commit|sha\d*|checksum|digest|uuid|request[_-]?id|trace[_-]?id|public[_-]?key)\b[^\n]*$/i.test(before)) continue;
        if (heuristics.shannonEntropy(raw) >= (isHex ? 3 : 4)) add(raw, m.index, false, "Random-looking value; not verified as a secret");
      }
    });
    return [...candidates.values()].map((c, i) => {
      const occurrences = normalized.flatMap((t, turnIndex) => [...t.content.matchAll(literal(c.raw))]
        .filter(m => !occurrencesByTurn[turnIndex].some(([s, e]) => m.index < e && m.index + c.raw.length > s))
        .map((m) => ({ turnIndex, start: m.index, end: m.index + c.raw.length })));
      return { ...c, id: `maybe_${i + 1}`, replacement: `[REDACTED_POSSIBLE_SECRET_${i + 1}]`, occurrences };
    }).filter(c => c.occurrences.length);
  }

  function apply(turns, candidates, choices) {
    return turns.map(({ role, content }, turnIndex) => {
      content = heuristics.normalizeHomoglyphs(content);
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
