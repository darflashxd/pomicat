/* Document-side policy helpers: approximate ranges for user-stated amounts. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SafeShareWordPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CURRENCY = /\b(?:USD|IDR|SGD|MYR)\b|\$|\u20AC|\u00A3|\u00A5|\u20B9|Rp\.?/i;

  function currencyOf(raw) {
    const text = String(raw);
    if (/rp|idr|juta|jt|miliar|ribu|\brb\b/i.test(text)) return "IDR";
    if (/\$|usd/i.test(text)) return "USD";
    if (/\u20AC|eur/i.test(text)) return "EUR";
    if (/\u00A3|gbp/i.test(text)) return "GBP";
    if (/sgd/i.test(text)) return "SGD";
    return null;
  }

  function valueOf(raw) {
    const cleaned = String(raw).replace(/[^\d.,-]/g, "");
    if (!cleaned) return null;
    const normalised = /^\d{1,3}(?:[.,]\d{3})+$/.test(cleaned) ? cleaned.replace(/[.,]/g, "") : cleaned.replace(/,/g, "");
    const value = Math.abs(Number.parseFloat(normalised));
    return Number.isFinite(value) ? value : null;
  }

  function bucket(v) {
    const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
    const steps = [1, 2, 5, 10];
    let index = steps.findIndex((step, position) => v >= step * magnitude && v < (steps[position + 1] ?? 10) * magnitude);
    if (index < 0) index = 0;
    return [steps[index] * magnitude, (steps[index + 1] ?? 10) * magnitude];
  }

  function short(n) {
    if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
    return String(+n.toFixed(0));
  }

  function formatRange(lo, hi, currency) {
    if (currency === "IDR") {
      const unit = n => (n >= 1e9 ? [n / 1e9, "miliar"] : n >= 1e6 ? [n / 1e6, "juta"] : n >= 1e3 ? [n / 1e3, "ribu"] : [n, ""]);
      const [a, ua] = unit(lo), [b, ub] = unit(hi);
      return ua === ub ? `Rp ${a}-${b} ${ub}`.trim() : `Rp ${a} ${ua}-${b} ${ub}`.trim();
    }
    if (!currency) return `\u2248${short(lo)}-${short(hi)}`;
    const symbol = currency === "USD" ? "$" : currency === "EUR" ? "\u20AC" : currency === "GBP" ? "\u00A3" : currency === "SGD" ? "S$" : "";
    return `${symbol}${short(lo)}-${symbol}${short(hi)}`;
  }

  function rangeFor(raw, fallbackCurrency) {
    const value = valueOf(raw);
    if (value === null || value <= 0) return null;
    const [lo, hi] = bucket(value);
    return formatRange(lo, hi, currencyOf(raw) || fallbackCurrency || null);
  }

  return { bucket, short, formatRange, rangeFor, currencyOf, valueOf, CURRENCY };
});
