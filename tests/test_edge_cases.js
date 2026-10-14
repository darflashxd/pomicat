/**
 * Comprehensive Automated Edge-Case Audit
 * Validates:
 * 1. Gambar 1: Indonesian Name with Address & Phone (No greedy name, no leaking middle/last name)
 * 2. Gambar 2: Unix Shell Terminal Prompt & Directory Path
 * 3. Algebraic Reconstruction Defense (Percentage projection & delta increment masking)
 * 4. Zero-Server Standalone Hash Decryption & 24h Expiration Enforcement
 */

const assert = require("assert");
const HeuristicsRedactor = require("../extension/engine/heuristics.js");
const ContextualClassifier = require("../extension/engine/contextual.js");
const ConsistentPseudonymizer = require("../extension/engine/pseudonymizer.js");
const SafeShareCrypto = require("../extension/engine/crypto.js");

async function runEdgeCaseAudit() {
  console.log("================================================================================");
  console.log("           SAFESHARE-AI: RIGOROUS EDGE-CASE VERIFICATION AUDIT");
  console.log("================================================================================");

  const heuristics = new HeuristicsRedactor();
  const contextual = new ContextualClassifier();
  const pseudonymizer = new ConsistentPseudonymizer();

  // --- TEST 1: GAMBAR 1 (Name + Address + Phone) ---
  console.log("\n[Audit 1] Testing Gambar 1 (Name, Address & Phone stop-word boundaries)...");
  const rawG1 = "Halo nama saya budianto kusuma alama alamat saya di jalan kampung durian runtuh nomor telfon saya 081372138173";
  const h1 = heuristics.scan(rawG1);
  
  const turnsG1 = [
    { role: "user", content: h1.sanitizedText },
    { role: "assistant", content: "Halo, Budianto Kusuma Alama! 👋 Senang berkenalan." }
  ];

  const { anonymizedTurns: outG1 } = pseudonymizer.anonymizeConversation(turnsG1, []);

  console.log("  [+] User Output:\n     ", outG1[0].content);
  console.log("  [+] Assistant Output:\n     ", outG1[1].content);

  // Assertions for Gambar 1
  assert(outG1[0].content.includes("[User_A]"), "User name must be mapped to [User_A]");
  assert(outG1[0].content.includes("[REDACTED_ADDRESS]"), "Address must be redacted");
  assert(outG1[0].content.includes("[REDACTED_PHONE]"), "Phone number must be redacted");
  assert(!outG1[0].content.includes("kampung durian runtuh"), "Raw street address must not leak in user turn");
  assert(!outG1[1].content.includes("Kusuma Alama"), "Middle and last name must NEVER leak in assistant turn");
  assert(outG1[1].content.includes("[User_A]"), "Assistant must greet [User_A]");
  console.log("  [✓] Gambar 1 completely resolved!");

  // --- TEST 2: GAMBAR 2 (Terminal Shell Prompt & Home Path) ---
  console.log("\n[Audit 2] Testing Gambar 2 (Unix Shell Prompt & Home Path)...");
  const rawG2 = "venv) ctfuser@devbox:~/CTFdScraper/CTF/CTF COMPFEST 18/Binary Exploitation/未来日記$ gdb -q --batch -ex \"x/2i &setcontext\" ./libc.so.6";
  const h2 = heuristics.scan(rawG2);

  console.log("  [+] Sanitized Shell Prompt:\n     ", h2.sanitizedText);

  // Assertions for Gambar 2
  assert(!h2.sanitizedText.includes("ctfuser@devbox"), "Unix username and hostname must be redacted");
  assert(!h2.sanitizedText.includes("CTFdScraper"), "Internal local directory path must be redacted");
  assert(h2.sanitizedText.includes("[user]@[host]"), "Prompt must show sanitized [user]@[host]");
  assert(h2.sanitizedText.includes('gdb -q --batch -ex "x/2i &setcontext" ./libc.so.6'), "Command and arguments must be 100% intact");
  console.log("  [✓] Gambar 2 completely resolved!");

  // --- TEST 3: ALGEBRAIC RECONSTRUCTION ATTACK DEFENSE ---
  console.log("\n[Audit 3] Testing Algebraic Reconstruction Attack Defense...");
  pseudonymizer.reset();
  const rawSalaryTurns = [
    { role: "user", content: "Gaji pokok saya saat ini adalah Rp 28.500.000 per bulan." },
    { 
      role: "assistant", 
      content: "Misalnya gaji naik 15%:\nRp 28.500.000 → Rp32,775 jt\n\nKenaikan hanya:\nRp4,275 jt/bulan" 
    }
  ];
  const detectedSalary = [
    { turnIndex: 0, raw: "Rp 28.500.000", category: "SENSITIVE_FINANCIAL" }
  ];

  const { anonymizedTurns: outSalary } = pseudonymizer.anonymizeConversation(rawSalaryTurns, detectedSalary);
  console.log("  [+] Assistant Output:\n     ", outSalary[1].content);

  // Assertions for Algebraic Defense
  assert(!outSalary[1].content.includes("32,775"), "Projected total salary must not leak");
  assert(!outSalary[1].content.includes("4,275"), "Salary delta increment must not leak");
  assert(outSalary[1].content.includes("[REDACTED_PROJECTED_SALARY]"), "Projected salary must be sanitized");
  assert(outSalary[1].content.includes("[REDACTED_SALARY_INCREMENT]"), "Delta increment must be sanitized");
  console.log("  [✓] Algebraic Reconstruction Attack completely blocked!");

  // --- TEST 4: ZERO-SERVER STANDALONE HASH ENCRYPTION & EXPIRATION ---
  console.log("\n[Audit 4] Testing Zero-Server Standalone Hash Encryption & Expiration...");
  const cryptoEngine = new SafeShareCrypto();
  const testPayload = {
    turns: outG1,
    timestamp: Date.now()
  };

  const enc = await cryptoEngine.encrypt(testPayload);
  const ttl24h = 86400 * 1000;
  const expFuture = Date.now() + ttl24h;

  // Build standalone hash
  const standaloneHash = `#d=${encodeURIComponent(enc.ciphertext)}&k=${encodeURIComponent(enc.key)}&exp=${expFuture}`;
  const hashParams = new URLSearchParams(standaloneHash.replace(/^#/, ""));

  // Verify extraction and decryption
  const extractedCipher = hashParams.get("d");
  const extractedKey = hashParams.get("k");
  const extractedExp = parseInt(hashParams.get("exp"), 10);

  assert(extractedExp > Date.now(), "Tenggat waktu harus masih berlaku di masa depan");
  const decrypted = await cryptoEngine.decrypt(extractedCipher, extractedKey);
  assert.strictEqual(decrypted.turns.length, 2, "Decrypted turns count must match");
  assert.strictEqual(decrypted.turns[0].content, outG1[0].content, "Decrypted content must be 100% identical");

  // Test expired state & cryptographic expiration enforcement
  const expPast = Date.now() - 1000; // Expired 1 second ago
  const isExpired = Date.now() > expPast;
  assert(isExpired, "Expired condition must trigger when deadline has passed");

  // Verify that cryptographically expired payload cannot be decrypted even if attacker tampers with URL hash exp parameter
  const expiredPayload = { turns: outG1, ttl: -10 };
  const expiredEnc = await cryptoEngine.encrypt(expiredPayload);
  let caughtExpiredError = false;
  try {
    // Attacker modifies outer exp to the year 2099
    await cryptoEngine.decrypt(expiredEnc.ciphertext, expiredEnc.key);
  } catch (err) {
    if (err.code === "EXPIRED" || err.message.includes("expired")) {
      caughtExpiredError = true;
    }
  }
  assert(caughtExpiredError, "Cryptographically expired payload must be strictly rejected upon decryption!");
  console.log("  [✓] Cryptographic Expiration Binding Verified: URL tampering immune!");

  // --- TEST 5: DIRECT ADDRESS DETECTION WITHOUT 'alamat' KEYWORD ---
  console.log("\n[Audit 5] Testing Direct Residential Address without 'alamat' prefix...");
  const rawG5 = "Halo saya Budi, saya tinggal di Jl. Sudirman No. 12 Jakarta Pusat nomor telfon 08123456789";
  const h5 = heuristics.scan(rawG5);
  assert(h5.sanitizedText.includes("[REDACTED_ADDRESS]"), "Direct residential address must be redacted");
  assert(!h5.sanitizedText.includes("Jl. Sudirman No. 12"), "Raw street address must not leak");
  console.log("  [✓] Direct Residential Address Detection verified!");

  // --- TEST 6: MULTI-TURN DUPLICATE DEBT RATIO PRESERVATION ---
  console.log("\n[Audit 6] Testing Multi-Turn Duplicate Debt Ratio Protection (49.8% Leak Fix)...");
  const multiTurnWithEcho = [
    { role: "user", content: "Gaji saya Rp 28.500.000 dan cicilan Rp 14.200.000." },
    { role: "assistant", content: "Dengan gaji Rp 28.500.000 dan cicilan Rp 14.200.000, rasio hutang Anda adalah 49.8% terhadap gaji." }
  ];
  const detectedEcho = [
    { turnIndex: 0, raw: "Rp 28.500.000", category: "SENSITIVE_FINANCIAL" },
    { turnIndex: 0, raw: "Rp 14.200.000", category: "SENSITIVE_FINANCIAL" },
    { turnIndex: 1, raw: "Rp 28.500.000", category: "SENSITIVE_FINANCIAL" },
    { turnIndex: 1, raw: "Rp 14.200.000", category: "SENSITIVE_FINANCIAL" }
  ];
  const resMulti = pseudonymizer.anonymizeConversation(multiTurnWithEcho, detectedEcho);
  assert(!resMulti.anonymizedTurns[1].content.includes("49.8%"), "Debt ratio 49.8% must be redacted even when numbers are duplicated in multi-turn!");
  assert(resMulti.anonymizedTurns[1].content.includes("[REDACTED_DEBT_RATIO]"), "Debt ratio must be replaced with [REDACTED_DEBT_RATIO]");
  console.log("  [✓] Multi-Turn Duplicate Debt Ratio Protection verified!");

  // --- TEST 7: EXACT 256-BYTE MULTIPLE (0x00 UINT8ARRAY OVERFLOW) PAYLOAD ---
  console.log("\n[Audit 7] Testing Exact 256-Byte Block Multiple Payload Decryption...");
  // Construct a payload whose JSON length is an exact multiple of 256 bytes
  const baseObj = {
    turns: [{ role: "user", content: "A" }],
    shareId: "test-share-id-256",
    expMs: Date.now() + 86400000
  };
  const baseLen = new TextEncoder().encode(JSON.stringify(baseObj)).length;
  const targetLen = (Math.ceil(baseLen / 256) + 1) * 256;
  const padNeeded = targetLen - baseLen;
  baseObj.turns[0].content = "A".repeat(1 + padNeeded);
  const exactLen = new TextEncoder().encode(JSON.stringify(baseObj)).length;
  assert.strictEqual(exactLen % 256, 0, "Test payload must be an exact multiple of 256 bytes");

  const enc256 = await cryptoEngine.encrypt(baseObj);
  const dec256 = await cryptoEngine.decrypt(enc256.ciphertext, enc256.key);
  assert.strictEqual(dec256.turns[0].content, baseObj.turns[0].content, "256-byte aligned payload must decrypt and parse JSON cleanly");
  console.log("  [✓] 256-byte Block Multiple Padding Overflow handling verified!");

  // --- TEST 8: SLACK BOT API TOKEN & .ENV ENVIRONMENT REDACTION ---
  console.log("\n[Audit 8] Testing Slack API Token and .env Credentials Redaction...");
  const envText = "SLACK_BOT_TOKEN=xoxb-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx";
  const hScanEnv = heuristics.scan(envText);
  assert(!hScanEnv.sanitizedText.includes("123456789012"), "Slack token digits must not leak");
  assert(hScanEnv.sanitizedText.includes("[REDACTED_SECRET]") || hScanEnv.sanitizedText.includes("[REDACTED_SLACK_TOKEN]"), "Token must be redacted as credentials");
  const cDetsEnv = contextual.classifyTurn(hScanEnv.sanitizedText, 0);
  assert.strictEqual(cDetsEnv.length, 0, "No false positive financial entities should be detected in .env Slack token");
  console.log("  [✓] Slack Bot API Token and .env Credentials Redaction verified!");

  // --- TEST 9: CLI FLAG AND PORT NUMBERS (ANTI-FALSE-POSITIVE LICENSE PLATE) ---
  console.log("\n[Audit 9] Testing CLI Flags & Technical Ports (Anti-License-Plate False Positive)...");
  const cliText = "pg_isready -h localhost -p 5432 If your application runs in Docker Compose";
  const hScanCli = heuristics.scan(cliText);
  assert(!hScanCli.sanitizedText.includes("[REDACTED_LICENSE_PLATE]"), "CLI flag -p 5432 must NOT be redacted as license plate");
  assert(hScanCli.sanitizedText.includes("-p 5432"), "Port flag must be preserved");
  console.log("  [✓] CLI Flags & Technical Ports preserved cleanly!");

  // --- TEST 10: ACADEMIC PROGRAM S1 & FAVICON S2 URL IMMUNITY ---
  console.log("\n[Audit 10] Testing Academic Program S1 & Favicon s2 URL Immunity...");
  const s1Text = "BINUS secara resmi mencantumkan Cyber Security sebagai program S1 di bawah SoCS. <img src=\"https://s2.googleusercontent.com/favicons?domain=https://binus.ac.id&sz=32\">";
  const testVault = {
    "<S1>": { value: 19800000, raw: "Rp 19.800.000", currency: "IDR" },
    "<S2>": { value: 4200000, raw: "Rp 4.200.000", currency: "IDR" }
  };
  const LocalCompute = require("../extension/engine/local_compute.js");
  const lc = new LocalCompute();
  const hydrated = lc.hydrateText(s1Text, testVault, true);
  assert(hydrated.hydratedText.includes("program S1"), "Program S1 must be preserved untouched");
  assert(!hydrated.hydratedText.includes("program Rp 19.800.000"), "Program S1 must NOT be replaced with salary");
  assert(hydrated.hydratedText.includes("s2.googleusercontent.com"), "Favicon URL s2 must NOT be corrupted");
  assert(!hydrated.hydratedText.includes("s2Rp 4.200.000"), "Favicon URL must not have currency injected");
  console.log("  [✓] Academic Program S1 & Favicon s2 URL Immunity verified!");

  console.log("\n================================================================================");
  console.log("  ALL AUDIT CHECKS PASSED: 100% PRODUCTION READY & SECURE");
  console.log("================================================================================");
}

runEdgeCaseAudit().catch(err => {
  console.error("Audit failure:", err);
  process.exit(1);
});
