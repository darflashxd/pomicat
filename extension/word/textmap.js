/* Flatten an inspected DOCX into searchable text plus a reversible map back to
   paragraph/table-cell positions. Pure functions: no DOM, so this is testable in Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SafeShareTextMap = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MONEY_HEADER = /\b(?:salary|salaries|base|bonus|pay|payout|wage|wages|income|earnings?|compensation|allowance|amount|total|subtotal|cost|fee|fees|price|balance|savings?|budget|rent|mortgage|debt|loan|premium|deduction|net|gross|gaji|tunjangan|upah|penghasilan|pendapatan|tabungan|biaya|harga|jumlah|total)\b/i;
  const NON_MONEY_HEADER = /\b(?:year|date|period|month|quarter|age|count|quantity|qty|number|no|id|code|percent|percentage|rate|share|ratio|index)\b/i;

  function flatten(doc) {
    const segments = [];
    const parts = [];
    let text = "";
    const push = (chunk, meta) => {
      if (!chunk) return;
      const start = text.length;
      text += chunk;
      segments.push({ ...meta, start, end: start + chunk.length });
      text += "\n\n";
      parts.push(chunk);
    };
    (doc.blocks || []).forEach((block, index) => {
      if (block.rows) {
        block.rows.forEach((row, r) => {
          let offset = 0;
          const cells = [];
          row.forEach((cell, c) => {
            const value = String(cell ?? "");
            cells.push({ col: c, start: offset, end: offset + value.length, value });
            offset += value.length + 3;
          });
          const line = row.join(" | ");
          const start = text.length;
          text += line;
          segments.push({ kind: "row", blockIndex: index, row: r, start, end: start + line.length, cells });
          text += "\n\n";
          parts.push(line);
        });
      } else if (block.text) {
        push(block.text, { kind: "paragraph", blockIndex: index });
      }
    });
    (doc.supplementary || []).forEach((part, index) => {
      if (part.text) push(part.text, { kind: "supplementary", part: part.name, index });
    });
    return { text, segments, parts };
  }

  // A cell counts as numeric only when it holds a bare number (optionally currency-marked).
  // "14 March 2026" must not become 142026.
  function looksNumeric(text) {
    const value = String(text ?? "").trim();
    if (!value) return false;
    if (/[A-Za-z]{2,}/.test(value.replace(/^(?:Rp|IDR|USD|SGD|MYR)\b/i, "").replace(/\b(?:USD|IDR|SGD|MYR)\b/i, ""))) return false;
    return /^(?:Rp\.?|IDR|USD|SGD|MYR|\$|\u20AC|\u00A3|\u00A5|\u20B9)?\s*-?\d[\d.,]*\s*(?:%|USD|IDR|SGD|MYR)?$/.test(value);
  }

  function headerKinds(rows) {
    const header = rows && rows[0] ? rows[0] : [];
    const numericByColumn = header.map((_, c) => rows.slice(1).filter(row => looksNumeric(row[c])).length);
    return header.map((cell, c) => {
      const label = String(cell ?? "").trim();
      const labelLike = label.split(/\s+/).length <= 5 && !/\d/.test(label);
      if (labelLike && MONEY_HEADER.test(label) && !NON_MONEY_HEADER.test(label) && numericByColumn[c] >= 2) return "money";
      if (/\b(?:percent|percentage|rate|ratio|share|%)/i.test(label)) return "percent";
      if (/\b(?:year|date|period|month|quarter)\b/i.test(label)) return "date";
      if (/\b(?:count|quantity|qty|number|no|id|code)\b/i.test(label)) return "count";
      return "plain";
    });
  }

  function numericValue(raw) {
    const cleaned = String(raw).replace(/[^\d.,-]/g, "");
    if (!cleaned) return null;
    // 4,800 / 4.800 (thousands) vs 4.80 (decimal)
    let normalised = cleaned;
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(cleaned)) normalised = cleaned.replace(/[.,]/g, "");
    else normalised = cleaned.replace(/,/g, "");
    const value = Math.abs(Number.parseFloat(normalised));
    return Number.isFinite(value) ? value : null;
  }

  function isYearToken(raw, value) {
    return /^\d{4}$/.test(String(raw).trim()) && value >= 1950 && value <= 2040;
  }

  const CURRENCY = /(?:Rp\.?|IDR|USD|SGD|MYR|\$|\u20AC|\u00A3|\u00A5|\u20B9)\s?-?\d[\d.,]*|\b\d[\d.,]*\s?(?:USD|IDR|SGD|MYR|dollars?|ringgit|rupiah)\b/i;
  const MONEY_WORD_BEFORE = /\b(?:salary|income|pay|bonus|wage|savings?|budget|revenue|pension|rent|debt|loan|mortgage|cost|fee|price|balance|total|amount|gaji|tabungan|tunjangan|penghasilan|biaya|harga)\b[^\n]{0,40}$/i;

  /* Base money values: currency-marked, or numeric cells under a money column. */
  function findBaseValues(doc) {
    const bases = new Map();
    const add = (raw, reason, preChecked) => {
      raw = String(raw).replace(/\s*(?:USD|IDR|SGD|MYR|dollars?|ringgit|rupiah)$/i, "").trim();
      const value = numericValue(raw);
      if (value === null || isYearToken(raw, value)) return;
      const key = String(value);
      const prior = bases.get(key);
      if (prior && prior.preChecked && !preChecked) return;
      bases.set(key, { value, raw: String(raw).trim(), reason, preChecked });
    };
    (doc.blocks || []).forEach(block => {
      if (block.rows) {
        const kinds = headerKinds(block.rows);
        block.rows.forEach((row, r) => {
          row.forEach((cell, c) => {
            const text = String(cell ?? "").trim();
            if (!text || !looksNumeric(text)) return;
            const value = numericValue(text);
            if (value === null) return;
            if (kinds[c] === "money") return add(text, "money column", true);
            if (CURRENCY.test(text)) return add(text, "currency symbol", true);
            if (kinds[c] === "percent" || kinds[c] === "date" || kinds[c] === "count") return;
          });
        });
      } else if (block.text) {
        const matches = block.text.match(new RegExp(CURRENCY.source, "gi")) || [];
        for (const raw of matches) add(raw, "currency symbol", true);
        // Prose amounts: a money word within 60 characters before the number.
        const tokens = block.text.match(/(?<![\w.,])(?:\d{1,3}(?:[.,]\d{3})+|\d{3,})(?![\w.,]|\s?%)/g) || [];
        for (const raw of tokens) {
          const at = block.text.indexOf(raw);
          const before = block.text.slice(Math.max(0, at - 60), at);
          if (!MONEY_WORD_BEFORE.test(before)) continue;
          const publicFigure = /\b(?:average|median|national|typical|industry|benchmark|statutory|minimum wage|market rate|rata-rata|umum)\b/i.test(before);
          add(raw, publicFigure ? "public figure nearby" : "money word nearby", !publicFigure);
        }
      }
    });
    return [...bases.values()];
  }

  return { flatten, headerKinds, looksNumeric, numericValue, isYearToken, findBaseValues, MONEY_HEADER, NON_MONEY_HEADER, CURRENCY };
});
