/**
 * SafeShare-AI — Universal Domain Invariance Adversarial Benchmark
 * Validates cross-domain invariance across 6 critical operational sectors:
 * 
 *  1. Retail Banking & Debit Cards (Wells Fargo - Fail-Closed Card, CVV, Expiry, Account, Toll-Free Hotline)
 *  2. Student & Personal Lending (SoFi - Loan Identifier, Account Sweep, Payoff Timeline)
 *  3. Healthcare Insurance & Claims (Aetna - Member ID, Group #, Claim #, Coinsurance Utility)
 *  4. Aviation & Passenger Booking (United - PNR 6-char AlphaNum, E-Ticket 13-digit, IATA Codes)
 *  5. Logistics & E-Commerce (UPS Tracking 1Z, Order ID, Physical Address Redaction)
 *  6. Technical Standards & Support (Model tags, RFC, CVE, Enterprise Support Hotline Preservation)
 */

const assert = require("assert");
const HeuristicsRedactor = require("./extension/engine/heuristics.js");
const ContextualClassifier = require("./extension/engine/contextual.js");
const ConsistentPseudonymizer = require("./extension/engine/pseudonymizer.js");

function runUniversalDomainInvarianceSuite() {
  console.log("================================================================================");
  console.log("   SAFESHARE-AI: UNIVERSAL DOMAIN INVARIANCE BENCHMARK (BLACK HAT ARSENAL)");
  console.log("================================================================================");

  const heuristics = new HeuristicsRedactor();
  const contextual = new ContextualClassifier();
  const pseudonymizer = new ConsistentPseudonymizer();

  function processDialogue(userText, asstText) {
    pseudonymizer.reset();
    const turns = [
      { role: "user", content: userText },
      { role: "assistant", content: asstText }
    ];

    const intermediate = [];
    const allCtx = [];
    const allH = [];
    for (let i = 0; i < turns.length; i++) {
      const hRes = heuristics.scan(turns[i].content);
      allH.push(...hRes.detections);
      const cDets = contextual.classifyTurn(hRes.sanitizedText, i);
      allCtx.push(...cDets);
      intermediate.push({ role: turns[i].role, content: hRes.sanitizedText });
    }

    return pseudonymizer.anonymizeConversation(intermediate, allCtx, allH);
  }

  // --- DOMAIN 1: RETAIL BANKING & CARDS ---
  console.log("\n[Domain 1] Testing Retail Banking & Card Security Suite (Wells Fargo)...");
  const d1User = "My direct deposit goes to checking account WF-990218374. I used my debit card 4417-8823-9901-2276 (exp 08/27, CVV 339) at Target and it was declined.";
  const d1Asst = "For card ending in 2276 on checking account WF-990218374, you should contact Wells Fargo customer support hotline at 1-800-869-3557 to unfreeze the card.";

  const r1 = processDialogue(d1User, d1Asst);
  assert(!r1.anonymizedTurns[0].content.includes("WF-990218374"), "Bank account WF-990218374 must be redacted in User turn!");
  assert(!r1.anonymizedTurns[0].content.includes("4417-8823-9901-2276"), "Debit card number must be redacted in User turn via Fail-Closed Check!");
  assert(!r1.anonymizedTurns[0].content.includes("08/27"), "Card expiry 08/27 must be redacted in User turn!");
  assert(!r1.anonymizedTurns[0].content.includes("339"), "Card CVV 339 must be redacted in User turn!");
  assert(!r1.anonymizedTurns[1].content.includes("WF-990218374"), "Bank account WF-990218374 must be redacted across Assistant turn!");
  assert(!r1.anonymizedTurns[1].content.includes("2276"), "Card last 4 digits must be redacted in Assistant turn!");
  assert(r1.anonymizedTurns[1].content.includes("1-800-869-3557"), "Official 1-800 Wells Fargo hotline must be 100% PRESERVED!");
  assert(r1.anonymizedTurns[0].content.includes("Target"), "Merchant Target must be preserved!");
  console.log("  [✓] Domain 1 Passed: Fail-closed card, CVV, expiry, account redacted; Official 1-800 hotline preserved!");

  // --- DOMAIN 2: STUDENT & PERSONAL LOANS ---
  console.log("\n[Domain 2] Testing Student & Personal Lending Security (SoFi)...");
  const d2User = "I have a personal loan SOFI-99821174 with monthly autopay of $450 from my checking account 990218374. My remaining principal is $14,250 at 8.5% interest.";
  const d2Asst = "With an outstanding balance of $14,250 on loan SOFI-99821174, continuing $450 payments will pay it off in 36 months. Ensure account 990218374 has sufficient funds.";

  const r2 = processDialogue(d2User, d2Asst);
  assert(!r2.anonymizedTurns[0].content.includes("SOFI-99821174"), "Loan ID SOFI-99821174 must be redacted in User turn!");
  assert(!r2.anonymizedTurns[0].content.includes("990218374"), "Account 990218374 must be redacted in User turn!");
  assert(!r2.anonymizedTurns[0].content.includes("$450"), "Autopay payment must be redacted in User turn!");
  assert(!r2.anonymizedTurns[0].content.includes("$14,250"), "Loan principal must be redacted in User turn!");
  assert(!r2.anonymizedTurns[1].content.includes("SOFI-99821174"), "Loan ID SOFI-99821174 must be redacted in Assistant turn!");
  assert(!r2.anonymizedTurns[1].content.includes("990218374"), "Account 990218374 must be redacted in Assistant turn!");
  assert(!r2.anonymizedTurns[1].content.includes("$14,250"), "Principal must be redacted in Assistant turn!");
  assert(!r2.anonymizedTurns[1].content.includes("$450"), "Autopay must be redacted in Assistant turn!");
  assert(r2.anonymizedTurns[0].content.includes("8.5%"), "Scale-free interest rate 8.5% must be preserved!");
  assert(r2.anonymizedTurns[1].content.includes("36 months"), "Scale-free timeline 36 months must be preserved!");
  console.log("  [✓] Domain 2 Passed: Loan identifier, account number, and amounts cleanly redacted across both turns!");

  // --- DOMAIN 3: HEALTHCARE INSURANCE & CLAIMS ---
  console.log("\n[Domain 3] Testing Healthcare Insurance & Medical Claims (Aetna)...");
  const d3User = "Here are my policy details: member ID AETNA-8849201, group number GRP-90218, claim #CLM-77821094 for an MRI brain scan billing $3,400.";
  const d3Asst = "Regarding claim CLM-77821094 under policy AETNA-8849201 and group GRP-90218, the MRI scan charge of $3,400 has an in-network allowable amount of $850 with 20% coinsurance.";

  const r3 = processDialogue(d3User, d3Asst);
  assert(!r3.anonymizedTurns[0].content.includes("AETNA-8849201"), "Member ID must be redacted in User turn!");
  assert(!r3.anonymizedTurns[0].content.includes("GRP-90218"), "Group number must be redacted in User turn!");
  assert(!r3.anonymizedTurns[0].content.includes("CLM-77821094"), "Claim number must be redacted in User turn!");
  assert(r3.anonymizedTurns[0].content.includes("policy details:"), "Common English phrase 'policy details:' must not be mangled!");
  assert(!r3.anonymizedTurns[1].content.includes("AETNA-8849201"), "Member ID must be redacted in Assistant turn!");
  assert(!r3.anonymizedTurns[1].content.includes("GRP-90218"), "Group number must be redacted in Assistant turn!");
  assert(!r3.anonymizedTurns[1].content.includes("CLM-77821094"), "Claim number must be redacted in Assistant turn!");
  assert(!r3.anonymizedTurns[1].content.includes("$3,400"), "Billed charge must be redacted in Assistant turn!");
  assert(r3.anonymizedTurns[1].content.includes("20% coinsurance"), "Scale-free 20% coinsurance must be preserved!");
  console.log("  [✓] Domain 3 Passed: Health insurance member ID, group, and claim codes redacted with zero over-redaction!");

  // --- DOMAIN 4: AVIATION & PASSENGER BOOKING ---
  console.log("\n[Domain 4] Testing Aviation & Passenger Booking PNR (United Airlines)...");
  const d4User = "I need to change my flight from JFK to LHR. My booking ref #6X9K2M and e-ticket number is 016-2491823901.";
  const d4Asst = "I see your reservation under booking 6X9K2M with e-ticket 016-2491823901 for JFK to LHR. The change fee is $200 plus fare difference.";

  const r4 = processDialogue(d4User, d4Asst);
  assert(!r4.anonymizedTurns[0].content.includes("6X9K2M"), "Booking PNR 6X9K2M must be redacted in User turn!");
  assert(!r4.anonymizedTurns[0].content.includes("016-2491823901"), "E-ticket 016-2491823901 must be redacted in User turn!");
  assert(r4.anonymizedTurns[0].content.includes("e-ticket"), "Word 'e-ticket' must not be mangled!");
  assert(r4.anonymizedTurns[0].content.includes("booking ref"), "Word 'booking ref' must not be mangled!");
  assert(!r4.anonymizedTurns[1].content.includes("6X9K2M"), "Booking PNR must be redacted in Assistant turn!");
  assert(!r4.anonymizedTurns[1].content.includes("016-2491823901"), "E-ticket must be redacted in Assistant turn!");
  assert(r4.anonymizedTurns[0].content.includes("JFK"), "Airport code JFK must be preserved!");
  assert(r4.anonymizedTurns[0].content.includes("LHR"), "Airport code LHR must be preserved!");
  console.log("  [✓] Domain 4 Passed: 6-char AlphaNum PNR and 13-digit E-ticket sanitized; IATA airport codes preserved!");

  // --- DOMAIN 5: LOGISTICS & E-COMMERCE ---
  console.log("\n[Domain 5] Testing Logistics & E-Commerce Tracking (UPS & Orders)...");
  const d5User = "Where is my package? Order number is ORD-98231048, tracking number 1Z9999999999999999, shipping to 742 Evergreen Terrace, Springfield.";
  const d5Asst = "Order ORD-98231048 with UPS tracking 1Z9999999999999999 was dispatched to 742 Evergreen Terrace and is out for delivery today by 5 PM.";

  const r5 = processDialogue(d5User, d5Asst);
  assert(!r5.anonymizedTurns[0].content.includes("ORD-98231048"), "Order ID must be redacted in User turn!");
  assert(!r5.anonymizedTurns[0].content.includes("1Z9999999999999999"), "UPS tracking number must be redacted in User turn!");
  assert(!r5.anonymizedTurns[0].content.includes("742 Evergreen Terrace"), "Physical address must be redacted in User turn!");
  assert(!r5.anonymizedTurns[1].content.includes("ORD-98231048"), "Order ID must be redacted in Assistant turn!");
  assert(!r5.anonymizedTurns[1].content.includes("1Z9999999999999999"), "UPS tracking number must be redacted in Assistant turn!");
  assert(!r5.anonymizedTurns[1].content.includes("742 Evergreen Terrace"), "Physical address must be redacted in Assistant turn!");
  assert(r5.anonymizedTurns[1].content.includes("5 PM"), "Delivery time 5 PM must be preserved!");
  console.log("  [✓] Domain 5 Passed: Order ID, 1Z UPS tracking, and physical address cleanly sanitized across all turns!");

  // --- DOMAIN 6: TECHNICAL STANDARDS & PUBLIC HOTLINES ---
  console.log("\n[Domain 6] Testing Technical Standards & Enterprise Support Zero False Positive...");
  const d6User = "We are integrating claude-3-5-sonnet-20241022 into our OAuth service following RFC-7519 and mitigating CVE-2024-3094. For Amazon Web Services enterprise support, call 1-888-280-4331.";
  const d6Asst = "Using claude-3-5-sonnet-20241022 with RFC-7519 JWT verification addresses CVE-2024-3094. You can also reach AWS support at 1-888-280-4331 if infrastructure issues arise.";

  const r6 = processDialogue(d6User, d6Asst);
  assert(r6.anonymizedTurns[0].content.includes("claude-3-5-sonnet-20241022"), "Claude model identifier must be 100% PRESERVED!");
  assert(r6.anonymizedTurns[1].content.includes("claude-3-5-sonnet-20241022"), "Claude model identifier in Assistant turn must be 100% PRESERVED!");
  assert(r6.anonymizedTurns[0].content.includes("RFC-7519"), "Technical RFC standard must be 100% PRESERVED!");
  assert(r6.anonymizedTurns[1].content.includes("RFC-7519"), "Technical RFC standard in Assistant turn must be 100% PRESERVED!");
  assert(r6.anonymizedTurns[0].content.includes("CVE-2024-3094"), "Security CVE advisory must be 100% PRESERVED!");
  assert(r6.anonymizedTurns[1].content.includes("CVE-2024-3094"), "Security CVE advisory in Assistant turn must be 100% PRESERVED!");
  assert(r6.anonymizedTurns[0].content.includes("1-888-280-4331"), "Toll-free AWS support hotline in User turn must be 100% PRESERVED!");
  assert(r6.anonymizedTurns[1].content.includes("1-888-280-4331"), "Toll-free AWS support hotline in Assistant turn must be 100% PRESERVED!");
  console.log("  [✓] Domain 6 Passed: Model versions, RFC standards, CVE numbers, and toll-free hotlines 100% preserved (0% FP)!");

  console.log("\n================================================================================");
  console.log("   ALL 6 UNIVERSAL DOMAIN INVARIANCE BENCHMARKS PASSED 100%!");
  console.log("================================================================================\n");
}

if (require.main === module) {
  runUniversalDomainInvarianceSuite();
}

module.exports = runUniversalDomainInvarianceSuite;
