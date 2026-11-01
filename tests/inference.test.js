// Run: node tests/inference.test.js
// Attacks (invert / inferDates) against a naive redaction, and SafeShare's redaction against them.
const assert = require("assert");
const { redact } = require("../bin/pomicat.js");
const { invert, inferDates } = require("../extension/engine/policy.js");

const joined = (turns) => turns.map((t) => t.content).join("\n");

(async () => {
  // A. Dates: weekday + "the day after the 14th" pins a hidden date down to a few days
  const now = new Date("2026-10-16");
  const dates = inferDates("[REDACTED_DATE] is a Tuesday, the day after my birthday on the 14th.", { now });
  assert.deepStrictEqual(dates[0].candidates, ["2026-09-15", "2026-12-15", "2027-06-15"]);
  const id = inferDates("Rapatnya [REDACTED_DATE], hari Selasa, sehari setelah tanggal 14.", { now });
  assert.strictEqual(id[0].candidates.length, 3, "Indonesian clues");
  assert.strictEqual(inferDates("[REDACTED_DATE] was a Tuesday.", { now }).length, 0, "one weekday alone is not reported");
  assert.strictEqual(inferDates("On Tuesday the 14th we met.", { now }).length, 0, "no hidden date, nothing to infer");

  const dob = await redact([{ role: "user", content: "My birthday is 15 September 1998. It was a Tuesday, the day after my mum's on the 14th." }]);
  assert(!/Tuesday|day after|14th/.test(dob[0].content), dob[0].content);
  assert.strictEqual(inferDates(joined(dob), { now }).every((d) => !d.candidates.length || d.candidates.length > 14), true);
  const plain = await redact([{ role: "user", content: "Meeting on Tuesday the 14th, see you." }]);
  assert.strictEqual(plain[0].content, "Meeting on Tuesday the 14th, see you.", "no hidden date: clues stay");

  // C. Across turns: the salary is only stated once; three later replies each give part of it
  const chat = [
    { role: "user", content: "Gaji saya Rp 3.000.000 per bulan. Bantu atur keuangan ya." },
    { role: "assistant", content: "Kalau kamu menabung 30%, itu Rp 900.000 per bulan." },
    { role: "user", content: "Oke. Ada tips hemat makan?" },
    { role: "assistant", content: "Masak sendiri dan bawa bekal." },
    { role: "assistant", content: "Dalam setahun tabunganmu jadi Rp 10.800.000." },
    { role: "user", content: "Sisanya buat apa?" },
    { role: "assistant", content: "Sisanya Rp 2.100.000 untuk kebutuhan bulanan." }
  ];
  // A naive tool hides only the stated salary
  const naive = chat.map((t, i) => (i === 0 ? { ...t, content: t.content.replace("Rp 3.000.000", "[REDACTED]") } : t));
  assert(invert(joined(naive)).some((f) => Math.round(f.value) === 3000000), "attack recovers it from turns 2+5+7");
  for (const i of [1, 4, 6]) {
    assert(!invert(chat[i].content).some((f) => Math.round(f.value) === 3000000 && f.support >= 2), `turn ${i + 1} alone is not enough`);
  }
  const safe = await redact(chat);
  assert(!invert(joined(safe)).some((f) => Math.round(f.value) === 3000000), joined(safe));

  console.log("inference: all checks passed");
})().catch((e) => { console.error(e); process.exit(1); });

// B. Combinations of details (warning only) and D. landmarks next to a hidden address
{
  const { quasiIdentifiers } = require("../extension/engine/policy.js");
  assert(quasiIdentifiers("I am the only female cardiologist at a 50-bed hospital in Blitar.").risky);
  assert(quasiIdentifiers("Saya satu-satunya dokter perempuan di puskesmas di Blitar.").risky);
  assert(!quasiIdentifiers("What does a cardiologist do?").risky);
  assert(!quasiIdentifiers("I live in Jakarta and like cats.").risky);
}
redact([
  { role: "user", content: "My address is 221B Baker Street, London NW1 6XE. It is 5 minutes from the station, next to the old bakery." },
  { role: "user", content: "The cafe near the station is nice." }
]).then((t) => {
  assert(!/station|bakery/.test(t[0].content), t[0].content);
  assert.strictEqual(t[1].content, "The cafe near the station is nice.", "no hidden address: landmarks stay");
  console.log("inference: combination and location checks passed");
}).catch((e) => { console.error(e); process.exit(1); });

// Attack check in the share dialog: runs on exactly what would be shared
{
  global.window = global.window || {};
  global.document = global.document || { getElementById: () => null };
  const M = require("../extension/ui/modal.js");
  const Modal = M.SafeShareModal || M;
  const m = Object.create(Modal.prototype);
  const salary = "Saving 30% gives Rp 900.000 a month, Rp 10.800.000 a year, and Rp 2.100.000 left each month.";
  const leaky = m.attackCheck([{ role: "user", content: "My salary is [REDACTED_FINANCIAL_1] per month." }, { role: "assistant", content: salary }]);
  assert.strictEqual(leaky.amounts.length, 1, "one hidden amount -> one finding");
  assert.strictEqual(Math.round(leaky.amounts[0].value), 3000000);
  const safe = m.attackCheck([{ role: "user", content: "My salary is [REDACTED_FINANCIAL_1] per month." }, { role: "assistant", content: "Saving 30% gives [REDACTED_DERIVED_1] a month." }]);
  assert.strictEqual(safe.leaks, 0, "nothing recoverable when derived amounts are hidden");
  const trusted = m.attackCheck([{ role: "user", content: "My salary is Rp 3.000.000 per month." }, { role: "assistant", content: salary }]);
  assert.strictEqual(trusted.leaks, 0, "nothing hidden, nothing to recover (trusted reader)");
  console.log("inference: attack check passed");
}
