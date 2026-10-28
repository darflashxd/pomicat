/* Document-side policy helpers: approximate ranges for user-stated amounts. */
(function (root, factory) {
  const policy = typeof module === "object" && module.exports ? require("../engine/policy.js") : root.SafeSharePolicy;
  const Pseudonymizer = typeof module === "object" && module.exports ? require("../engine/pseudonymizer.js") : ConsistentPseudonymizer;
  const api = factory(policy, new Pseudonymizer());
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SafeShareWordPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (policy, pseudonymizer) {
  const CURRENCY = /\b(?:USD|IDR|SGD|MYR)\b|\$|\u20AC|\u00A3|\u00A5|\u20B9|Rp\.?/i;

  function currencyOf(raw) {
    return /\bSGD\b/i.test(String(raw)) ? "SGD" : policy.currencyOf(String(raw));
  }

  function valueOf(raw) {
    const value = pseudonymizer.parseFinancialValue(String(raw));
    return Number.isFinite(value) ? value : null;
  }

  function bucket(v) {
    return policy.bucket(v);
  }

  function short(n) {
    if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
    return String(+n.toFixed(0));
  }

  function formatRange(lo, hi, currency) {
    const text = policy.formatRange(lo, hi, currency === "SGD" ? "USD" : currency).replace(/\u2013/g, "-");
    return currency === "SGD" ? text.replace(/\$/g, "S$") : text;
  }

  function rangeFor(raw, fallbackCurrency) {
    const value = valueOf(raw);
    if (value === null || value <= 0) return null;
    const [lo, hi] = bucket(value);
    return formatRange(lo, hi, currencyOf(raw) || fallbackCurrency || null);
  }

  return { bucket, short, formatRange, rangeFor, currencyOf, valueOf, CURRENCY };
});
