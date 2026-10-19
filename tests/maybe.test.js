// Run: node tests/maybe.test.js (offline, no browser or network dependency).
const assert = require("node:assert/strict");
const H = require("../extension/engine/heuristics.js");
const Maybe = require("../extension/engine/maybe.js");
global.fetch = () => { throw new Error("Network forbidden in this test"); };
const turns = (content) => [{ role: "user", content }];
const scan = (content) => Maybe.scan(turns(content));

assert(scan("API_TOKEN=MyR00tPass").some(c => c.raw === "MyR00tPass" && c.risky));
assert(scan("API_TOKEN=OddSecret42.").some(c => c.raw === "OddSecret42"), "sentence punctuation is not the token");
assert(scan("client_secret: 'a short pass phrase'").some(c => c.raw === "a short pass phrase"));
assert(scan("<div>API_TOKEN=OddSecret42</div>").some(c => c.raw === "OddSecret42"), "HTML is text, not an allowlist");
assert(scan("Z8kL2mN7pQ4rS9tU6vW3xY").some(c => !c.risky));
for (const text of ["docker run -p 8080:80 app", "const getElementById = deployment", "token=${API_TOKEN}", "token=[REDACTED_TOKEN]", "token=<S1>", "PORT=8080", "API_KEY_FILE=/tmp/keys", "git show abcdef0123456789abcdef0123456789abcdef01"]) {
  assert.deepEqual(scan(text), [], text);
}
for (const text of ["token_budget=320000", "token_expiry=3600000", "secret_algorithm=sha256", "password_policy=minimum_length",
  "token_type=refresh_token", "secret_rotation=enabled", "token is returned after login."]) assert.deepEqual(scan(text), [], text);
const modelInput = turns("Amelia Hartwell discussed lunch.");
const modelCandidates = Maybe.scan(modelInput, [{ turnIndex: 0, start: 0, end: 15, label: "PERSON", score: 0.28 }]);
assert.equal(modelCandidates.length, 1);
assert.equal(modelCandidates[0].risky, false);
assert.deepEqual(Maybe.apply(modelInput, modelCandidates, new Map()), modelInput);
assert(!Maybe.apply(modelInput, modelCandidates, new Map([["Amelia Hartwell", true]]))[0].content.includes("Amelia"));
// The model tags field labels and our own name as entities (live DeepSeek, Oct 2026); names still go through
const labelText = "My NIK is [NIK_1], I use SafeShare, my friend Sim and NIK holder Rina.";
const spanOf = (w, from = 0) => ({ turnIndex: 0, start: labelText.indexOf(w, from), end: labelText.indexOf(w, from) + w.length, label: "PERSON", score: 0.4 });
const labelCandidates = Maybe.scan(turns(labelText), [spanOf("NIK"), spanOf("SafeShare"), spanOf("Sim"), spanOf("Rina")]).map(c => c.raw);
assert.deepEqual(labelCandidates.sort(), ["Rina", "Sim"], labelCandidates.join(","));
// Amounts behind a money word too misspelled for the amount rules: asked about, never pre-ticked
for (const [text, raw] of [["my slry is 70000", "70000"], ["my slaary is 70.000.000", "70.000.000"], ["gjai saya 7500000", "7500000"], ["incmoe 92000 per year?", "92000"]]) {
  const hit = scan(text).find(c => c.raw === raw);
  assert(hit && !hit.risky && hit.reason.startsWith("Possible amount"), text);
}
for (const text of ["version 2.4.0.1 on port 8080", "person 5521 in line", "I have 3000 steps today", "It was built in 1998 and has 2500 rows",
  "Room 4410 is free", "we drove 1200 km", "token_budget=320000", "my salary is <S1>"]) assert.deepEqual(scan(text), [], text);
// Our own symbols repeated bare by the AI are not suggestions, and never hidden inside <S1>
const symText = "my slary is <S1>. Housing: 0.25 * S1, then NIK_1";
const symSpan = (w, from = 0) => ({ turnIndex: 0, start: symText.indexOf(w, from), end: symText.indexOf(w, from) + w.length, label: "ZIP_CODE", score: 0.23 });
assert.deepEqual(Maybe.scan(turns(symText), [symSpan("S1"), symSpan("S1", 20), symSpan("NIK_1")]), [], "own symbols suggested");
const long = "mN3qT8zW5kR1yP7vL4cX9sF2hJ6dB0aE".repeat(12);
assert(scan(`API_TOKEN=${long}`).some(c => c.raw === long), "long tokens must not disappear");
assert(scan("API_TOKEN=abcdef0123456789abcdef0123456789").some(c => c.risky), "credential context beats hash shape");
const input = [{ role: "user", content: "API_TOKEN=OddSecret42" }, { role: "assistant", content: "Reuse OddSecret42, not OddSecret42suffix." }];
const c = Maybe.scan(input);
assert.equal(c.length, 1);
assert.equal(c[0].occurrences.length, 2);
const hidden = Maybe.apply(input, c, new Map());
assert(!hidden[0].content.includes("OddSecret42"));
assert(hidden[1].content.includes("OddSecret42suffix"), "no substring replacement");
assert.deepEqual(Maybe.apply(input, c, new Map([["OddSecret42", false]])), input);
assert.deepEqual(Maybe.scan(hidden), [], "own placeholders excluded");
// Audit regressions: overlapping selections, numeric credentials, punctuation, exclusions.
const nestedInput = turns('client_secret="alpha Z8kL2mN7pQ4rS9tU6vW3xY omega"');
const nested = Maybe.scan(nestedInput);
assert.equal(nested.length, 2);
assert.equal(Maybe.apply(nestedInput, nested, new Map(nested.map(c => [c.raw, true])))[0].content,
  'client_secret="[REDACTED_POSSIBLE_SECRET_1]"', "outer selection wins over inner match");
assert.equal(Maybe.apply(nestedInput, nested, new Map([[nested[0].raw, false], [nested[1].raw, true]]))[0].content,
  'client_secret="alpha [REDACTED_POSSIBLE_SECRET_2] omega"', "inner-only selection remains possible");
for (const text of ["API_TOKEN=123456", "secret_key=123456"]) {
  const found = scan(text);
  assert(found.some(c => c.raw === "123456" && c.risky));
  assert(!Maybe.apply(turns(text), found, new Map())[0].content.includes("123456"));
}
const repeated = turns("API_TOKEN=OddSecret42\nEcho .OddSecret42 /OddSecret42 https://example.test/OddSecret42/end OddSecret42suffix");
const repeats = Maybe.scan(repeated);
assert.equal(repeats.find(c => c.raw === "OddSecret42").occurrences.length, 4);
assert.equal((Maybe.apply(repeated, repeats, new Map())[0].content.match(/REDACTED_POSSIBLE_SECRET_1/g) || []).length, 4);
assert(Maybe.apply(repeated, repeats, new Map())[0].content.includes("OddSecret42suffix"));
const variable = turns("token=${ABC123} API_TOKEN=ABC123");
const variables = Maybe.scan(variable);
assert.equal(variables[0].occurrences.length, 1);
assert.equal(Maybe.apply(variable, variables, new Map())[0].content,
  "token=${ABC123} API_TOKEN=[REDACTED_POSSIBLE_SECRET_1]", "exclusions apply to every occurrence");
assert.deepEqual(Maybe.apply([{ role: "user", content: "API_TOKEN=ОddSecret42" }], Maybe.scan(turns("API_TOKEN=ОddSecret42")), new Map()),
  [{ role: "user", content: "API_TOKEN=[REDACTED_POSSIBLE_SECRET_1]" }], "normalized offsets match application");

// Exercise the real modal rebuild, publication handler and encrypt/decrypt roundtrip.
global.HeuristicsRedactor = H;
global.ContextualClassifier = require("../extension/engine/contextual.js");
global.ConsistentPseudonymizer = require("../extension/engine/pseudonymizer.js");
global.SafeShareCrypto = require("../extension/engine/crypto.js");
global.SafeSharePolicy = require("../extension/engine/policy.js");
const elements = new Map();
function element(id) {
  return { id, innerHTML: "", innerText: "", textContent: "", style: {}, disabled: false, value: "86400", children: [],
    appendChild(child) { this.children.push(child); }, setAttribute() {}, getAttribute() { return ""; }, remove() {}, focus() {},
    addEventListener(name, fn) { this[name] = fn; }, querySelectorAll() { return []; },
    querySelector(selector) { return get(selector.replace(/^#/, "")); }, classList: { toggle() {}, add() {}, remove() {} } };
}
function get(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); }
global.document = { getElementById: get, createElement: element, querySelector: get };
global.window = { confirm: () => true };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const Modal = require("../extension/ui/modal.js");

(async () => {
  const modal = new Modal();
  modal.currentTurns = [
    { role: "user", content: "My salary is USD 5,000 per month. access_token: OddSecret42. Email аlice@example.com" },
    { role: "assistant", content: "At 20% you save USD 1,000 per month or USD 12,000 per year. OddSecret42" }
  ];
  modal.runPipeline();
  assert(!JSON.stringify(modal.sanitizedTurns).includes("solverLeaks"), "private detector metadata stripped");
  assert(!modal.sanitizedTurns[0].content.includes("аlice@example.com"), "homoglyph remains hidden");
  assert.equal(global.SafeSharePolicy.invert(modal.sanitizedTurns.map(t => t.content).join("\n")).length, 0);
  modal.maybeChoices.set("OddSecret42", false);
  modal.rebuildViews();
  assert(modal.sanitizedTurns.some(t => t.content.includes("OddSecret42")), "explicit keep survives safety scan");
  let confirmed = 0;
  window.confirm = () => { confirmed++; return false; };
  modal.bindEvents(get("backdrop"));
  await get("btn-encrypt-publish").click();
  assert.equal(confirmed, 1);
  assert.equal(modal.publishing, false, "cancel never uploads");
  window.confirm = () => true;
  modal.maybeChoices.set("OddSecret42", true);
  modal.rebuildViews();
  const preview = JSON.parse(JSON.stringify(modal.sanitizedTurns));
  let encrypted;
  const encrypt = modal.crypto.encrypt.bind(modal.crypto);
  modal.crypto.encrypt = async (payload) => {
    assert.equal(modal.publishing, true);
    assert.deepEqual(payload.turns, preview);
    encrypted = await encrypt(payload);
    return encrypted;
  };
  global.browser = { storage: { local: { get: async () => ({}) } }, runtime: { sendMessage: async () => ({ success: true, data: { revoke_token: "fake" } }) } };
  await get("btn-encrypt-publish").click();
  assert(encrypted, "publication encrypted the preview");
  const decrypted = await modal.crypto.decrypt(encrypted.ciphertext, encrypted.key);
  assert.deepEqual(decrypted.turns, preview);
  assert(decrypted.turns.every(t => Object.keys(t).sort().join() === "content,role"));
  assert(!JSON.stringify(decrypted).includes("USD 12,000"), "no secret in metadata");
  const reset = new Modal();
  reset.currentTurns = turns("access_token: OddSecret42 Z8kL2mN7pQ4rS9tU6vW3xY");
  reset.runPipeline();
  reset.bindEvents(get("backdrop"));
  get("btn-deselect-all-cands").click();
  assert(reset.sanitizedTurns[0].content.includes("OddSecret42"));
  get("btn-reset-default").click();
  assert(!reset.sanitizedTurns[0].content.includes("OddSecret42"));
  assert(reset.sanitizedTurns[0].content.includes("Z8kL2mN7pQ4rS9tU6vW3xY"), "reset leaves uncertain suggestions optional");
  get("btn-deselect-all-cands").click();
  get("btn-select-all-cands").click();
  assert(!reset.sanitizedTurns[0].content.includes("OddSecret42"));
  assert(!reset.sanitizedTurns[0].content.includes("Z8kL2mN7pQ4rS9tU6vW3xY"), "explicit protect-all still selects uncertain suggestions");
  const badges = new Modal();
  badges.currentTurns = [
    { role: "user", content: "My salary is USD 5,000 per month." },
    { role: "assistant", content: "At 13% allocate USD 650; at 17% allocate USD 850; annually USD 7,800 and USD 10,200." }
  ];
  badges.runPipeline();
  for (const raw of ["USD 650", "USD 850", "USD 7,800", "USD 10,200"]) {
    const candidate = badges.candidates.find(c => c.raw === raw);
    assert(candidate, raw);
    assert(get("diff-box-sanitized").innerHTML.includes(`data-cand-id="${candidate.id}"`), `correct badge for ${raw}`);
  }
  assert(badges.sanitizedTurns.every(t => !Object.hasOwn(t, "solverLeaks")));
  modal.removeExisting();
  assert.equal(modal.maybeChoices.size, 0);
  assert.deepEqual(modal.sanitizedTurns, []);
  assert.deepEqual(new Modal().maybeCandidates, []);
  const snippets = new Modal();
  snippets.currentTurns = turns("access_token: OddSecret42 next_token: AnotherPrivate43");
  snippets.runPipeline();
  const rows = get("safeshare-maybe-items").children.slice(-2);
  assert(rows[0].children[1].textContent.includes("[POSSIBLE_SECRET]"), "nearby candidate masked in snippet");
  assert(!rows[0].children[1].textContent.includes("AnotherPrivate43"), "other raw candidates not exposed in context");
  const trusted = new Modal();
  trusted.profile = "trusted";
  trusted.currentTurns = turns("access_token: OddSecret42");
  trusted.runPipeline();
  assert(!trusted.sanitizedTurns[0].content.includes("OddSecret42"), "trusted still hides suggested credentials");
  trusted.crypto.encrypt = async () => { throw new Error("expected test failure"); };
  trusted.bindEvents(get("backdrop"));
  const logError = console.error;
  console.error = () => {};
  try { await get("btn-encrypt-publish").click(); } finally { console.error = logError; }
  assert.equal(trusted.publishing, false, "failed publish unlocks review");
  console.log("maybe: detection, choices, normalization, preview/payload equality and cleanup passed");
})().catch(err => { console.error(err); process.exitCode = 1; });

// Context score: on top of the detectors, ranks the list and pre-ticks strong candidates
{
  const Maybe = require("../extension/engine/maybe.js");
  const top = (content) => Maybe.scan([{ role: "user", content }])[0];
  const plain = top("Keep Z8kL2mN7pQ4rS9tU6vW3xY for later");
  const keyed = top("my api key: Z8kL2mN7pQ4rS9tU6vW3xYa (rotated)");
  assert(plain.score < 0.75 && !plain.risky, "random string alone: shown, not pre-ticked");
  assert(keyed.score >= 0.75 && keyed.risky, "random string after a credential word: pre-ticked");
  assert(keyed.why.includes("credential word just before it"));
  assert(top("example key sample_ab12CD34ef56GH78ij90 here").score < keyed.score, "example wording lowers the score");
  assert.strictEqual(Maybe.scan([{ role: "user", content: "PGPASSWORD='[PASSWORD_1]' psql" }]).length, 0, "numbered placeholders skipped");
  const list = Maybe.scan([{ role: "user", content: "x Q7wE2rT9yU4iO1pA6sD3fG8h and token: Z9mL4pR8tN2kV7bQ5sX3dF6wJ1hC0aE" }]);
  assert(list[0].score >= list[1].score, "sorted by score");
}
console.log("maybe: context score checks passed");
