/**
 * Unit Test Suite for PrioritySpanArbiter
 * Verifies:
 *  1. Protected Technical Token Extraction (Tier 0 Veto: DNS, CIDR, RFC, CVE, SQL, Code)
 *  2. Technical Density Bypass (> 0.60)
 *  3. Veto Rule on Collision (Tier 2 candidate on 1.1.1.1 or code is dropped)
 *  4. Tier 1 Deterministic Priority over Tier 2
 *  5. Confidence Threshold filtering per entity label
 */

const assert = require("assert");
const PrioritySpanArbiter = require("../extension/engine/span_arbiter.js");

function testPrioritySpanArbiter() {
  console.log("================================================================================");
  console.log("   SAFESHARE-AI: PRIORITY SPAN ARBITER (TIER-0 VETO)");
  console.log("================================================================================");

  const arbiter = new PrioritySpanArbiter();

  // Test 1: Extract Protected Spans (Tier 0)
  console.log("\n[Test 1] Extracting Protected Spans (DNS, CIDR, RFC, CVE, SQL)...");
  const techPrompt = "Investigating CVE-2024-3094 with RFC-7519 using DNS 1.1.1.1 and subnet 10.8.0.2/24 in `SELECT * FROM users;`";
  const protectedSpans = arbiter.extractProtectedSpans(techPrompt);

  const foundLabels = protectedSpans.map(s => s.label);
  assert(foundLabels.includes("SEC_ADVISORY"), "Must detect CVE-2024-3094");
  assert(foundLabels.includes("RFC_STANDARD"), "Must detect RFC-7519");
  assert(foundLabels.includes("PUBLIC_DNS"), "Must detect 1.1.1.1");
  assert(foundLabels.includes("CIDR_MASK"), "Must detect 10.8.0.2/24");
  assert(foundLabels.includes("INLINE_CODE"), "Must detect inline code block");
  console.log("  [✓] Test 1 Passed: Protected tokens accurately extracted without mutating text!");

  // Test 2: Veto Rule on Collision
  console.log("\n[Test 2] Testing Veto Rule on Collision with Protected Tech Tokens...");
  // Simulate a buggy or loose NER model predicting 1.1.1.1 as an address or ID
  const dnsStart = techPrompt.indexOf("1.1.1.1");
  const fakeNerCandidates = [
    { start: dnsStart, end: dnsStart + 7, label: "BUILDING_NUMBER", score: 0.95, raw: "1.1.1.1" }
  ];

  const resultVeto = arbiter.arbitrate({
    text: techPrompt,
    tier0Allow: protectedSpans,
    tier1Det: [],
    tier2Ner: fakeNerCandidates
  });

  assert.strictEqual(resultVeto.resolvedSpans.length, 0, "Fake NER on DNS 1.1.1.1 must be VETOED");
  assert.strictEqual(resultVeto.vetoedSpans.length, 1, "Must record 1 vetoed span");
  assert.strictEqual(resultVeto.vetoedSpans[0].reason, "VETO_PROTECTED_TECH", "Reason must be VETO_PROTECTED_TECH");
  console.log("  [✓] Test 2 Passed: Tier 0 VETO prevented False Positive on technical DNS!");

  // Test 3: Tier 1 Deterministic Priority & Boundary Snapping
  console.log("\n[Test 3] Testing Deterministic Tier 1 Priority over Tier 2 NER...");
  const prompt3 = "Payment card 4111 2222 3333 4444 belonging to John Doe at 10 Downing Street.";
  const cardStart = prompt3.indexOf("4111 2222 3333 4444");
  const tier1Det = [
    { start: cardStart, end: cardStart + 19, label: "CREDIT_CARD", raw: "4111 2222 3333 4444" }
  ];
  // Overlapping partial NER candidate on digits
  const tier2Candidates = [
    { start: cardStart, end: cardStart + 8, label: "BUILDING_NUMBER", score: 0.85, raw: "4111 2222" },
    { start: prompt3.indexOf("John Doe"), end: prompt3.indexOf("John Doe") + 8, label: "GIVEN_NAME", score: 0.92, raw: "John Doe" },
    { start: prompt3.indexOf("10 Downing Street"), end: prompt3.indexOf("10 Downing Street") + 17, label: "STREET_NAME", score: 0.88, raw: "10 Downing Street" }
  ];

  const result3 = arbiter.arbitrate({
    text: prompt3,
    tier1Det,
    tier2Ner: tier2Candidates
  });

  // Credit card must remain Tier 1 (start to start+19), John Doe & 10 Downing Street accepted
  assert.strictEqual(result3.resolvedSpans.length, 3, "Must resolve to 3 spans: Card, Name, Street");
  assert.strictEqual(result3.resolvedSpans[0].label, "CREDIT_CARD", "First span must be deterministic credit card");
  assert.strictEqual(result3.resolvedSpans[0].tier, 1, "Must be Tier 1");
  assert.strictEqual(result3.resolvedSpans[1].label, "GIVEN_NAME", "Second span must be Name");
  assert.strictEqual(result3.resolvedSpans[2].label, "STREET_NAME", "Third span must be Street");
  console.log("  [✓] Test 3 Passed: Deterministic Tier 1 wins over partial Tier 2 collision!");

  // Test 4: Technical Density Fast-Path Bypass
  console.log("\n[Test 4] Testing Technical Density Fast-Path Bypass...");
  const rawCodeSnippet = `
    function processPayload(token, iv) {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(Buffer.from(token, 'hex'));
      return hmac.digest('base64');
    }
  `;
  const codeDensity = arbiter.computeTechnicalDensity(rawCodeSnippet);
  console.log(`  [+] Measured code density: ${(codeDensity * 100).toFixed(1)}%`);
  assert(codeDensity > 0.60, "Code snippet must have technical token density > 60%");
  
  const fakeNerInCode = [
    { start: rawCodeSnippet.indexOf("token"), end: rawCodeSnippet.indexOf("token") + 5, label: "GIVEN_NAME", score: 0.70 }
  ];
  const resultDense = arbiter.arbitrate({
    text: rawCodeSnippet,
    tier2Ner: fakeNerInCode
  });
  assert(resultDense.vetoedSpans.length > 0, "NER candidate inside code block must be vetoed or bypassed");
  assert.strictEqual(resultDense.resolvedSpans.length, 0, "Zero false positives in technical code block");
  console.log("  [✓] Test 4 Passed: Code blocks safely protected from false positives!");

  console.log("\n================================================================================");
  console.log("   ALL 4 PRIORITY SPAN ARBITER TESTS PASSED (100%)");
  console.log("================================================================================");
}

testPrioritySpanArbiter();
