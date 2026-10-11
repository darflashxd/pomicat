// Run: node tests/continuation.test.js
const assert = require("assert");
const Bridge = require("../viewer/engine/extension_bridge.js");

const build = Bridge.buildContinuationPrompt;

// Short chat: everything kept, placeholders explained
let p = build([
  { role: "user", content: "My salary is [REDACTED_FINANCIAL_1]." },
  { role: "assistant", content: "Saving 20% is [REDACTED_FINANCIAL_2] a month." }
]);
assert(p.includes("placeholder") && p.includes("don't guess"), p);
assert(p.includes("User: My salary is [REDACTED_FINANCIAL_1].") && p.includes("Assistant: Saving 20%"), p);
assert(!p.includes("omitted"), p);

// Long chat: stays within budget, keeps the newest turns whole, says what was dropped
const long = [];
for (let i = 0; i < 60; i++) long.push({ role: i % 2 ? "assistant" : "user", content: `turn ${i} ` + "x".repeat(i % 2 ? 3000 : 200) });
p = build(long, { budget: 12000 });
assert(p.length <= 12500, "over budget: " + p.length);
assert(p.includes("turn 59 " + "x".repeat(3000)), "last turn must be whole");
assert(/\(\d+ earlier messages omitted\)/.test(p), "must say what was dropped");
assert(p.includes("[…shortened]"), "older long answers shortened");
assert(p.indexOf("turn 58") < p.indexOf("turn 59"), "chronological order");

// One huge message still fits
p = build([{ role: "user", content: "y".repeat(50000) }], { budget: 12000 });
assert(p.length <= 12500, "single huge turn over budget: " + p.length);

console.log("continuation: all checks passed");

// The viewer's zero-width watermark must not leak into the new chat
p = build([{ role: "user", content: "hello​‌‍﻿ world" }]);
assert(p.includes("User: hello world") && !/[​-‍﻿]/.test(p), JSON.stringify(p));
console.log("continuation: watermark stripped");
