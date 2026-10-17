// Run: node tests/manual_redact.test.js (offline test for Manual Selection & Maybe Actions).
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
    set id(val) {
      this._id = val;
      if (val) elements.set(val, this);
    },
    innerHTML: "",
    innerText: "",
    textContent: "",
    style: {},
    disabled: false,
    value: "86400",
    children: [],
    appendChild(child) { this.children.push(child); },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] || ""; },
    remove() {},
    focus() {},
    addEventListener(name, fn) {
      this[name] = fn;
      if (name === "click") this.click = fn;
    },
    querySelectorAll() { return []; },
    querySelector(selector) { return get(selector.replace(/^#/, "")); },
    classList: {
      toggle(c, v) { this[c] = v; },
      add(c) { this[c] = true; },
      remove(c) { this[c] = false; }
    }
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
global.window = {
  confirm: () => true,
  getSelection: () => null
};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const Modal = require("../extension/ui/modal.js");

(async () => {
  const modal = new Modal();
  modal.currentTurns = [
    { role: "user", content: "We are deploying AlphaPrime and ClusterOmega across regions." },
    { role: "assistant", content: "Understood. For AlphaPrime and ClusterOmega, configure replication." }
  ];

  modal.runPipeline();

  // Initially, 'AlphaPrime' and 'ClusterOmega' are not sensitive PII so they remain unredacted
  assert(modal.sanitizedTurns[0].content.includes("AlphaPrime"));
  assert(modal.sanitizedTurns[1].content.includes("AlphaPrime"));

  // 1. User highlights and redacts 'AlphaPrime' manually
  modal.addCustomSelection("AlphaPrime");

  // Verify candidate registration
  const customCand = modal.candidates.find(c => c.category === "CUSTOM" && c.raw === "AlphaPrime");
  assert(customCand, "Custom candidate must be registered in candidates list");
  assert.equal(customCand.tag, "[REDACTED_CUSTOM_1]");
  assert.equal(customCand.enabled, true);

  // Verify multi-turn masking
  assert(!modal.sanitizedTurns[0].content.includes("AlphaPrime"), "User turn must redact AlphaPrime");
  assert(!modal.sanitizedTurns[1].content.includes("AlphaPrime"), "Assistant turn must redact AlphaPrime");
  assert(modal.sanitizedTurns[0].content.includes("[REDACTED_CUSTOM_1]"), "Must replace with custom tag");
  assert(modal.sanitizedTurns[1].content.includes("[REDACTED_CUSTOM_1]"), "Must replace in assistant turn with custom tag");

  // 2. User also redacts 'ClusterOmega'
  modal.addCustomSelection("ClusterOmega");
  assert(!modal.sanitizedTurns[0].content.includes("ClusterOmega"));
  assert(!modal.sanitizedTurns[1].content.includes("ClusterOmega"));
  assert(modal.sanitizedTurns[0].content.includes("[REDACTED_CUSTOM_2]"));

  // 3. User un-redacts AlphaPrime (toggle off)
  customCand.enabled = false;
  modal.rebuildViews();
  assert(modal.sanitizedTurns[0].content.includes("AlphaPrime"), "Untoggled custom redaction must reveal raw text");
  assert(modal.sanitizedTurns[1].content.includes("AlphaPrime"));
  assert(!modal.sanitizedTurns[0].content.includes("ClusterOmega"), "Other custom redaction must remain active");

  // 4. Test Maybe Sensitive Bulk actions with real scanned maybe-candidates (high-entropy tokens)
  modal.currentTurns = [
    { role: "user", content: "Random tokens: Z8kL2mN7pQ4rS9tU6vW3xY and K9mP3qR8vT1wX4yA7bC0dE here." }
  ];
  modal.runPipeline();

  assert.equal(modal.maybeCandidates.length, 2, "Should detect 2 high-entropy tokens as maybe candidates");

  const cand1 = modal.maybeCandidates[0];
  const cand2 = modal.maybeCandidates[1];

  // Bulk Protect All
  const btnAll = get("btn-maybe-protect-all");
  assert(btnAll, "Bulk Protect All button must exist");
  btnAll.click();
  assert.equal(modal.maybeChoices.get(cand1.raw), true);
  assert.equal(modal.maybeChoices.get(cand2.raw), true);

  // Bulk Unprotect All
  const btnNone = get("btn-maybe-unprotect-all");
  assert(btnNone, "Bulk Unprotect All button must exist");
  btnNone.click();
  assert.equal(modal.maybeChoices.get(cand1.raw), false);
  assert.equal(modal.maybeChoices.get(cand2.raw), false);

  // 5. Test checkLocalModel() updates modelState and populates maybeCandidates
  global.SafeShareNer = {
    analyze: async () => ({
      success: true,
      spans: [
        { start: 0, end: 13, label: "PERSON", score: 0.85 }
      ]
    })
  };
  modal.currentTurns = [
    { role: "user", content: "Hendra Wijaya will join the team." }
  ];
  modal.runPipeline();
  await modal.checkLocalModel(false);
  assert(modal.maybeCandidates.some(c => c.raw === "Hendra Wijaya"), "Local model candidate must appear in maybeCandidates");
  assert.equal(modal.modelState, "✓ Local AI model checked");

  console.log("manual redact: custom text selection, multi-turn masking, unmasking, maybe bulk actions, and checkLocalModel passed!");
})();
