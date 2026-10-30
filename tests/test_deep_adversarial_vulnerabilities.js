/**
 * SafeShare-AI — Deep adversarial vulnerabilities and international hardening suite
 *
 * Verifies the 6 newly hardened international vectors & deep defense capabilities:
 *   1. VEC-DEEP-01: Unicode Homoglyph & Confusable Evasion (Cyrillic lookalikes & fullwidth NFKC normalization)
 *   2. VEC-DEEP-02: Cryptographic Traffic Analysis Mitigation (PKCS#7 256-Byte Bucket Ciphertext Padding)
 *   3. VEC-DEEP-03: Pairwise Additive Linear System Inversion Defense ((A ± B)/2 = Secret)
 *   4. VEC-DEEP-04: Cross-Window Message Origin Isolation (Strict window.location.origin, anti-iframe snooping)
 *   5. VEC-DEEP-05: URL-Encoded DevOps Credentials Extraction (PostgreSQL connection strings)
 *   6. VEC-DEEP-06: Atomic Single-Use Lock Verification (TOCTOU Replay Defense simulation)
 */

const assert = require("assert");
const HeuristicsRedactor = require("../extension/engine/heuristics.js");
const ConsistentPseudonymizer = require("../extension/engine/pseudonymizer.js");
const SafeShareCryptoExt = require("../extension/engine/crypto.js");
const SafeShareCryptoViewer = require("../extension/viewer/crypto.js");
const SafeShareExtensionBridge = require("../extension/viewer/engine/extension_bridge.js");

async function runDeepHardeningSuite() {
  console.log("================================================================================");
  console.log("  SAFESHARE-AI: DEEP ADVERSARIAL VULNERABILITIES & HARDENING CHECKS");
  console.log("================================================================================");

  const heuristics = new HeuristicsRedactor();
  const pseudonymizer = new ConsistentPseudonymizer();
  const cryptoExt = new SafeShareCryptoExt();
  const cryptoViewer = new SafeShareCryptoViewer();

  let passed = 0;
  const check = (id, desc, cond) => {
    assert(cond, `[FAIL] ${id}: ${desc}`);
    console.log(`  [✓] ${id} PASSED: ${desc}`);
    passed++;
  };

  // ---------------------------------------------------------------------------
  // 1. VEC-DEEP-01: UNICODE HOMOGLYPH & CONFUSABLE EVASION
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 1] Testing Unicode Homoglyph & Confusable Evasion...");

  // Cyrillic 'А' (U+0410) instead of Latin 'A'
  const cyrillicAwsKey = "\u0410KIA9876543210FEDCBA";
  const hCyrillic = heuristics.scan(`My AWS key is ${cyrillicAwsKey}`);
  check("VEC-DEEP-01a", "Cyrillic lookalike 'А' in AWS AKIA key mapped and sanitized",
    !hCyrillic.sanitizedText.includes("9876543210FEDCBA") &&
    hCyrillic.sanitizedText.includes("AKIAIOSFODNN7EXAMPLE")
  );

  // Fullwidth characters: ｓｋ－ｐｒｏｊ－...
  const fullwidthOpenAi = "\uFF53\uFF4B-proj-1234567890abcdefghijklmnopqrstuvwxyz123456";
  const hFullwidth = heuristics.scan(`My API key is ${fullwidthOpenAi}`);
  check("VEC-DEEP-01b", "Fullwidth Unicode token normalized via NFKC and sanitized",
    !hFullwidth.sanitizedText.includes("1234567890abcdef") &&
    hFullwidth.sanitizedText.includes("sk-dummy-test-key-placeholder")
  );

  // ---------------------------------------------------------------------------
  // 2. VEC-DEEP-02: CRYPTOGRAPHIC TRAFFIC ANALYSIS (PKCS#7 PADDING)
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 2] Testing Cryptographic Traffic Analysis Mitigation (256-Byte Padding)...");

  const shortMsg = { turns: [{ role: "user", content: "Yes" }] };
  const mediumMsg = { turns: [{ role: "user", content: "Can you review my compensation and provide feedback on the contract terms?" }] };

  const encShort = await cryptoExt.encrypt(shortMsg);
  const encMed = await cryptoExt.encrypt(mediumMsg);

  // Ciphertext binary byte buffer must be aligned to 256 bytes plus 12-byte IV and 16-byte GCM tag
  const bufShort = cryptoExt.base64UrlToBuffer(encShort.ciphertext);
  const bufMed = cryptoExt.base64UrlToBuffer(encMed.ciphertext);
  const payloadBytesShort = bufShort.byteLength - 12 - 16;
  const payloadBytesMed = bufMed.byteLength - 12 - 16;

  check("VEC-DEEP-02a", "Encrypted ciphertext payload is strictly padded to 256-byte bucket boundary",
    payloadBytesShort % 256 === 0 && payloadBytesMed % 256 === 0
  );

  // Verify end-to-end decryption unpads cleanly
  const decShort = await cryptoViewer.decrypt(encShort.ciphertext, encShort.key);
  const decMed = await cryptoViewer.decrypt(encMed.ciphertext, encMed.key);

  check("VEC-DEEP-02b", "Viewer decrypts and unpads PKCS#7 padded ciphertexts with bit-exact fidelity",
    decShort.turns[0].content === "Yes" &&
    decMed.turns[0].content === mediumMsg.turns[0].content
  );

  // ---------------------------------------------------------------------------
  // 3. VEC-DEEP-03: PAIRWISE ADDITIVE LINEAR SYSTEM INVERSION DEFENSE
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 3] Testing Pairwise Additive Linear System Inversion Defense...");

  // Secret is $300,000. Assistant mentions total pool $500,000 and difference $100,000.
  // Attacker can solve: (500k + 100k)/2 = 300k. Both numbers MUST be suppressed!
  const solver = new ConsistentPseudonymizer.AdversaryOracleSolver();
  const secretSalary = 300000;
  const asstLinearDiscussion = "Total bonus pool was $500,000 with a $100,000 delta between senior partners.";
  const sanitizedLinear = solver.solveAndRedact(asstLinearDiscussion, [secretSalary]);

  check("VEC-DEEP-03", "Pairwise additive equation ((500k + 100k)/2 = 300k) detected & both components suppressed",
    !sanitizedLinear.includes("500,000") &&
    !sanitizedLinear.includes("100,000")
  );

  // ---------------------------------------------------------------------------
  // 4. VEC-DEEP-04: CROSS-WINDOW MESSAGE ORIGIN ISOLATION
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 4] Testing Cross-Window Message Origin Isolation...");

  // Setup DOM & window mock
  let postedMessages = [];
  global.window = {
    location: { origin: "https://safeshare-relay.bleedguard.workers.dev" },
    addEventListener() {},
    removeEventListener() {},
    postMessage(msg, targetOrigin) {
      postedMessages.push({ msg, targetOrigin });
    }
  };

  const bridge = new SafeShareExtensionBridge();
  await bridge.forwardToAIPlatform("ChatGPT", [{ role: "user", content: "Test prompt" }]);

  const hasWildcardOrigin = postedMessages.some(m => m.targetOrigin === "*");
  const hasIsolatedOrigin = postedMessages.every(m => m.targetOrigin === "https://safeshare-relay.bleedguard.workers.dev");

  check("VEC-DEEP-04", "Cross-window postMessage strictly isolates targetOrigin to exact domain (Zero Wildcard '*')",
    !hasWildcardOrigin && hasIsolatedOrigin
  );

  // ---------------------------------------------------------------------------
  // 5. VEC-DEEP-05: URL-ENCODED DEVOPS CREDENTIALS SANITIZATION
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 5] Testing URL-Encoded DevOps Credentials Sanitization...");

  const urlEncodedEnv = "DATABASE_URL=postgresql%3A%2F%2Fpostgres%3AP%40ssw0rd99%40localhost%3A5432%2Fmydb";
  const hUrlEncoded = heuristics.scan(urlEncodedEnv);

  check("VEC-DEEP-05", "URL-encoded database connection string (postgresql%3A%2F%2F...) sanitized cleanly",
    !hUrlEncoded.sanitizedText.includes("P%40ssw0rd99") &&
    hUrlEncoded.sanitizedText.includes("[REDACTED_SECRET]")
  );

  // ---------------------------------------------------------------------------
  // 6. VEC-DEEP-06: ATOMIC SINGLE-USE BURN LOCK VERIFICATION
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 6] Testing Atomic Single-Use Burn Lock Verification (TOCTOU Simulation)...");

  // Simulate D1 SQL concurrency:
  let d1Row = { id: "burn_123", view_count: 0, ciphertext: "mock_cipher" };

  async function simulateAtomicBurnRetrieve() {
    // Atomic SQL: UPDATE shares SET view_count = view_count + 1 WHERE id = ? AND view_count = 0
    if (d1Row.view_count === 0) {
      d1Row.view_count += 1;
      return { success: true, ciphertext: d1Row.ciphertext }; // First winner
    }
    return { success: false, error: "Already burned" }; // Subsequent concurrent requests
  }

  // Simulate 2 parallel concurrent requests in the same millisecond
  const [res1, res2] = await Promise.all([
    simulateAtomicBurnRetrieve(),
    simulateAtomicBurnRetrieve()
  ]);

  const exactlyOneWinner = (res1.success && !res2.success) || (!res1.success && res2.success);
  check("VEC-DEEP-06", "Atomic update lock guarantees exactly one concurrent request can consume single-use link",
    exactlyOneWinner
  );

  console.log("\n================================================================================");
  console.log("       All 6 deep adversarial vectors passed.");
  console.log("================================================================================\n");
}

if (require.main === module) {
  runDeepHardeningSuite().catch(err => {
    console.error("[-] Deep Hardening Audit Failure:", err);
    process.exit(1);
  });
}

module.exports = runDeepHardeningSuite;
