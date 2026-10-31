// node tests/range_review.test.js: user's IDR equation/table and toggle regressions.
const assert = require("node:assert/strict");
const H = require("../extension/engine/heuristics.js");
const P = require("../extension/engine/pseudonymizer.js");
const T = require("../extension/engine/transcript.js");
Object.assign(global, { HeuristicsRedactor: H, ConsistentPseudonymizer: P,
  ContextualClassifier: require("../extension/engine/contextual.js"),
  SafeShareCrypto: require("../extension/engine/crypto.js"), SafeSharePolicy: require("../extension/engine/policy.js") });
const elements = new Map();
const get = id => {
  if (!elements.has(id)) elements.set(id, { innerHTML: "", style: {}, children: [],
    querySelectorAll: () => [], querySelector: () => ({ addEventListener() {} }), addEventListener() {}, setAttribute() {},
    appendChild(c) { this.children.push(c); } });
  return elements.get(id);
};
global.document = { getElementById: get, createElement: get };
global.localStorage = { getItem: () => null };
const Modal = require("../extension/ui/modal.js");
const m = new Modal();
m.numbersMode = "range";
m.currentTurns = [
  { role: "user", content: "Gaji saya Rp 3.000.000 per bulan. Target menabung 30%." },
  { role: "assistant", content: T.normalize(String.raw`Dengan gaji Rp 3.000.000 per bulan.
## 1. Tabungan per bulan
\[ 30\% \times Rp\,3.000.000 = Rp\,900.000 \]
Tabungan per bulan adalah Rp 900.000.
## 2. Sisa uang per bulan
\[ Rp\,3.000.000-Rp\,900.000=Rp\,2.100.000 \]
Sisa uang setelah menabung adalah Rp 2.100.000 per bulan.
## 3. Akumulasi tabungan selama 12 bulan
\[12\times Rp\,900.000=Rp\,10.800.000\]
| Periode | Total tabungan |
| --- | --- |
| 1 bulan | Rp 900.000 |
| 3 bulan | Rp 2.700.000 |
| 6 bulan | Rp 5.400.000 |
| 12 bulan | Rp 10.800.000 |`) }
];
m.runPipeline();
assert(get("diff-box-sanitized").innerHTML.includes("<table>"));
assert(get("diff-box-sanitized").innerHTML.includes("<h2>"));
assert(/data-cand-id="c_\d+"[^>]+title="Click to show exact amount"/.test(get("diff-box-sanitized").innerHTML));
for (const value of [3000000, 900000, 2100000, 10800000]) {
  m.candidates.forEach(c => { c.enabled = true; });
  const candidate = m.candidates.find(c => c.category === "FINANCIAL" && !c.raw.startsWith("[") && m.pseudonymizer.parseFinancialValue(c.raw) === value);
  assert(candidate, `candidate ${value}`);
  candidate.enabled = false;
  m.rebuildViews();
  const contents = m.sanitizedTurns.map(t => t.content).join("\n");
  assert(contents.includes(value.toLocaleString("id-ID")), `intentional reveal respected for ${value}: ${contents}`);
  const expectedCount = m.currentTurns.map(t => t.content).join("\n").split(value.toLocaleString("id-ID")).length - 1;
  assert.equal(contents.split(value.toLocaleString("id-ID")).length - 1, expectedCount, `all exact occurrences revealed for ${value}`);
  assert(!get("diff-box-sanitized").innerHTML.includes('data-cand-id="c_tag"'));
}
const solver = new P.AdversaryOracleSolver();
assert.equal(solver.solveAndRedact("Rp 2.100.000", [3000000], ["rp 2.100.000"]), "Rp 2.100.000");
assert.equal(solver.solveAndRedact("2,100,000", [3000000], ["Rp 2.100.000"]), "2,100,000");
assert(T.normalize(String.raw`\[ 30\% \times Rp\,3.000.000 \]`).includes("30% × Rp 3.000.000"));
assert.equal(T.normalize('`\\times`'), '`\\times`', "code is not math");
assert(!T.renderEscaped(m.escapeHtml('<img src=x onerror=alert(1)>')).includes("<img"));
console.log("range review: IDR toggles, stable badges, range badge, safe headings/tables/math passed");
