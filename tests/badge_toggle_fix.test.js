// Run: node tests/badge_toggle_fix.test.js (offline test for interactive badge clickability & sync).
const assert = require("node:assert/strict");

Object.assign(global, {
  HeuristicsRedactor: require("../extension/engine/heuristics.js"),
  ContextualClassifier: require("../extension/engine/contextual.js"),
  ConsistentPseudonymizer: require("../extension/engine/pseudonymizer.js"),
  SafeShareCrypto: require("../extension/engine/crypto.js"),
  SafeSharePolicy: require("../extension/engine/policy.js")
});

const elements = new Map();
function element(id) {
  const el = {
    _id: id || "",
    get id() { return this._id; },
    set id(val) { this._id = val; if (val) elements.set(val, this); },
    innerHTML: "", innerText: "", textContent: "", style: {}, disabled: false, value: "86400", children: [],
    appendChild(child) { this.children.push(child); },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] || ""; },
    remove() {}, focus() {},
    addEventListener(name, fn) { this[name] = fn; if (name === "click") this.click = fn; },
    querySelectorAll() { return []; },
    querySelector(selector) { return get(selector.replace(/^#/, "")); },
    classList: { toggle(c, v) { this[c] = v; }, add(c) { this[c] = true; }, remove(c) { this[c] = false; } }
  };
  if (id) elements.set(id, el);
  return el;
}
function get(id) {
  if (!elements.has(id)) elements.set(id, element(id));
  return elements.get(id);
}

global.document = {
  getElementById: get,
  createElement: element,
  querySelector: get,
  addEventListener() {}
};
global.window = { confirm: () => true, getSelection: () => null };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const Modal = require("../extension/ui/modal.js");

(async () => {
  console.log("================================================================================");
  console.log("   SAFESHARE-AI: INTERACTIVE BADGE TOGGLE & CATEGORY SYNC AUDIT");
  console.log("================================================================================");

  // 1. Test: Chat with ONLY a maybe-candidate (service_token assignment)
  const modal1 = new Modal();
  modal1.currentTurns = [{ role: "user", content: 'service_token="Tok98xLm7Q2wP4aZ1"' }];
  modal1.runPipeline();

  // Verify categories and customize count are NEVER 0 when items are detected/suggested
  assert.equal(modal1.candidates.length, 1, "Candidates must include synced maybe candidate");
  assert(get("inspector-btn-text").innerText.includes("Customize (1)"), "Customize button must display correct count (1)");
  assert(get("drawer-counter").innerText.includes("1 of 1 protected"), "Drawer counter must display 1 of 1 protected");
  assert.equal(get("policy-pills-list").children.length, 1, "Policy categories must render category pill");

  // Verify badge in preview is an interactive .ss-badge-redacted, NOT an inert .ss-placeholder
  const previewHtml1 = get("diff-box-sanitized").innerHTML;
  assert(previewHtml1.includes("ss-badge-redacted"), "Preview must wrap maybe-candidate in interactive ss-badge-redacted");
  assert(previewHtml1.includes("data-cand-id=\"maybe_1\""), "Badge must have valid data-cand-id");
  assert(!previewHtml1.includes("ss-placeholder"), "Must NOT fall back to inert ss-placeholder");

  // 2. Test: Badge click unmasks the maybe candidate
  const cand1 = modal1.candidates.find(c => c.id === "maybe_1");
  assert(cand1, "Candidate must exist");
  modal1.setCandidateEnabled(cand1, false);
  modal1.rebuildViews();

  const previewUnmasked1 = get("diff-box-sanitized").innerHTML;
  assert(previewUnmasked1.includes("ss-badge-unmasked"), "Unmasked item must render ss-badge-unmasked");
  assert(previewUnmasked1.includes("Tok98xLm7Q2wP4aZ1"), "Unmasked item must reveal original text in preview");

  // Re-redact via badge
  modal1.setCandidateEnabled(cand1, true);
  modal1.rebuildViews();
  const previewRemasked1 = get("diff-box-sanitized").innerHTML;
  assert(previewRemasked1.includes("ss-badge-redacted"), "Remasked item must render ss-badge-redacted");
  assert(modal1.sanitizedTurns[0].content.includes("[REDACTED_POSSIBLE_SECRET_1]"), "Remasked item must hide original text in sanitized turns");

  // 3. Test: Email address [user_xxx@protected.local] renders as interactive badge
  const modal2 = new Modal();
  modal2.currentTurns = [{ role: "user", content: "Contact me at alice.smith@corp.example.com." }];
  modal2.runPipeline();

  const previewHtml2 = get("diff-box-sanitized").innerHTML;
  assert(previewHtml2.includes("ss-badge-redacted"), "Email replacement must be wrapped in interactive ss-badge-redacted");
  const emailCand = modal2.candidates.find(c => c.category === "PROFILE");
  assert(emailCand, "Email candidate must exist");

  // Unmask email
  modal2.setCandidateEnabled(emailCand, false);
  modal2.rebuildViews();
  const previewUnmasked2 = get("diff-box-sanitized").innerHTML;
  assert(previewUnmasked2.includes("ss-badge-unmasked"), "Unmasked email must render ss-badge-unmasked");
  assert(modal2.sanitizedTurns[0].content.includes("alice.smith@corp.example.com"), "Unmasked email must show raw email in content");

  // Re-mask email
  modal2.setCandidateEnabled(emailCand, true);
  modal2.rebuildViews();
  const previewRemasked2 = get("diff-box-sanitized").innerHTML;
  assert(previewRemasked2.includes("ss-badge-redacted"), "Remasked email must render ss-badge-redacted");
  assert(modal2.sanitizedTurns[0].content.includes("[user_"), "Remasked email must hide raw email");

  // 4. Test: Re-redacting when category is toggled off re-enables the category
  modal2.activeCategories.delete("PROFILE");
  modal2.setCandidateEnabled(emailCand, false);
  modal2.rebuildViews();
  assert(get("diff-box-sanitized").innerHTML.includes("ss-badge-unmasked"), "Should be unmasked when category is off");

  // Simulate user clicking unmasked badge to re-redact it
  modal2.setCandidateEnabled(emailCand, true);
  modal2.rebuildViews();
  assert(get("diff-box-sanitized").innerHTML.includes("ss-badge-redacted"), "Re-redacting must successfully re-mask even if category was off");

  console.log("  [✓] All badge toggle & category sync tests passed!");
})();
