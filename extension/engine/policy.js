/**
 * SafeShare-AI — Shared policy helpers (used by the extension and the CLI)
 *  - invert(): the inversion attack. Finds a hidden value that several visible numbers agree on.
 *  - inferBirthYears(): the same idea for dates. A hidden birth date comes back from "I am 28"
 *    plus the current year, or "in 2020 at 22".
 *  - generalizeNumbers(): replaces the user's own amounts with ranges ("Rp 2–5 juta") and keeps
 *    them only if invert() can't recover the originals.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./pseudonymizer.js"));
  } else {
    // Top-level classes in content scripts are global bindings, not window properties
    // eslint-disable-next-line no-undef
    root.SafeSharePolicy = factory(ConsistentPseudonymizer);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Pseudonymizer) {
  const { AdversaryOracleSolver, AGE_PATTERNS } = Pseudonymizer;

  /**
   * Birth years implied by stated ages. Each statement gives two candidates (birthday passed or
   * not yet); years that several statements agree on come first.
   * Result: [{ year, support, derivations: [string] }]
   */
  function inferBirthYears(text, { now = new Date().getFullYear() } = {}) {
    const cands = [];
    for (const m of text.matchAll(new RegExp(AGE_PATTERNS.atAge.source, "gi"))) {
      const y = +m[1], a = +m[2];
      cands.push({ years: [y - a, y - a - 1], how: `${a} in ${y}` });
    }
    for (const m of text.matchAll(new RegExp(AGE_PATTERNS.age.source, "gi"))) {
      const a = +m[1];
      if (a < 10) continue;
      // Reference year: one written right after the age ("28 in 2026"), else this year
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
      const ref = (/^\D{0,20}?\b((?:19|20)\d{2})\b/.exec(after) || [])[1];
      const y = ref ? +ref : now;
      cands.push({ years: [y - a, y - a - 1], how: `${a} in ${y}${ref ? "" : " (this year)"}` });
    }
    const byYear = new Map();
    for (const c of cands) {
      for (const y of c.years) {
        if (!byYear.has(y)) byYear.set(y, new Set());
        byYear.get(y).add(c.how);
      }
    }
    return [...byYear.entries()]
      .map(([year, hows]) => ({ year, support: hows.size, derivations: [...hows] }))
      .sort((a, b) => b.support - a.support || b.year - a.year)
      .slice(0, 2);
  }
  // Range generalization: "Rp 3.000.000" -> "Rp 2–5 juta"

  // 1-2-5 buckets: wide enough that the exact value can't be read back.
  function bucket(v) {
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const steps = [1, 2, 5, 10];
    const i = steps.findIndex((s, k) => v >= s * mag && v < steps[k + 1] * mag);
    return [steps[i] * mag, steps[i + 1] * mag];
  }

  function formatRange(lo, hi, currency) {
    if (currency === "IDR") {
      const unit = (n) => (n >= 1e9 ? [n / 1e9, "miliar"] : n >= 1e6 ? [n / 1e6, "juta"] : n >= 1e3 ? [n / 1e3, "ribu"] : [n, ""]);
      const [a, ua] = unit(lo);
      const [b, ub] = unit(hi);
      return ua === ub ? `Rp ${a}–${b} ${ub}`.trim() : `Rp ${a} ${ua}–${b} ${ub}`.trim();
    }
    const short = (n) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}k` : `${n}`);
    const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "";
    return `${sym}${short(lo)}–${sym}${short(hi)}`;
  }

  function currencyOf(raw) {
    if (/rp|idr|juta|jt|jeti|miliar|ribu|rb/i.test(raw)) return "IDR";
    if (/\$|usd/i.test(raw)) return "USD";
    if (/€|eur/i.test(raw)) return "EUR";
    if (/£|gbp/i.test(raw)) return "GBP";
    return null;
  }

  /**
   * Replaces each of the user's own amounts with a range. Derived figures stay removed. If the
   * inversion attack can still recover any original amount, the ranges are dropped again.
   */
  function generalizeNumbers(turns, pseudonymizer, userAmounts) {
    const secrets = [];
    let out = turns.map((t) => ({ ...t }));
    for (const [key, placeholder] of pseudonymizer.entityMap) {
      if (!key.startsWith("SENSITIVE_FINANCIAL::")) continue;
      const raw = key.slice("SENSITIVE_FINANCIAL::".length);
      const v = pseudonymizer.parseFinancialValue(raw);
      if (!(v >= 10)) continue;
      secrets.push(v);
      if (!userAmounts.has(raw)) continue;
      const label = formatRange(...bucket(v), currencyOf(raw));
      out = out.map((t) => ({ ...t, content: t.content.split(placeholder).join(label) }));
    }
    const leaked = invert(out.map((t) => t.content).join("\n")).some((f) =>
      secrets.some((s) => Math.abs(f.value - s) / s <= 0.015)
    );
    return leaked ? turns : out;
  }

  // Invert (the attack)

  const PERIODS = [12, 52, 4, 2, 3, 24, 36, 60]; // months, weeks, quarters, multi-year spans
  // Occam weighting: monthly<->yearly (12) is the usual step, other periods are less likely.
  const periodCost = (c) => (c === 12 ? 1 : 2);

  /**
   * Returns hidden-value candidates that at least `minSupport` distinct visible numbers agree
   * on. Consistent numbers also agree on every rescaled value (x2, /60, ...), so candidates are
   * ranked by support, then by how simple the explanation is (total operation cost).
   * Result: [{ value, support, cost, derivations: [string], currency }]
   */
  function invert(text, { tolerance = 0.015, minSupport = 2, limit = 3 } = {}) {
    // Range endpoints ("$5k–$10k", "Rp 2–5 juta") are not real values, so they are not evidence
    const rangeSpans = [...text.matchAll(/\S*\d\S*\s?–\s?\S*\d\S*(?:\s+(?:ribu|juta|miliar))?/g)].map((m) => [m.index, m.index + m[0].length]);
    const tokens = new AdversaryOracleSolver(tolerance).lexNumericSpans(text)
      .filter((t) => !rangeSpans.some(([s, e]) => t.start >= s && t.start < e));
    const amounts = tokens.filter((t) => !t.isRatio && !t.isSmallInt);
    const ratios = tokens.filter((t) => t.isRatio && t.val > 0 && t.val < 1);
    const factors = [
      ...ratios.map((r) => ({ v: r.val, label: r.raw })),
      ...ratios.map((r) => ({ v: 1 - r.val, label: `(100% - ${r.raw})` }))
    ];

    const near = (a, b) => Math.abs(a - b) / b <= tolerance;
    const visible = amounts.map((a) => a.val);
    const cands = [];
    for (const a of amounts) {
      const add = (v, how, cost) => {
        // Support counts distinct visible values: "565" repeated three times is one piece of evidence
        if (v >= 100 && !visible.some((x) => near(v, x))) cands.push({ v, how, cost, src: Math.round(a.val * 100) });
      };
      for (const c of PERIODS) {
        add(a.val / c, `${a.raw} / ${c}`, periodCost(c));
        add(a.val * c, `${a.raw} × ${c}`, periodCost(c));
      }
      for (const f of factors) {
        add(a.val / f.v, `${a.raw} / ${f.label}`, 1);
        for (const c of PERIODS) {
          add(a.val / c / f.v, `${a.raw} / ${c} / ${f.label}`, 1 + periodCost(c));
          add((a.val * c) / f.v, `${a.raw} × ${c} / ${f.label}`, 1 + periodCost(c));
        }
      }
    }

    // Cluster candidates that land on the same value; keep the cheapest derivation per source.
    const clusters = [];
    for (const c of cands) {
      let k = clusters.find((k) => near(c.v, k.value));
      if (!k) clusters.push((k = { value: c.v, bySource: new Map() }));
      const prev = k.bySource.get(c.src);
      if (!prev || c.cost < prev.cost) k.bySource.set(c.src, c);
    }

    const currency = (amounts.find((a) => /Rp|IDR/i.test(a.raw)) && "IDR") ||
      (amounts.find((a) => /\$|USD/.test(a.raw)) && "USD") || null;
    return clusters
      .map((k) => {
        const ds = [...k.bySource.values()];
        return {
          value: k.value,
          support: ds.length,
          cost: ds.reduce((n, d) => n + d.cost, 0),
          derivations: ds.map((d) => d.how),
          currency
        };
      })
      .filter((k) => k.support >= minSupport)
      .sort((a, b) => b.support - a.support || a.cost - b.cost)
      .slice(0, limit);
  }

  return { invert, inferBirthYears, bucket, formatRange, currencyOf, generalizeNumbers };
});
