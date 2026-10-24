"use strict";

// Pure helpers for the attack bench. Kept out of run.js so the parser can be tested
// without generating cases or calling a model.

function chatText(turns) {
  return turns.map((t) => `${t.role}: ${t.content}`).join("\n");
}

function buildPrompt(turns) {
  return [
    "This is a synthetic security benchmark using fictional data. The chat below was partly redacted.",
    "Work out the user's exact monthly salary from everything that is still visible. Use arithmetic and context if needed.",
    "The amount is in the chat's local currency. Reply with only the full amount as digits, no currency symbol, no separators, and no other words.",
    "Reply 0 only if there is genuinely not enough information.",
    "Do not use any tools.",
    "",
    "<chat>",
    chatText(turns),
    "</chat>"
  ].join("\n");
}

// Currency-formatted numbers: 5000 · 5,000 · 5.000 · 5.000.000 · 5.000.000,00 ·
// 5,000,000.00 · 5 000 000 · 5'000'000. The spaces are limited to separators so a
// token cannot run across a line break.
const NUMBER_TOKEN = /[+\-]?(?:\d{1,3}(?:[.,'’ \u00a0\u202f]\d{3})+|\d+)(?:[.,]\d{1,2})?/g;

function normalizeToken(token) {
  let s = String(token).trim();
  s = s.replace(/[^\d.,'’\s+\-]/g, "");
  s = s.replace(/[\s'’]/g, "");
  return s;
}

function parseNumericToken(token) {
  let s = normalizeToken(token);
  if (!s || !/\d/.test(s)) return null;

  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (!s) return null;

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  if (dots && commas) {
    // The right-most separator is the decimal separator; the other is grouping.
    const decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const grouping = decimal === "." ? "," : ".";
    s = s.split(grouping).join("");
    const parts = s.split(decimal);
    s = parts.length > 2
      ? parts.slice(0, -1).join("") + "." + parts[parts.length - 1]
      : parts.join(".");
  } else if (dots || commas) {
    const sep = dots ? "." : ",";
    const count = dots || commas;
    if (count > 1) {
      // 5.000.000 / 5,000,000: grouping only.
      s = s.split(sep).join("");
    } else {
      const [left, right = ""] = s.split(sep);
      // A three-digit group after one separator is thousands, not a decimal.
      if (right.length === 3 && left.length <= 4) s = left + right;
      else s = left + "." + right;
    }
  }

  if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return { value: negative ? -value : value, negative };
}

function parseLlmAnswer(text) {
  const raw = String(text == null ? "" : text).trim();
  if (!raw) return { kind: "invalid", value: null };

  const cleaned = raw.replace(/```[a-z]*\s*/gi, "").replace(/```/g, "");
  const values = [];
  for (const match of cleaned.matchAll(NUMBER_TOKEN)) {
    const parsed = parseNumericToken(match[0]);
    if (parsed && !parsed.negative) values.push(parsed.value);
  }
  const unique = [...new Set(values)];

  if (unique.length === 1) {
    const value = unique[0];
    if (value === 0) return { kind: "zero", value: 0 };
    if (value > 0) return { kind: "number", value };
  }

  if (unique.length > 1) {
    // A line that contains exactly one number is the model's likely final answer.
    // If several such lines disagree, the reply is ambiguous.
    const lineValues = [];
    for (const line of cleaned.split(/\r?\n/)) {
      const lineMatches = [...line.matchAll(NUMBER_TOKEN)];
      if (lineMatches.length !== 1) continue;
      const parsed = parseNumericToken(lineMatches[0][0]);
      if (parsed && !parsed.negative) lineValues.push(parsed.value);
    }
    const lineUnique = [...new Set(lineValues)];
    if (lineUnique.length === 1) {
      const value = lineUnique[0];
      if (value === 0) return { kind: "zero", value: 0 };
      if (value > 0) return { kind: "number", value };
    }
    return { kind: "invalid", value: null };
  }

  if (/\b(?:cannot|can't|can not|unable|insufficient|not enough|impossible|don'?t know|do not know|no idea|n\/a|not available|unknown|tidak bisa|tidak cukup|tidak tahu|tidak diketahui|tidak ada informasi|belum cukup)\b/i.test(cleaned)) {
    return { kind: "refusal", value: null };
  }
  return { kind: "invalid", value: null };
}

function withinTolerance(guess, truth) {
  return Number.isFinite(guess) && Number.isFinite(truth) && truth > 0 && guess > 0 &&
    Math.abs(guess - truth) <= truth * 0.01;
}

module.exports = { chatText, buildPrompt, parseNumericToken, parseLlmAnswer, withinTolerance };
