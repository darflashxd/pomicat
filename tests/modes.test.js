// Run: node tests/modes.test.js
// Profiles (public / trusted), range generalization, and the Presidio pre-pass (fake analyzer).
const assert = require("assert");
const http = require("http");
const { redact, redactTurns, invert, bucket, formatRange } = require("../bin/safeshare.js");

const chat = [
  { role: "user", content: "Gaji saya Rp 3.000.000 per bulan. Kalau saya nabung 30%, berapa per bulan dan setahun?" },
  { role: "assistant", content: "Kalau kamu menabung 30%, itu Rp 900.000 per bulan. Sisanya Rp 2.100.000 untuk kebutuhan bulanan. Dalam setahun terkumpul Rp 10.800.000." }
];
const text = (turns) => turns.map((t) => t.content).join("\n");

// Buckets and labels
assert.deepStrictEqual(bucket(3e6), [2e6, 5e6]);
assert.deepStrictEqual(bucket(5000), [5000, 10000]);
assert.strictEqual(formatRange(2e6, 5e6, "IDR"), "Rp 2–5 juta");
assert.strictEqual(formatRange(500e3, 1e6, "IDR"), "Rp 500 ribu–1 juta");
assert.strictEqual(formatRange(5000, 10000, "USD"), "$5k–$10k");

// Range mode: the user's salary becomes a range, derived figures stay removed, nothing recoverable
let out = text(redactTurns(chat, { numbers: "range" }));
assert(out.includes("Rp 2–5 juta"), out);
for (const n of ["3.000.000", "900.000", "2.100.000", "10.800.000"]) assert(!out.includes(n), out);
assert(!invert(out).some((f) => Math.abs(f.value - 3e6) / 3e6 < 0.02), "salary recoverable from ranges");

// Trusted profile keeps the user's own numbers and names but still removes hard identifiers
out = text(redactTurns(
  [{ role: "user", content: "I'm Rina. Gaji saya Rp 3.000.000, NIK 3201012304950001, key sk-proj-ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv" }],
  { profile: "trusted" }
));
assert(out.includes("Rina") && out.includes("Rp 3.000.000"), out);
assert(!out.includes("3201012304950001") && !out.includes("sk-proj-ab12"), out);

assert.throws(() => redactTurns(chat, { profile: "everyone" }), /Unknown profile/);
assert.throws(() => redactTurns(chat, { numbers: "blur" }), /Unknown numbers mode/);

// Presidio pre-pass against a fake analyzer that tags "Seattle" as LOCATION and "Jane Doe" as PERSON
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { text: t, entities } = JSON.parse(body);
    const found = [];
    for (const [word, type] of [["Jane Doe", "PERSON"], ["Seattle", "LOCATION"]]) {
      let i = t.indexOf(word);
      while (i !== -1) {
        if (!entities || entities.includes(type)) found.push({ entity_type: type, start: i, end: i + word.length, score: 0.9 });
        i = t.indexOf(word, i + 1);
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(found));
  });
});

fake.listen(0, "127.0.0.1", async () => {
  const url = `http://127.0.0.1:${fake.address().port}`;
  const turns = [
    { role: "user", content: "I am Jane Doe from Seattle." },
    { role: "assistant", content: "Seattle is lovely, Jane Doe." }
  ];
  try {
    let r = text(await redact(turns, { presidio: url }));
    assert(!r.includes("Seattle") && !r.includes("Jane Doe"), r);
    assert.strictEqual((r.match(/\[LOCATION_1\]/g) || []).length, 2, "same place, same placeholder: " + r);

    r = text(await redact(turns, { presidio: url, profile: "trusted" }));
    assert(r.includes("Seattle") && r.includes("Jane Doe"), "trusted keeps names and places: " + r);

    // names: "personal" (default) skips names with no tie to the user; "all" redacts them
    const essay = [{ role: "user", content: "Write an essay on how Jane Doe changed Seattle." }];
    r = text(await redact(essay, { presidio: url }));
    assert(r.includes("Jane Doe") && r.includes("Seattle"), "public figure kept by default: " + r);
    r = text(await redact(essay, { presidio: { url, names: "all" } }));
    assert(!r.includes("Jane Doe") && !r.includes("Seattle"), "names: all redacts: " + r);

    console.log("modes: all checks passed");
  } finally {
    fake.close();
  }
});
