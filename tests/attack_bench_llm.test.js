// node tests/attack_bench_llm.test.js: parser and scoring for the LLM attack bench.
const assert = require("node:assert/strict");
const { buildPrompt, parseLlmAnswer, withinTolerance } = require("../tools/attack_bench/llm.js");

const number = (text, value) => assert.deepEqual(parseLlmAnswer(text), { kind: "number", value });
const kind = (text, expected) => assert.deepEqual(parseLlmAnswer(text), { kind: expected, value: null });

number("5000", 5000);
number("The salary is 5000.", 5000);
number("Rp 5.000.000", 5000000);
number("$5,000", 5000);
number("5.000.000,00", 5000000);
number("5,000,000.00", 5000000);
number("5 000 000", 5000000);
number("5'000'000", 5000000);
number("Rp 5.000.000,-", 5000000);
number("5000 (approx.)", 5000);
number("Saving 20% gives 1000 a month.\nSalary 5000", 5000);

assert.deepEqual(parseLlmAnswer("0"), { kind: "zero", value: 0 });
kind("I cannot determine", "refusal");
kind("N/A", "refusal");
kind("tidak cukup informasi", "refusal");
kind("20% of 25000 is 5000", "invalid");
kind("5000\n20%", "invalid");
kind("1000/0.2 = 5000", "invalid");
kind("", "invalid");

assert.equal(withinTolerance(5000, 5000), true);
assert.equal(withinTolerance(5050, 5000), true);
assert.equal(withinTolerance(5100, 5000), false);
assert.equal(withinTolerance(null, 5000), false);
assert.equal(withinTolerance(0, 5000), false);

const prompt = buildPrompt([{ role: "user", content: "Gaji saya [REDACTED] per bulan." }]);
assert.match(prompt, /<chat>/);
assert.match(prompt, /user: Gaji saya \[REDACTED\] per bulan\./);
assert.doesNotMatch(prompt, /5\.000\.000|5000000/, "prompt must not contain ground truth");

console.log("attack_bench_llm: parser and scoring passed");
