// Run offline: node tests/international_numbers.test.js
const assert = require("node:assert/strict");
const P = require("../extension/engine/pseudonymizer.js");
const Policy = require("../extension/engine/policy.js");
const p = new P();
const solver = new P.AdversaryOracleSolver();
const parse = raw => p.parseFinancialValue(raw);
const near = (actual, expected, label) => assert(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`);

const amounts = [
  ["USD 5,000.50", 5000.5], ["EUR3.200,50", 3200.5],
  ["Rp 28.500.000", 28500000], ["$150,000", 150000],
  ["1,234,567.89", 1234567.89], ["1.234.567,89", 1234567.89],
  ["GBP 1234.56", 1234.56], ["EUR 1234,56", 1234.56],
  ["EUR 12 345,67", 12345.67], ["EUR 12\u00a0345,67", 12345.67],
  ["EUR 12\u202f345,67", 12345.67], ["CHF 12'345.67", 12345.67], ["CHF 12’345.67", 12345.67],
  ["28,5 juta", 28500000], ["15jt", 15000000], ["90k", 90000],
  ["2.5 miliar", 2500000000], ["2,5 milyar", 2500000000], ["1.25 billion", 1250000000],
  ["1,234.5 million", 1234500000], ["1.234,5 juta", 1234500000],
  ["2.5 crore", 25000000], ["2,5 lakhs", 250000], ["12 lpa", 1200000],
  ["1.5 rb", 1500], ["1,5 ribu", 1500], ["2 thousand", 2000],
  ["half a mil", 500000], ["0.0005k", 0.5],
  ["1,234", 1234], ["1.234", 1234], ["1.234k", 1234000],
  ["0.123", 0.123], ["0,123", 0.123], ["1234.567", 1234.567],
  ["(USD 5,000.50)", -5000.5], ["(2,5 juta)", -2500000],
  ["-EUR 3.200,50", -3200.5], ["USD -5,000.50", -5000.5], ["−90k", -90000],
  ["Rp 3.000.000/month", 3000000], ["take-home USD 5,000.50", 5000.5]
];
for (const [raw, value] of amounts) {
  near(parse(raw), value, raw);
  const tokens = solver.lexNumericSpans(raw);
  assert.equal(tokens.length, 1, `single token: ${raw}`);
  near(tokens[0].val, Math.abs(value), `solver ${raw}`);
  assert.equal(raw.slice(tokens[0].start, tokens[0].end), tokens[0].raw);
}
for (const raw of [null, undefined, 123, {}, "", "USD", "NaN", "Infinity", "1,23,456", "1.2.3", "10.244.0.15", "1,234.567.89", "5,000–10,000", "5000-10000", "$5k to $10k", "5 / 10"]) {
  assert.equal(parse(raw), 0, `invalid/ambiguous: ${raw}`);
}
near(solver.lexNumericSpans("49,8%")[0].val, 0.498, "percentage");
assert.deepEqual(solver.lexNumericSpans("10.244.0.15 1-800-869-3557 12 months 8 mg/dl"), [], "technical/phone/unit exclusions unchanged");

// Use the production range policy with explicit entities; no detector/network dependency.
for (const [raw, label, bounds] of [
  ["USD 5,000.50", "$5k–$10k", [5000, 10000]],
  ["EUR3.200,50", "€2k–€5k", [2000, 5000]],
  ["Rp 28.500.000", "Rp 20–50 juta", [20000000, 50000000]],
  ["GBP 12,345.67", "£10k–£20k", [10000, 20000]]
]) {
  const entity = new P();
  const placeholder = entity.getPseudonym(raw, "SENSITIVE_FINANCIAL");
  assert.deepEqual(Policy.bucket(parse(raw)), bounds, raw);
  const turns = Policy.generalizeNumbers([{ role: "user", content: placeholder }], entity, new Set([raw.toLowerCase()]));
  assert.equal(turns[0].content, label, raw);
}
assert.equal(solver.solveAndRedact("EUR 3.200,50", [3200.5], ["USD 3,200.50"]), "EUR 3.200,50", "cross-format intentional reveal");
assert(!solver.solveAndRedact("USD 5,000.50", [5000.5]).includes("5,000.50"), "decimal echo removed");
const patterns = p.buildEquivalenceVariants("USD 5,000.50", "SENSITIVE_FINANCIAL").map(s => new RegExp(s, "i"));
assert(patterns.some(re => re.test("5.000,5")), "cross-locale variant");
assert(!patterns.some(re => re.test("5,000X5") || re.test("5000X5")), "decimal dots never regex wildcards");
// Indian grouping and dollar prefixes: "I earn ₹18,00,000 per annum", "S$7,500 monthly"
for (const [raw, value] of [["₹18,00,000", 1800000], ["Rs 1,50,000", 150000], ["₹1,50,00,000", 15000000], ["INR 18,00,000", 1800000], ["S$7,500", 7500]]) near(parse(raw), value, raw);
{
  const { redactTurns } = require("../bin/pomicat.js");
  const out = redactTurns([
    { role: "user", content: "I earn ₹18,00,000 per annum. How much is that per month?" },
    { role: "assistant", content: "That is ₹1,50,000 a month." },
    { role: "user", content: "I also earn S$7,500 monthly from a side job." }
  ]).map(t => t.content).join("\n");
  for (const leak of ["18,00,000", "1,50,000", "7,500", "₹["]) assert(!out.includes(leak), `${leak} left in: ${out}`);
}
console.log("international numbers: parsing, units, ambiguity, solver spans and ranges passed");
