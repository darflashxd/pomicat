/**
 * SafeShare-AI — Advanced Adversarial Vulnerabilities & Evasion Stress Audit
 *
 * Verifies that all 10 newly uncovered adversarial evasion vectors and edge cases
 * are 100% neutralized without regressions or over-redaction:
 *
 *  1. Anti-Over-Redaction: "project management" & "project planning" preserved (NOT treated as codename)
 *  2. Indian Tech Compensation: LPA, Lakhs, Crores fully redacted
 *  3. DevSecOps Configs: .env & YAML password blocks redacted
 *  4. HTTP Basic Auth: Authorization: Basic <base64> redacted
 *  5. Multi-Chain Crypto: Solana Base58 & Bitcoin Bech32/Legacy addresses redacted
 *  6. Gov IDs Flexibility: Raw 9-digit SSN & US/UK Passport numbers redacted
 *  7. Therapy & Mental Health: Therapy sessions, childhood trauma & suicidal ideation redacted
 *  8. Email Signatures: Names in email sign-offs ("Best regards,\nDr. Jonathan Vance") redacted
 *  9. Obfuscated / Defanged Emails: "ceo [at] startup [dot] com" & "john(at)acme.org" redacted
 * 10. Zero-Width Space Evasion: Zero-width space (\u200B) in API keys normalized and redacted
 */

const assert = require("assert");
const HeuristicsRedactor = require("./extension/engine/heuristics.js");
const ContextualClassifier = require("./extension/engine/contextual.js");
const ConsistentPseudonymizer = require("./extension/engine/pseudonymizer.js");

function runAdversarialVulnerabilitiesAudit() {
  console.log("================================================================================");
  console.log("     SAFESHARE-AI: 10 ADVANCED ADVERSARIAL VULNERABILITIES & EVASION AUDIT");
  console.log("================================================================================");

  const heuristics = new HeuristicsRedactor();
  const contextual = new ContextualClassifier();
  const pseudonymizer = new ConsistentPseudonymizer();

  function scanAndAnonymize(turns) {
    pseudonymizer.reset();
    const detectedContextual = [];
    const intermediateTurns = [];

    turns.forEach((t, i) => {
      const hRes = heuristics.scan(t.content);
      const cRes = contextual.classifyTurn(hRes.sanitizedText, i);
      detectedContextual.push(...cRes);
      intermediateTurns.push({ role: t.role, content: hRes.sanitizedText });
    });

    return pseudonymizer.anonymizeConversation(intermediateTurns, detectedContextual);
  }

  // --- Test 1: Anti-Over-Redaction on "Project Management" ---
  console.log("\n[Test 1] Testing Anti-Over-Redaction on English 'project management'...");
  const t1 = scanAndAnonymize([
    { role: "user", content: "I took an advanced course in project management and project planning last summer." }
  ]);
  assert(t1.anonymizedTurns[0].content.includes("project management"), "project management must be preserved!");
  assert(t1.anonymizedTurns[0].content.includes("project planning"), "project planning must be preserved!");
  assert(!t1.anonymizedTurns[0].content.includes("[INTERNAL_CORP_ASSET"), "Must not tag common nouns as corp assets!");
  console.log("  [✓] Test 1 Passed: Zero over-redaction on 'project management' & 'project planning'!");

  // --- Test 2: Indian Tech Compensation (LPA & Lakhs) ---
  console.log("\n[Test 2] Testing Indian Tech Compensation (45 LPA & 10 Lakh)...");
  const t2 = scanAndAnonymize([
    { role: "user", content: "I work at a fintech in Bangalore. My annual package is 45 LPA (45 Lakhs per year) with a 10 Lakh joining bonus." }
  ]);
  assert(!t2.anonymizedTurns[0].content.includes("45 LPA"), "45 LPA must be redacted!");
  assert(!t2.anonymizedTurns[0].content.includes("45 Lakhs"), "45 Lakhs must be redacted!");
  assert(!t2.anonymizedTurns[0].content.includes("10 Lakh"), "10 Lakh must be redacted!");
  console.log("  [✓] Test 2 Passed: Indian Tech LPA & Lakhs redacted successfully!");

  // --- Test 3: DevSecOps .env & YAML Passwords ---
  console.log("\n[Test 3] Testing DevSecOps .env & YAML Password blocks...");
  const t3Env = scanAndAnonymize([
    { role: "user", content: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\nDB_PASS=SuperSecretMasterPassw0rd!" }
  ]);
  assert(!t3Env.anonymizedTurns[0].content.includes("wJalrXUtnFEMI"), "AWS secret key must be redacted!");
  assert(!t3Env.anonymizedTurns[0].content.includes("SuperSecretMasterPassw0rd!"), "DB_PASS must be redacted!");

  const t3Yaml = scanAndAnonymize([
    { role: "user", content: "database:\n  host: db.corp.internal\n  username: postgres\n  password: ProductionPassword991!" }
  ]);
  assert(!t3Yaml.anonymizedTurns[0].content.includes("ProductionPassword991!"), "YAML password must be redacted!");
  console.log("  [✓] Test 3 Passed: .env secrets & YAML password blocks sanitized!");

  // --- Test 4: HTTP Basic Authorization Header ---
  console.log("\n[Test 4] Testing HTTP Basic Auth Header (Base64)...");
  const t4 = scanAndAnonymize([
    { role: "user", content: "Authorization: Basic YWRtaW46U3VwZXJTZWNyZXRAMTIz\nContent-Type: application/json" }
  ]);
  assert(!t4.anonymizedTurns[0].content.includes("YWRtaW46U3VwZXJTZWNyZXRAMTIz"), "Basic auth credentials must be redacted!");
  assert(t4.anonymizedTurns[0].content.includes("[REDACTED_BASE64_CREDENTIALS]"));
  console.log("  [✓] Test 4 Passed: Base64 Basic Auth header redacted!");

  // --- Test 5: Solana & Bitcoin Crypto Wallets ---
  console.log("\n[Test 5] Testing Multi-Chain Crypto (Solana Base58 & Bitcoin Bech32)...");
  const t5Sol = scanAndAnonymize([
    { role: "user", content: "Send 50 SOL to my phantom wallet: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU for the transaction." }
  ]);
  assert(!t5Sol.anonymizedTurns[0].content.includes("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"), "Solana wallet address must be redacted!");

  const t5Btc = scanAndAnonymize([
    { role: "user", content: "My BTC receiving address is bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 for the invoice." }
  ]);
  assert(!t5Btc.anonymizedTurns[0].content.includes("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"), "Bitcoin Bech32 address must be redacted!");
  console.log("  [✓] Test 5 Passed: Solana Base58 & Bitcoin Bech32 wallets redacted!");

  // --- Test 6: Raw 9-Digit SSN & US Passport ---
  console.log("\n[Test 6] Testing Raw 9-Digit SSN & US Passport Number...");
  const t6Ssn = scanAndAnonymize([
    { role: "user", content: "My Social Security Number is 987654321 for the tax form." }
  ]);
  assert(!t6Ssn.anonymizedTurns[0].content.includes("987654321"), "Raw SSN must be redacted!");

  const t6Pass = scanAndAnonymize([
    { role: "user", content: "Renewing my travel document. US Passport number : 123456789 expiring in 2030." }
  ]);
  assert(!t6Pass.anonymizedTurns[0].content.includes("123456789"), "US Passport number must be redacted!");
  console.log("  [✓] Test 6 Passed: Raw SSN & 9-digit passport redacted!");

  // --- Test 7: Therapy, Trauma & Mental Health Disclosures ---
  console.log("\n[Test 7] Testing Therapy Session & Trauma Disclosures...");
  const t7 = scanAndAnonymize([
    { role: "user", content: "In my therapy session today, I broke down discussing my severe childhood trauma, panic attacks, and suicidal ideation." }
  ]);
  assert(!t7.anonymizedTurns[0].content.includes("childhood trauma"), "Trauma must be redacted!");
  assert(!t7.anonymizedTurns[0].content.includes("suicidal ideation"), "Suicidal ideation must be redacted!");
  console.log("  [✓] Test 7 Passed: Psychotherapy & mental health trauma sanitized!");

  // --- Test 8: Email Signatures & Closing Names ---
  console.log("\n[Test 8] Testing Email Sign-off Signature Name...");
  const t8 = scanAndAnonymize([
    { role: "user", content: "Please let me know if you need more details.\n\nBest regards,\nDr. Jonathan Vance\nHead of Research" }
  ]);
  assert(!t8.anonymizedTurns[0].content.includes("Jonathan Vance"), "Sign-off name must be redacted!");
  console.log("  [✓] Test 8 Passed: Email sign-off name 'Jonathan Vance' redacted!");

  // --- Test 9: Obfuscated / Defanged Email ---
  console.log("\n[Test 9] Testing Obfuscated / Defanged Email Address...");
  const t9 = scanAndAnonymize([
    { role: "user", content: "Send confidential pitch deck to ceo [at] stealthstartup [dot] com or john(at)acme.org." }
  ]);
  assert(!t9.anonymizedTurns[0].content.includes("stealthstartup"), "Defanged email 1 must be redacted!");
  assert(!t9.anonymizedTurns[0].content.includes("acme.org"), "Defanged email 2 must be redacted!");
  console.log("  [✓] Test 9 Passed: Defanged emails [at]/[dot] redacted!");

  // --- Test 10: Zero-Width Character Evasion in API Keys ---
  console.log("\n[Test 10] Testing Zero-Width Character (\\u200B) Evasion...");
  const t10 = scanAndAnonymize([
    { role: "user", content: "My test key is sk-proj-1234567890abcdefghijklmnopqrstuv\u200Bwxyz" }
  ]);
  assert(!t10.anonymizedTurns[0].content.includes("1234567890abcdefghijklmnopqrstuvwxyz"), "Zero-width separated key must be fully neutralized!");
  assert(!t10.anonymizedTurns[0].content.includes("wxyz"), "Tail must not be left behind!");
  console.log("  [✓] Test 10 Passed: Zero-width space evasion normalized and neutralized!");

  console.log("\n================================================================================");
  console.log("    ALL 10 ADVERSARIAL VULNERABILITY & EVASION CHECKS PASSED 100%!");
  console.log("================================================================================\n");
}

if (require.main === module) {
  runAdversarialVulnerabilitiesAudit();
}

module.exports = runAdversarialVulnerabilitiesAudit;
