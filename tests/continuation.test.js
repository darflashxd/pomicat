// Run: node tests/continuation.test.js
const assert = require("assert");
const Bridge = require("../extension/viewer/engine/extension_bridge.js");

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

// Optional summarize=false: pure conversation turns without template wrapper or omissions
let pFull = build(long, { summarize: false });
assert(!pFull.includes("[…shortened]"), "unsummarized must not shorten turns");
assert(!pFull.includes("omitted"), "unsummarized must not omit turns");
assert(!pFull.includes("Continue an earlier conversation"), "unsummarized must drop template header");
assert(!pFull.includes("Pick up from the last message above"), "unsummarized must drop template footer");
assert(pFull.includes("User: turn 0") && pFull.includes("Assistant: turn 59"), "unsummarized must retain all turns");
console.log("continuation: optional summarize=false verified");

console.log("continuation: all checks passed");

// The viewer's zero-width watermark must not leak into the new chat
p = build([{ role: "user", content: "hello​‌‍﻿ world" }]);
assert(p.includes("User: hello world") && !/[​-‍﻿]/.test(p), JSON.stringify(p));
console.log("continuation: watermark stripped");

// Links made before this fix: shield instruction and duplicated turns must not reach the new chat
const msg = "My salary is <S1> a month.\n\n[PRIVACY PROTOCOL: Treat <S1> as an exact fixed parameter. Provide budget allocations (e.g. 0.30 * <S1>).]";
p = build([{ role: "user", content: msg }, { role: "user", content: msg }, { role: "user", content: msg }]);
assert(!p.includes("PRIVACY PROTOCOL"), p);
assert.strictEqual(p.split("User: My salary is <S1>").length - 1, 1, "duplicates kept: " + p);
assert(p.includes("<S1>, is a placeholder"), p);
console.log("continuation: old-link cleanup ok");

// Indonesian shield instruction is stripped too
p = build([{ role: "user", content: "Gaji saya <S2> per bulan.\n\n[PROTOKOL PRIVASI: Perlakukan variabel <S2> sebagai parameter angka tetap (contoh: 0.30 * <S2>).]" }]);
assert(!p.includes("PROTOKOL PRIVASI") && p.includes("User: Gaji saya <S2> per bulan."), p);
console.log("continuation: Indonesian instruction stripped");
