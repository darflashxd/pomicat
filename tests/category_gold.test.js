// Run: node tests/category_gold.test.js
// The fictional per-category set (tools/eval/category_gold.jsonl): every labelled value must be
// gone from the share copy, and the safe sentences must come through unchanged.
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { redactTurns } = require("../bin/pomicat.js");

const rows = fs.readFileSync(path.join(__dirname, "../tools/eval/category_gold.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const counts = {};
for (const row of rows) {
  const out = redactTurns([{ role: "user", content: row.source_text }])[0].content;
  const c = (counts[row.category] ||= { values: 0, caught: 0 });
  for (const { value } of row.privacy_mask) {
    c.values++;
    if (!out.includes(value)) c.caught++;
    else assert.fail(`${row.id}: "${value}" survived in: ${out}`);
  }
  if (row.category === "SAFE") assert.equal(out, row.source_text, `${row.id}: safe sentence changed`);
}
console.log("category set passed: " + Object.entries(counts).map(([k, v]) => k === "SAFE" ? `SAFE ${rows.filter(r => r.category === "SAFE").length} unchanged` : `${k} ${v.caught}/${v.values}`).join(", "));
