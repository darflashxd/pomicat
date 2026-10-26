// Run: node tests/contextual_percent.test.js (offline, no browser or network dependency).
const assert = require("node:assert/strict");
const ContextualClassifier = require("../extension/engine/contextual.js");

const classifier = new ContextualClassifier();
const text = "My take-home pay is $4,800 a month. I want to save 25%, spend 15% on hobbies, and use 60% for bills.";
const detected = classifier.classifyTurn(text, 0);
const raws = detected.map((d) => d.raw.trim());

// The salary is the secret; the allocation percentages are ratios and must stay visible.
assert(raws.includes("$4,800"), "the salary must still be detected");
for (const pct of ["15", "25", "60"]) {
  assert(!raws.includes(pct), `"${pct}%" is a ratio, not an expense amount`);
}
assert(!detected.some((d) => /^15\s*%?$/.test(d.raw.trim())), "15% must not be redacted");
assert(!detected.some((d) => /^15$/.test(d.raw.trim())), "the bare 15 from 15% must not be redacted");

// A real short expense next to a verb still has to be caught.
const realExpense = classifier.classifyTurn("My rent is 600 a month.", 0);
assert(realExpense.some((d) => d.raw.trim() === "600"), "a bare short expense must still be detected");

console.log("contextual percent: PASS");
