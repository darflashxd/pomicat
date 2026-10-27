/* Document detection pipeline: heuristics (Tier 1), money bases (Tier 2 shape),
   derived-value solver (Tier 3) and local NER. Pure text in, candidates out. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SafeShareWordDetect = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CATEGORY = {
    CREDENTIALS: "Credentials", FINANCIAL: "Financial", GOV_ID: "Government ID",
    PROFILE: "Contact & profile", HEALTH: "Health", SYSTEM: "System", CUSTOM: "Added by you"
  };

  function push(list, seen, item) {
    const key = `${item.category}|${String(item.value).toLowerCase()}`;
    if (seen.has(key)) {
      const prior = seen.get(key);
      if (item.preChecked) prior.preChecked = true;
      if (Number.isFinite(item.score) && !Number.isFinite(prior.score)) prior.score = item.score;
      if (item.reason && !prior.reason.includes(item.reason)) prior.reason += `; ${item.reason}`;
      return;
    }
    seen.set(key, item);
    list.push(item);
  }

  function tier1(map, heuristics) {
    const out = [];
    for (const part of map.parts) {
      const result = heuristics.scan(part);
      for (const detection of result.detections) {
        const value = (detection.secretToken || detection.raw || "").trim();
        if (!value || value.length < 3) continue;
        const tag = /\[REDACTED_[A-Z0-9_]+\]|\[REDACTED\]/.exec(detection.replacement || "");
        out.push({
          value, category: detection.category === "FINANCIAL" ? "FINANCIAL"
            : detection.category === "GOV_ID" ? "GOV_ID"
              : detection.category === "CREDENTIALS" ? "CREDENTIALS" : "PROFILE",
          ruleName: detection.name || "Rule", reason: "rule match", replacement: tag ? tag[0] : "[REDACTED]",
          source: "rule", preChecked: true
        });
      }
    }
    return out;
  }

  // Narrow, high-precision fallback: "A. Whitfield" style initials + surname.
  // Not a general name detector; the local model remains the broad path.
  function initialsRule(map) {
    const out = [];
    for (const part of map.parts) {
      for (const match of part.matchAll(/\b\p{Lu}\.\s?\p{Lu}[\p{Ll}'-]{2,}\b/gu)) {
        out.push({
          value: match[0], category: "PROFILE", ruleName: "Initial + surname",
          reason: "name pattern", replacement: "[REDACTED_NAME]", source: "rule", preChecked: true
        });
      }
    }
    return out;
  }

  const CONNECTION = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"'<>]+/gi;

  function connectionStrings(map) {
    const out = [];
    for (const part of map.parts) {
      for (const match of part.match(CONNECTION) || []) {
        out.push({
          value: match, category: "CREDENTIALS", ruleName: "Connection string",
          reason: "embedded credentials", replacement: "[REDACTED_CONNECTION_STRING]",
          source: "rule", preChecked: true
        });
      }
    }
    return out;
  }

  function solverLeaks(map, bases, Solver) {
    if (!bases.length || typeof Solver !== "function") return [];
    const values = bases.map(base => base.value);
    const solver = new Solver();
    const out = [];
    for (const part of map.parts) {
      try {
        solver.solveAndRedact(part, values);
        for (const leak of solver.lastLeaks || []) {
          out.push({
            value: String(leak.raw).trim(),
            category: "FINANCIAL",
            ruleName: /SAVINGS/.test(leak.replacement) ? "Derived annual saving"
              : /INCREMENT/.test(leak.replacement) ? "Derived raise"
                : /REMAINDER/.test(leak.replacement) ? "Derived remainder"
                  : /BUDGET/.test(leak.replacement) ? "Derived allocation"
                    : "Derived amount",
            reason: `reconstructs a hidden amount (${leak.replacement.replace(/\[REDACTED_|_\]|\]/g, "").toLowerCase()})`,
            replacement: leak.replacement,
            source: "derived", preChecked: true
          });
        }
      } catch (_) { /* solver is best-effort on unusual text */ }
    }
    return out;
  }

  const NAME_LABEL = /^(?:PERSON|GIVEN_NAME|SURNAME|FIRST_NAME|LAST_NAME)$/;

  async function nerCandidates(map, ner, chunkSize = 6000) {
    if (!ner || typeof ner.analyze !== "function") return [];
    const out = [];
    let buffer = "", offset = 0;
    const flush = async () => {
      if (!buffer.trim()) { buffer = ""; return; }
      const result = await ner.analyze(buffer, 30000, true);
      if (result && result.success && Array.isArray(result.spans)) {
        for (const span of result.spans) {
          if (!NAME_LABEL.test(span.label)) continue;
          if (!Number.isFinite(span.score) || span.score < 0.35) continue;
          let value = buffer.slice(span.start, span.end).trim();
          // The model often includes the role word ("doctor Rebecca...", "manager Thomas...").
          value = value.replace(/^(?:the\s+)?(?:doctor|dr|mr|mrs|ms|miss|manager|therapist|patient|employee|professor|nurse|sister|brother|wife|husband)\s+/i, "").trim();
          if (!/\p{L}{3}/u.test(value) || value.split(/\s+/).length > 4) continue;
          out.push({
            value, category: "PROFILE", ruleName: `Local model: ${span.label}`,
            reason: `model score ${span.score.toFixed(2)} (not a probability)`,
            replacement: "[REDACTED_NAME]", source: "model", score: span.score,
            preChecked: span.score >= 0.6 || (value.split(/\s+/).length > 1 && span.score >= 0.35)
          });
        }
      }
      buffer = "";
    };
    for (const part of map.parts) {
      if (buffer.length + part.length > chunkSize) await flush();
      buffer += (buffer ? "\n\n" : "") + part;
      offset += part.length;
    }
    await flush();
    return out;
  }

  async function detect({ doc, map, heuristics, Solver, ner, useModel = false, TextMap }) {
    const candidates = [], seen = new Map();

    // Money first: table headers and currency marks define the hidden base amounts.
    const bases = TextMap ? TextMap.findBaseValues(doc) : [];
    for (const base of bases) {
      push(candidates, seen, {
        value: base.raw, category: "FINANCIAL", ruleName: "Money amount",
        reason: base.reason, replacement: "[REDACTED_FINANCIAL]",
        source: "amount", preChecked: base.preChecked !== false
      });
    }

    for (const item of tier1(map, heuristics)) push(candidates, seen, item);
    for (const item of initialsRule(map)) push(candidates, seen, item);
    for (const item of connectionStrings(map)) push(candidates, seen, item);

    const numericBases = [...bases.map(base => ({ value: base.value }))];
    for (const item of candidates) {
      if (item.category !== "FINANCIAL") continue;
      const value = Number(String(item.value).replace(/[^\d.]/g, ""));
      if (Number.isFinite(value) && value > 0) numericBases.push({ value });
    }
    for (const item of solverLeaks(map, numericBases, Solver)) push(candidates, seen, item);

    if (useModel) for (const item of await nerCandidates(map, ner)) push(candidates, seen, item);

    // Alias hint: a shorter person value contained in a longer one is the same person.
    const people = candidates.filter(item => item.category === "PROFILE" && /\s/.test(item.value));
    for (const item of candidates) {
      if (item.category !== "PROFILE" || /\s/.test(item.value)) continue;
      const longer = people.find(person => new RegExp(`(^|\\s)${item.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i").test(person.value));
      if (longer) item.aliasOf = longer.value;
    }
    return candidates.map(item => ({ ...item, categoryLabel: CATEGORY[item.category] || "Other" }));
  }

  return { detect, tier1, initialsRule, connectionStrings, solverLeaks, nerCandidates, CATEGORY };
});
