// node tests/bank_review.test.js — stable hard-entity identities, no real banking data.
const assert = require("node:assert/strict");
Object.assign(global, {
  HeuristicsRedactor: require("../extension/engine/heuristics.js"),
  ContextualClassifier: require("../extension/engine/contextual.js"),
  ConsistentPseudonymizer: require("../extension/engine/pseudonymizer.js"),
  SafeShareCrypto: require("../extension/engine/crypto.js"),
  SafeSharePolicy: require("../extension/engine/policy.js")
});
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
const modal = new Modal();
modal.numbersMode = "range";
modal.currentTurns = [
  { role: "user", content: "My checking account is WF-990218374 and my savings is WF-771122883. My loan is SOFI-99821174. My debit card ending 4417, exp 08/27, CVV 339." },
  { role: "assistant", content: "Your card expiration means August 2027. Conference planned for August 2027.\n\nBilling address: [have address ready]" },
  { role: "user", content: "My SoFi loan SOFI-99821174 is on autopay from WF-990218374." }
];
modal.runPipeline();
const ids = ["WF-990218374", "WF-771122883", "SOFI-99821174"].map(raw => modal.candidates.find(c => c.raw === raw));
assert(ids.every(Boolean));
assert.equal(new Set(ids.map(c => c.tag)).size, 3, "each account gets its own tag");
assert(modal.sanitizedTurns[2].content.includes(ids[0].tag));
assert(modal.sanitizedTurns[2].content.includes(ids[2].tag));
assert(!modal.sanitizedTurns.some(t => /2k–5k|4417/.test(t.content)), "card digits are identifiers, never money");
assert(modal.sanitizedTurns[1].content.includes("[have address ready]"), "instruction is not an address");
assert(!modal.sanitizedTurns[1].content.includes("expiration means August 2027"), "month-name expiry hidden");
assert(modal.sanitizedTurns[1].content.includes("Conference planned for August 2027"), "unrelated date preserved");
for (const candidate of ids) {
  modal.candidates.forEach(c => { c.enabled = true; });
  candidate.enabled = false;
  modal.rebuildViews();
  const output = modal.sanitizedTurns.map(t => t.content).join("\n");
  assert(output.includes(candidate.raw), "selected ID revealed");
  for (const other of ids.filter(c => c !== candidate)) assert(!output.includes(other.raw), "other IDs stay hidden");
  assert(!get("diff-box-sanitized").innerHTML.includes('data-cand-id="c_tag"'));
}
const baseline = new HeuristicsRedactor();
assert(baseline.scan("My card ending 4417").sanitizedText.includes("[REDACTED_CARD_LAST_4]"));
assert.equal(baseline.scan("Billing address: [have address ready]").sanitizedText, "Billing address: [have address ready]");
const birth = new Modal();
birth.currentTurns = [{ role: "user", content: "My birthday is May 5 1998. I am 28 years old." }];
birth.runPipeline();
assert(!birth.sanitizedTurns[0].content.includes("28"), "numbered DOB tags keep age-inference defense");
console.log("bank review: distinct IDs, cross-turn aliases, individual reveals, last-four and address placeholders passed");
