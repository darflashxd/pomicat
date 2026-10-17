// node tools/eval/maybe.js [local-wildchat.jsonl]
// Offline: synthetic screening, not an estimate of real-world detection accuracy.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const H = require("../../extension/engine/heuristics.js");
const Maybe = require("../../extension/engine/maybe.js");
const h = new H();
const examples = [
  ["API_TOKEN=StrangeInternal42", "StrangeInternal42"],
  ['{"access_token":"smallHumanPassword"}', "smallHumanPassword"],
  ["client_secret: 'a human pass phrase'", "a human pass phrase"],
  ["password = predictable", "predictable"],
  ["token is abcdef0123456789abcdef0123456789", "abcdef0123456789abcdef0123456789"],
  ["APP_TOKEN=Z9mL4pR8tN2kV7bQ5sX3dF6wJ1hC0aE", "Z9mL4pR8tN2kV7bQ5sX3dF6wJ1hC0aE"],
  ["Keep Z8kL2mN7pQ4rS9tU6vW3xY for later", "Z8kL2mN7pQ4rS9tU6vW3xY"],
  ["api_token: 'short12'", "short12"],
  ["sshpаss -p hunter2 ssh host", "hunter2"], // known limit: no command parser
  ["API_TOKEN=" + "aB3dE7gH9jK2mN5qR8tV0xZ4".repeat(15), "aB3dE7gH9jK2mN5qR8tV0xZ4".repeat(15)]
];
const safe = [
  "docker run -p 8080:80 nginx:latest", "kubectl --port 5432", "PORT=8080",
  "git show abcdef0123456789abcdef0123456789abcdef01", "uuid 550e8400-e29b-41d4-a716-446655440000",
  "const getElementById = deployment", "token=${API_TOKEN}", "token=<S1>", "token=[REDACTED_TOKEN]",
  "API_KEY_FILE=/tmp/credentials", "public_key=abcdef0123456789abcdef0123456789", "token_endpoint=https://example.com/oauth",
  "SHA256 abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "I change my password regularly.", "SELECT id FROM users WHERE id=123 LIMIT 100", "The weather is pleasant.",
  "API_TOKEN_NAME=deployment", "request_id=550e8400-e29b-41d4-a716-446655440000"
];
let baseline = 0, additional = 0;
const missed = [];
for (const [text, secret] of examples) {
  const content = h.scan(text).sanitizedText;
  if (!content.includes(secret)) { baseline++; continue; }
  const candidates = Maybe.scan([{ role: "user", content }]);
  if (candidates.some(c => c.raw === secret)) additional++;
  else missed.push(text.length > 100 ? text.slice(0, 80) + "…" : text);
}
const counts = safe.map(content => Maybe.scan([{ role: "user", content }]).length);
const falseCandidates = counts.reduce((sum, n) => sum + n, 0);
console.log(JSON.stringify({ corpus: "small fictional screening set (not held-out accuracy)",
  positiveExamples: examples.length, hiddenByExistingRules: baseline, additionalFound: additional,
  remainingMisses: missed, safeExamples: safe.length, safeExamplesFlagged: counts.filter(Boolean).length,
  falseCandidates }, null, 2));
assert(additional >= 4, "no useful coverage beyond existing rules");
assert.equal(falseCandidates, 0, "screening noise: investigate before shipping");

if (process.argv[2]) {
  let total = 0;
  const counts = [];
  for (const line of fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line);
    const turns = row.conversation || row.turns;
    assert(Array.isArray(turns), "expected conversation/turns array");
    counts.push(Maybe.scan(turns.map(({ role, content }) => ({ role, content: h.scan(content).sanitizedText }))).length);
    total++;
  }
  counts.sort((a, b) => a - b);
  const percentile = p => counts[Math.max(0, Math.ceil(counts.length * p) - 1)] ?? 0;
  // No raw content or candidate values printed. Unlabelled data measures burden, NOT false positives.
  console.log(JSON.stringify({ corpus: "local unlabelled chats", total, flagged: counts.filter(Boolean).length,
    medianCandidates: percentile(0.5), p90Candidates: percentile(0.9), note: "Requires human labels to measure precision/recall." }, null, 2));
}
