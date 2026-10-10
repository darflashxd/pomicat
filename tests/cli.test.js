// Run: node tests/cli.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { redactTurns, invert } = require("../bin/safeshare.js");

const ex = (f) => fs.readFileSync(path.join(__dirname, "..", "examples", f), "utf8");

// The attack recovers the salary from a naively redacted chat (ID and EN)
let found = invert(ex("chat_naive_redacted.txt"));
assert.strictEqual(Math.round(found[0].value), 3000000);
found = invert(ex("chat_naive_redacted_en.txt"));
assert.strictEqual(Math.round(found[0].value), 5000);

// After SafeShare redaction the attack recovers nothing
for (const f of ["chat_original.txt", "chat_original_en.txt"]) {
  const turns = ex(f).trim().split("\n").map((l) => {
    const [role, ...rest] = l.split(": ");
    return { role: role.toLowerCase(), content: rest.join(": ") };
  });
  const out = redactTurns(turns).map((t) => t.content).join("\n");
  assert.deepStrictEqual(invert(out), [], `leak after redaction of ${f}:\n${out}`);
}

// Policy: allowlist, custom rule, preset
const text = [{ role: "user", content: "Email support@acme.com or me at jane@personal.dev, ticket ACME-123456, key sk-proj-ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv" }];
let out = redactTurns(text, {
  allow: ["support@acme.com"],
  rules: [{ id: "ACME_TICKET", pattern: "ACME-\\d{6}", replacement: "[TICKET]" }]
})[0].content;
assert(out.includes("support@acme.com"), out);
assert(!out.includes("jane@personal.dev"), out);
assert(out.includes("[TICKET]"), out);
out = redactTurns(text, { preset: "pci" })[0].content;
assert(out.includes("jane@personal.dev"), "pci preset should leave emails: " + out);
assert(!out.includes("sk-proj-"), "pci preset still redacts credentials: " + out);
assert.throws(() => redactTurns(text, { preset: "sox" }), /Unknown preset/);

// False positives found on real chats (WildChat): these must pass through untouched
const clean = [
  "Lee and Mangalaraj (2022) conducted a systematic review; Pu et al. (2021) agree.",
  "A person stands on a 25m high ledge and drops a rock.",
  "For viable count: 1. Plate count method (colony-forming unit count).",
  "$user = User::factory()->create(); $board->owner_id = $user->id;",
  "The fate that awaited her was the one that would carry the crown.",
  "fun Field(name: String, value: Int) = Unit",
  "See https://doi.org/10.1128/4111111111111111 for the method.",
  "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700');",
  "Give sodium bicarbonate; the elf moved with swift movement.",
  "Treatment is decided on a case-by-case basis."
];
for (const c of clean) {
  const out = redactTurns([{ role: "user", content: "I'm Rina. Help me." }, { role: "assistant", content: c }])[1].content;
  assert.strictEqual(out, c, "over-redacted: " + out);
}

console.log("cli: all checks passed");
