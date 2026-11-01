// Run: node tests/birthyear.test.js
const assert = require("assert");
const { redactTurns, invert } = require("../bin/pomicat.js");
const { inferBirthYears } = require("../extension/engine/policy.js");

// Attack: a hidden birth date comes back from stated ages
let b = inferBirthYears("Born on [REDACTED_DOB]. I am 28 years old. I graduated in 2020 at 22.", { now: 2026 });
assert(b.some((x) => x.year === 1998), JSON.stringify(b));
assert.strictEqual(b[0].support, 2, "two statements agree");
b = inferBirthYears("umur saya 30 tahun", { now: 2026 });
assert(b.some((x) => x.year === 1996), JSON.stringify(b));
assert.deepStrictEqual(inferBirthYears("I'm 5 minutes late"), [], "not an age");

// Defence: when a birth date is redacted, ages are hidden too
const out = redactTurns([
  { role: "user", content: "I was born on 14 March 1998 and I am 28 years old. I graduated in 2020 at 22." },
  { role: "assistant", content: "Since you are 28 in 2026, you could start a pension now." }
]).map((t) => t.content).join("\n");
assert(!/\b28\b|\bat 22\b/.test(out), out);
assert(out.includes("[REDACTED_DOB]") && out.includes("[REDACTED_AGE]"), out);
assert.deepStrictEqual(inferBirthYears(out, { now: 2026 }), [], "nothing left to infer: " + out);

// No birth date: a stated age is still hidden, other small numbers stay
const alone = redactTurns([{ role: "user", content: "I am 28 years old and want to learn piano. I'm 5 minutes away." }])[0].content;
assert(!/28/.test(alone) && alone.includes("[REDACTED_AGE]") && alone.includes("5 minutes"), alone);

console.log("birth year: all checks passed");
