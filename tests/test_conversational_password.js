/**
 * Test Suite for Conversational Passwords & Slang Variations
 */

const assert = require("assert");

function buildRegex() {
  const qualifiers = [
    "for(?:\\s+(?:my|the|our|your))?",
    "to(?:\\s+(?:the|my))?",
    "of", "in", "on", "at",
    "my", "the", "our", "your",
    "email", "account", "user", "login", "username",
    "staging", "production", "server", "db", "database", "admin", "root",
    "akun", "saya", "ku", "aku", "gue", "gw", "kamu", "mu", "milik",
    "wifi", "hotspot", "router", "laptop", "pc", "komputer", "hp",
    "bank", "m-?banking", "atm", "kartu", "rekening", "bca", "mandiri", "bri", "bni", "cimb", "jenius",
    "baru", "lama", "temp", "temporary", "default",
    "adalah", "is", "yaitu", "ialah", "yakni", "merupakan", "berupa", "nya"
  ].join("|");

  return new RegExp(
    `(?:<password>([^<]+)<\\/password>` +
    `|(?:(?:56=PASS\\^|PASS\\^|PASS=|PWD=)([^\\s|\\r\\n'"]{5,40}))` +
    `|["']?(?:password|passwd|passcode|kata_sandi|pw|pwd|pass)["']?\\s*[:=]\\s*["']?([^\\s\\r\\n'"]{5,40})["']?` +
    `|\\b((?:(?:(?:my|the|our|temporary|temp|default|admin|root|wifi|staging|production|database|db)\\s+)?` +
    `(?:password|passwd|passcode|kata\\s+sandi|kata_sandi|pw|pwd|pass)` +
    `(?:\\s+(?:${qualifiers}))*\\s*(?:adalah|is|yaitu|ialah|[:=])?\\s+))` +
    `([^\\s\\r\\n'"]{5,40})(?=\\s|$|[)\\]}>,;]))`,
    "gi"
  );
}

const rx = buildRegex();

const testCases = [
  {
    input: "pw akun bank aku Sup3rRahasia! tolong ingatkan",
    expectedSecret: "Sup3rRahasia!",
    expectedRedacted: "pw akun bank aku [REDACTED_PASSWORD] tolong ingatkan"
  },
  {
    input: "Password email saya Rahasia123 tolong buat yang lebih kuat",
    expectedSecret: "Rahasia123",
    expectedRedacted: "Password email saya [REDACTED_PASSWORD] tolong buat yang lebih kuat"
  },
  {
    input: "Kata sandi wifi saya RahasiaWifi123 tolong buat yang lebih kuat",
    expectedSecret: "RahasiaWifi123",
    expectedRedacted: "Kata sandi wifi saya [REDACTED_PASSWORD] tolong buat yang lebih kuat"
  },
  {
    input: "My password is Password123! please make a stronger one",
    expectedSecret: "Password123!",
    expectedRedacted: "My password is [REDACTED_PASSWORD] please make a stronger one"
  },
  {
    input: "My wifi password WifiPass123! please suggest a stronger one",
    expectedSecret: "WifiPass123!",
    expectedRedacted: "My wifi password [REDACTED_PASSWORD] please suggest a stronger one"
  }
];

for (const tc of testCases) {
  rx.lastIndex = 0;
  const match = rx.exec(tc.input);
  console.log(`[Input]    : ${tc.input}`);
  assert(match !== null, `Must match regex for: ${tc.input}`);
  const secret = match[5] || match[3] || match[2] || match[1];
  console.log(`[Extracted]: ${secret}`);
  assert.strictEqual(secret, tc.expectedSecret, `Extracted secret must match: ${tc.expectedSecret}`);
  const prefix = match[4];
  const replaced = tc.input.replace(match[0], `${prefix}[REDACTED_PASSWORD]`);
  console.log(`[Sanitized]: ${replaced}`);
  assert.strictEqual(replaced, tc.expectedRedacted);
  console.log("---");
}
console.log("All test cases passed!");
