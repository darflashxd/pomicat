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
  "Treatment is decided on a case-by-case basis.",
  "ping 10.1.2.60 and ssh deploy@192.168.1.20",
  "docker run -d -p 5432:5432 --name db",
  "server { listen 80; } and PORT=8080",
  "SELECT id, email FROM users WHERE id = 123 LIMIT 100;",
  "meeting on 2026-01-05 at noon, load average is 5.0 per core."
];
for (const c of clean) {
  const out = redactTurns([{ role: "user", content: "I'm Rina. Help me." }, { role: "assistant", content: c }])[1].content;
  assert.strictEqual(out, c, "over-redacted: " + out);
}

// Bare birth dates hide only with a personal marker nearby
let dob = redactTurns([{ role: "user", content: "My birthday is May 5 1998" }])[0].content;
assert(dob.includes("[REDACTED_DOB]"), dob);
dob = redactTurns([{ role: "user", content: "ulang tahun saya 5 Mei 1998" }])[0].content;
assert(dob.includes("[REDACTED_DOB]"), dob);

// Private IPs pass through; public IPs still go
let ipt = redactTurns([{ role: "user", content: "ping 10.0.0.5 then 203.0.113.7" }])[0].content;
assert(ipt.includes("10.0.0.5") && ipt.includes("[REDACTED_IP]"), ipt);

console.log("cli: all checks passed");

// Password and OTP rules (found testing on ChatGPT with an Indonesian form)
{
  const H = require("../extension/engine/heuristics.js");
  const h = new H();
  const s = (t) => h.scan(t).sanitizedText;
  assert.strictEqual(s("terus password m-banking aku [REDACTED_PASSWORD]"), "terus password m-banking aku [REDACTED_PASSWORD]", "existing placeholder untouched");
  assert(!s("ke form pendaftaran biasa. OTP dan password m-banking bukan data yang boleh dimasukkan ke form biasa.").includes("[REDACTED_PASSWORD]"), "prose is not a password");
  assert(s("password m-banking aku Sup3rRahasia9 kesimpen").includes("aku [REDACTED_PASSWORD] kesimpen"));
  assert(s("My Password is hunter").endsWith("[REDACTED_PASSWORD]"));
  assert.strictEqual(s("Tadi dapet OTP 482913 dari bank"), "Tadi dapet OTP [REDACTED_OTP] dari bank");
  assert.strictEqual(s("kode pos 40115"), "kode pos 40115");
}
console.log("cli: password/OTP checks passed");
{
  const H = require("../extension/engine/heuristics.js");
  const s = (t) => new H().scan(t).sanitizedText;
  assert(!s("I change my password regularly").includes("[REDACTED"), "prose word after 'password'");
  assert(!s("I change my password regularly. Is that enough?").includes("[REDACTED"), "full stop is not a password symbol");
  assert(s('{"password": "hunter22"}').includes("[REDACTED_PASSWORD]"), "JSON form still caught");
}

// Before-sending NER keeps only the writer's own names/places (rules shared with --presidio)
{
  const { PERSONAL_BEFORE } = require("../extension/engine/pseudonymizer.js");
  assert(PERSONAL_BEFORE.PERSON.test("tell me about my wife "));
  assert(PERSONAL_BEFORE.PERSON.test("kemarin teman saya "));
  assert(!PERSONAL_BEFORE.PERSON.test("write an essay about "));
  assert(PERSONAL_BEFORE.LOCATION.test("I live in "));
  assert(PERSONAL_BEFORE.LOCATION.test("saya tinggal di "));
  assert(!PERSONAL_BEFORE.LOCATION.test("the history of "));
}
console.log("cli: personal name/place checks passed");

// AI provider keys and bearer tokens (found testing on ChatGPT)
{
  const H = require("../extension/engine/heuristics.js");
  const s = (t) => new H().scan(t).sanitizedText;
  for (const key of ["gsk_AbCdEf1234567890AbCdEf1234567890AbCdEf1234567890AB", "r8_AbCdEf1234567890AbCdEf1234567890AbCd",
    "xai-AbCdEf1234567890AbCdEf1234567890AbCdEf1234567890AbCdEf12345678AbCdEf12345678"]) {
    assert(!s(`my key ${key}`).includes(key.slice(-10)), key);
  }
  assert.strictEqual(s("Authorization: Bearer abcDEF123456ghiJKL789012mnoPQR345678"), "Authorization: Bearer [REDACTED_TOKEN]");
  assert.strictEqual(s("The bearer of this letter is welcome."), "The bearer of this letter is welcome.");
}
console.log("cli: api key checks passed");

// Secrets in a pasted bash history (found testing on ChatGPT)
{
  const H = require("../extension/engine/heuristics.js");
  const s = (t) => new H().scan(t).sanitizedText;
  const history = [
    "mysql -u root -pMyR00tPass -e \"show databases;\"",
    "docker run -e API_TOKEN=tok_FAKE8f7e6d5c4b3a app:latest",
    "sshpass -p 'Ssh!Pass2026' ssh deploy@203.0.113.15",
    "git clone https://oauth2:glpat-FAKEabc123def456ghi7@gitlab.example.com/team/repo.git",
    "psql postgres://app:Sup3rSecret@db.internal:5432/app"
  ].join("\n");
  const out = s(history);
  for (const secret of ["MyR00tPass", "tok_FAKE8f7e6d5c4b3a", "Ssh!Pass2026", "glpat-FAKE", "Sup3rSecret"]) assert(!out.includes(secret), out);
  assert(out.includes("mysql -u root -p[REDACTED_PASSWORD]"), out);
  assert(out.includes("@gitlab.example.com/team/repo.git"), "host kept: " + out);
  assert.strictEqual(s("mysql -u root -p -e \"show databases;\""), "mysql -u root -p -e \"show databases;\"", "-p alone prompts, nothing to hide");
}
console.log("cli: bash history checks passed");

// "@" in prose is not an address; real addresses and logins still are
{
  const H = require("../extension/engine/heuristics.js");
  const s = (t) => new H().scan(t).sanitizedText;
  for (const t of ["meet me@5pm tomorrow", "oops typo hello@world. sorry", "me@home now", "see you @ 5pm", "ping @john",
    "test@test", "git clone git@github.com:team/repo.git"]) assert.strictEqual(s(t), t, t);
  assert.strictEqual(s("email me at john@gmail"), "email me at [REDACTED_EMAIL]");
  assert(!s("my email is rina.kusuma@example.com").includes("rina"));
  assert.strictEqual(s("ssh admin@bastion"), "ssh [user]@[host]");
  assert.strictEqual(s("connect to deploy@web-01"), "connect to [user]@[host]");
}
console.log("cli: @ checks passed");

// Public IPs (System & Shell, so "debug details" can keep them); private ones and versions stay
{
  const H = require("../extension/engine/heuristics.js");
  const s = (t) => new H().scan(t).sanitizedText;
  assert.strictEqual(s("ssh deploy@203.0.113.15"), "ssh deploy@[REDACTED_IP]");
  assert.strictEqual(s("my home IP is 36.72.150.11."), "my home IP is [REDACTED_IP].");
  assert.strictEqual(s("curl http://36.72.150.11:53/"), "curl http://[REDACTED_IP]:53/");
  for (const t of ["psql -h 10.0.4.20 -U postgres", "version 1.2.3.4 released", "ip 192.168.1.1 router", "dns 1.1.1.1"]) assert.strictEqual(s(t), t, t);
  assert.strictEqual(new H().scan("ssh deploy@203.0.113.15").detections[0].category, "SYSTEM");
}
console.log("cli: ip checks passed");
