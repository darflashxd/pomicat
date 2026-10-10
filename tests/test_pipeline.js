/**
 * Automated Unit Test Suite for SafeShare-AI Core Modules
 * Runs headless via Node.js to verify heuristics, contextual classifier,
 * pseudonymizer, and WebCrypto AES-GCM decryption roundtrip.
 */

const assert = require("assert");
const HeuristicsRedactor = require("../extension/engine/heuristics.js");
const ContextualClassifier = require("../extension/engine/contextual.js");
const ConsistentPseudonymizer = require("../extension/engine/pseudonymizer.js");
const SafeShareCrypto = require("../extension/engine/crypto.js");

async function runUnitTests() {
  console.log("================================================================");
  console.log("       SAFESHARE-AI CORE MODULES UNIT TEST SUITE");
  console.log("================================================================");

  // --- TEST 1: Tier 1 Heuristics & Hard Secret Redaction ---
  console.log("\n[Test 1] Testing Tier 1 Hard Secret Redactor...");
  const heuristics = new HeuristicsRedactor();
  const rawTextWithSecrets = `
    Halo, NIK saya 3201012304950001.
    OpenAI API Key: sk-proj-ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv
    GitHub: ghp_1234567890abcdefghijklmnopqrstuvwxyz
    AWS: AKIAIOSFODNN7EXAMPLE
    Email: dev-lead@secret-corp.internal
    Database: postgresql://postgres:SuperSecretP@ssword123@prod-db.internal:5432/main_db
  `;
  const hResult = heuristics.scan(rawTextWithSecrets);
  console.log(`  [+] Detected ${hResult.detections.length} hard secrets/PII items.`);
  assert(hResult.detections.length >= 6, "Expected at least 6 hard secrets detected");
  assert(!hResult.sanitizedText.includes("3201012304950001"), "NIK must be redacted");
  assert(!hResult.sanitizedText.includes("SuperSecretP@ssword123"), "DB password must be redacted");
  assert(!hResult.sanitizedText.includes("sk-proj-ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv"), "API Key must be redacted");
  console.log("  [✓] Tier 1 Heuristics passed!");

  // --- TEST 2: Tier 2 Contextual Integrity Discrimination ---
  console.log("\n[Test 2] Testing Tier 2 Contextual Discrimination...");
  const contextual = new ContextualClassifier();

  // 2A. Personal Private Data (Must be flagged)
  const personalTurn = "Gaji pokok saya saat ini adalah Rp 28.500.000 per bulan.";
  const cPersonal = contextual.classifyTurn(personalTurn, 0);
  console.log(`  [+] Personal sentence: "${personalTurn}"`);
  console.log(`      -> Detected: ${cPersonal.length} sensitive entity (Category: ${cPersonal[0]?.category})`);
  assert.strictEqual(cPersonal.length, 1, "Personal salary must be detected as sensitive");

  // 2B. Statistical Data (Must be preserved as SAFE)
  const statisticalTurn = "Rata-rata gaji Software Engineer di Jakarta adalah Rp 28.500.000 per bulan.";
  const cStat = contextual.classifyTurn(statisticalTurn, 1);
  console.log(`  [+] Statistical sentence: "${statisticalTurn}"`);
  console.log(`      -> Detected: ${cStat.length} entities (Expected: 0 SAFE)`);
  assert.strictEqual(cStat.length, 0, "Statistical salary must NOT be redacted");

  // 2C. Math / Hypothetical Problem (Must be preserved as SAFE)
  const mathTurn = "Misalkan seorang pekerja memiliki penghasilan Rp 28.500.000 dan dipotong pajak 5%, hitung pajaknya.";
  const cMath = contextual.classifyTurn(mathTurn, 2);
  console.log(`  [+] Hypothetical sentence: "${mathTurn}"`);
  console.log(`      -> Detected: ${cMath.length} entities (Expected: 0 SAFE)`);
  assert.strictEqual(cMath.length, 0, "Hypothetical math problem must NOT be redacted");
  console.log("  [✓] Tier 2 Contextual Discrimination passed!");

  // --- TEST 3: Tier 3 Consistent Pseudonymization ---
  console.log("\n[Test 3] Testing Tier 3 Consistent Pseudonymization...");
  const pseudonymizer = new ConsistentPseudonymizer();
  const sampleTurns = [
    { role: "user", content: "Gaji saya Rp 25.000.000 per bulan di kantor." },
    { role: "assistant", content: "Dengan gaji Rp 25.000.000, Anda bisa menyisihkan 20% untuk investasi." }
  ];
  const detected = [
    { turnIndex: 0, raw: "Rp 25.000.000", category: "SENSITIVE_FINANCIAL" },
    { turnIndex: 1, raw: "Rp 25.000.000", category: "SENSITIVE_FINANCIAL" }
  ];
  const { anonymizedTurns, mappings } = pseudonymizer.anonymizeConversation(sampleTurns, detected);
  console.log(`  [+] Anonymized Turn 0: "${anonymizedTurns[0].content}"`);
  console.log(`  [+] Anonymized Turn 1: "${anonymizedTurns[1].content}"`);
  assert(anonymizedTurns[0].content.includes("[REDACTED_FINANCIAL_1]"));
  assert(anonymizedTurns[1].content.includes("[REDACTED_FINANCIAL_1]"), "Same entity must use identical consistent pseudonym");
  console.log("  [✓] Tier 3 Consistent Pseudonymization passed!");

  // --- TEST 4: Zero-Knowledge AES-256-GCM Encryption Roundtrip ---
  console.log("\n[Test 4] Testing Zero-Knowledge WebCrypto Roundtrip...");
  const cryptoEngine = new SafeShareCrypto();
  const payloadToEncrypt = {
    turns: anonymizedTurns,
    created: new Date().toISOString(),
    owner: "zero-knowledge-session"
  };

  const encrypted = await cryptoEngine.encrypt(payloadToEncrypt);
  console.log(`  [+] Generated Share ID: ${encrypted.shareId}`);
  console.log(`  [+] Ciphertext length: ${encrypted.ciphertext.length} chars`);
  console.log(`  [+] Generated Share URL: ${encrypted.fullShareUrl}`);
  assert(encrypted.fullShareUrl.includes("#"), "URL must contain '#' fragment for key security");

  // Decrypt using key extracted from URL fragment
  const urlParts = encrypted.fullShareUrl.split("#");
  const extractedKey = urlParts[1];
  const decrypted = await cryptoEngine.decrypt(encrypted.ciphertext, extractedKey);

  console.log(`  [+] Decrypted Turn 0: "${decrypted.turns[0].content}"`);
  assert.deepStrictEqual(decrypted.turns, anonymizedTurns, "Decrypted payload must match original");
  console.log("  [✓] Zero-Knowledge Encryption Roundtrip passed 100%!");

  console.log("\n================================================================");
  console.log("  ALL TESTS PASSED: 100% SUCCESSFUL END-TO-END VERIFICATION");
  console.log("================================================================");
}

runUnitTests().catch(err => {
  console.error("Test failure:", err);
  process.exit(1);
});
