/**
 * SafeShare-AI — Comprehensive Multi-Turn Live Scenarios Verification
 * Validates the exact 5 real-world production transcripts tested by users in ChatGPT & Claude:
 * 
 *  Scenario 1: DevSecOps Incident (Port 5432 preserved, credentials & keys masked)
 *  Scenario 2: Startup Runway & SAFE Note (Burn rate, cash, $1.5M, $18M, $2.32M masked across ALL turns)
 *  Scenario 3: Anxious Budgeting & Debt Avalanche ($6,200, $2,400, $18k, $3,220, $1,710, $1,510 masked across ALL turns)
 *  Scenario 4: Psychiatric Meds & HIPAA (Lexapro, Wellbutrin XL, Adderall XR, ADHD masked across ALL turns)
 *  Scenario 5: Silicon Valley FAANG Tech Comp ($340k, $190k, $150k, $390k, $220k, $170k, $25k, $420k, $415k, $50k masked across ALL turns)
 */

const assert = require("assert");
const HeuristicsRedactor = require("./extension/engine/heuristics.js");
const ContextualClassifier = require("./extension/engine/contextual.js");
const ConsistentPseudonymizer = require("./extension/engine/pseudonymizer.js");

function runLiveMultiTurnAudit() {
  console.log("================================================================================");
  console.log("    SAFESHARE-AI: 5 REAL-WORLD LIVE CHATGPT/CLAUDE MULTI-TURN AUDIT");
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
    const allHeuristics = [];
    for (let i = 0; i < turns.length; i++) {
      const hRes = heuristics.scan(turns[i].content);
      allHeuristics.push(...hRes.detections);
      const cDets = contextual.classifyTurn(hRes.sanitizedText, i);
      allCtx.push(...cDets);
      intermediate.push({ role: turns[i].role, content: hRes.sanitizedText });
    }

    return pseudonymizer.anonymizeConversation(intermediate, allCtx, allHeuristics);
  }

  // --- SCENARIO 1: DEVSECOPS INCIDENT ---
  console.log("\n[Audit 1] Testing Scenario 1: DevSecOps Incident (Port 5432 & Key Masking)...");
  const s1User = "Urgent production incident: our payment ingest service is crashing with a connection pool timeout. Here is the staging snippet from our kubernetes secret config:\n\nDATABASE_URL: postgresql://svc_billing:SuperSecretP@ssw0rd99!@db-prod.internal:5432/orders\nANTHROPIC_API_KEY: sk-ant-api03-abcdef1234567890abcdef1234567890abcdef1234567890-AA\n\nThe service throws FATAL error.";
  const s1Asst = "First: rotate both secrets you pasted. For a single orders database: orders = host=db-prod.internal port=5432 dbname=orders. Then change your application DATABASE_URL to point to PgBouncer on port 6432 rather than directly at PostgreSQL on 5432.";

  const r1 = processDialogue(s1User, s1Asst);
  assert(!r1.anonymizedTurns[0].content.includes("SuperSecretP@ssw0rd99!"), "Password must be redacted");
  assert(!r1.anonymizedTurns[0].content.includes("sk-ant-api03"), "Anthropic key must be redacted");
  assert(r1.anonymizedTurns[0].content.includes(":5432"), "Port 5432 must be preserved in User turn!");
  assert(r1.anonymizedTurns[1].content.includes("port=5432"), "Port 5432 must be preserved in Assistant turn!");
  assert(r1.anonymizedTurns[1].content.includes("port 6432"), "Port 6432 must be preserved in Assistant turn!");
  console.log("  [✓] Audit 1 Passed: Password & API Key masked; Port 5432 & 6432 100% preserved!");

  // --- SCENARIO 2: STARTUP RUNWAY & SAFE NOTE ---
  console.log("\n[Audit 2] Testing Scenario 2: Startup Runway & SAFE Note Multi-Turn Inversion...");
  const s2User = "Prepping our Q3 board deck under a strict timeline. Our current burn rate is $145,000 a month and we have $820,000 left in our Silicon Valley Bank account, which leaves us with roughly 5.5 months of runway. An angel syndicate just offered a $1,500,000 bridge on a post-money SAFE note with an $18M valuation cap and a 15% discount. Help me evaluate the dilution impact on our 15% employee stock option pool (ESOP).";
  const s2Asst = "The headline number is: $1.5M on an $18M post-money SAFE implies ~8.33% ownership sold. Cash: $820k. Burn: $145k/month. Runway: 5.66 months. SAFE proceeds: +$1.5M. Pro-forma cash: $2.32M. Pre-money equivalent of roughly $16.5M. Proposed Angel SAFE: $1.5M post-money SAFE | $18M valuation cap | 15% discount.";

  const r2 = processDialogue(s2User, s2Asst);
  // User turn checks
  assert(!r2.anonymizedTurns[0].content.includes("$145,000"), "Burn rate must be redacted in User turn");
  assert(!r2.anonymizedTurns[0].content.includes("$820,000"), "Cash must be redacted in User turn");
  assert(!r2.anonymizedTurns[0].content.includes("$1,500,000"), "Bridge must be redacted in User turn");
  // Assistant turn checks (Zero leak)
  assert(!r2.anonymizedTurns[1].content.includes("$1.5M"), "$1.5M must be redacted in Assistant turn");
  assert(!r2.anonymizedTurns[1].content.includes("$18M"), "$18M must be redacted in Assistant turn");
  assert(!r2.anonymizedTurns[1].content.includes("$820k"), "$820k must be redacted in Assistant turn");
  assert(!r2.anonymizedTurns[1].content.includes("$145k"), "$145k must be redacted in Assistant turn");
  assert(!r2.anonymizedTurns[1].content.includes("$2.32M"), "Pro-forma $2.32M derived cash must be redacted in Assistant turn");
  assert(!r2.anonymizedTurns[1].content.includes("$16.5M"), "Pre-money $16.5M derived valuation must be redacted in Assistant turn");
  assert(r2.anonymizedTurns[1].content.includes("15% discount"), "Scale-free 15% discount must be preserved!");
  assert(r2.anonymizedTurns[1].content.includes("8.33%"), "Scale-free ownership 8.33% must be preserved!");
  console.log("  [✓] Audit 2 Passed: 100% of User & Assistant Startup figures ($145k, $820k, $1.5M, $18M, $2.32M, $16.5M) redacted!");

  // --- SCENARIO 3: ANXIOUS BUDGETING & DEBT AVALANCHE ---
  console.log("\n[Audit 3] Testing Scenario 3: Anxious Budgeting & Debt Avalanche Inversion...");
  const s3User = "Honestly feeling super stressed about money lately. I bring home roughly 6,200 a month after 401k and taxes, but my rent is 2,400, my car payment is 580, and I racked up about 18k in credit card debt at 24.9% APR during my recent relocation. Can you build an aggressive 12-month debt avalanche payoff plan for me? I want to know exactly how much discretionary cash I have left each month for groceries and utilities.";
  const s3Asst = "The key number is that $18,000 at 24.9% APR is expensive enough. Take-home pay: $6,200. Rent: -$2,400. Car payment: -$580. Available after these: $3,220. To eliminate $18,000 in 12 months at 24.9% APR, you need about $1,710/month. That means $3,220 - $1,710 = $1,510/month. Total payments: $20,519 ($2,519 interest).";

  const r3 = processDialogue(s3User, s3Asst);
  assert(!r3.anonymizedTurns[0].content.includes("6,200"), "Income must be redacted in User turn");
  assert(!r3.anonymizedTurns[0].content.includes("2,400"), "Rent must be redacted in User turn");
  assert(!r3.anonymizedTurns[0].content.includes("18k"), "Debt must be redacted in User turn");
  // Assistant turn checks (Zero leak)
  assert(!r3.anonymizedTurns[1].content.includes("18,000"), "$18,000 must be redacted in Assistant turn");
  assert(!r3.anonymizedTurns[1].content.includes("6,200"), "$6,200 must be redacted in Assistant turn");
  assert(!r3.anonymizedTurns[1].content.includes("2,400"), "$2,400 must be redacted in Assistant turn");
  assert(!r3.anonymizedTurns[1].content.includes("3,220"), "Derived available $3,220 must be redacted in Assistant turn");
  assert(!r3.anonymizedTurns[1].content.includes("1,710"), "Derived monthly target $1,710 must be redacted in Assistant turn");
  assert(!r3.anonymizedTurns[1].content.includes("1,510"), "Derived remainder $1,510 must be redacted in Assistant turn");
  assert(r3.anonymizedTurns[1].content.includes("24.9% APR"), "Scale-free 24.9% APR must be preserved!");
  assert(r3.anonymizedTurns[1].content.includes("12 months"), "12 months timeline must be preserved!");
  console.log("  [✓] Audit 3 Passed: 100% of User & Assistant Budgeting figures ($6,200, $2,400, $18k, $3,220, $1,710, $1,510) redacted!");

  // --- SCENARIO 4: PSYCHIATRIC MEDS & HIPAA ---
  console.log("\n[Audit 4] Testing Scenario 4: Psychiatric Meds & HIPAA Multi-Turn Echo...");
  const s4User = "Just saw my psychiatrist this morning and she switched me from 10mg Lexapro to 150mg Wellbutrin XL, plus 20mg Adderall XR for my adult ADHD. The issue is I'm getting terrible mid-afternoon energy crashes and insomnia, which is tanking my focus during sprint planning meetings.";
  const s4Asst = "Wellbutrin XL commonly causes insomnia, and Adderall XR is specifically intended to be taken upon awakening. Adderall XR 20 mg + Wellbutrin XL 150 mg exactly as prescribed. Since switching to Wellbutrin XL 150 mg and Adderall XR 20 mg, energy dip is expected.";

  const r4 = processDialogue(s4User, s4Asst);
  assert(!r4.anonymizedTurns[0].content.includes("Lexapro"), "Lexapro must be redacted in User turn");
  assert(!r4.anonymizedTurns[0].content.includes("Wellbutrin"), "Wellbutrin must be redacted in User turn");
  assert(!r4.anonymizedTurns[0].content.includes("Adderall"), "Adderall must be redacted in User turn");
  assert(!r4.anonymizedTurns[0].content.includes("ADHD"), "ADHD must be redacted in User turn");
  // Assistant turn checks (Zero leak)
  assert(!r4.anonymizedTurns[1].content.includes("Wellbutrin"), "Wellbutrin must be redacted in Assistant turn");
  assert(!r4.anonymizedTurns[1].content.includes("Adderall"), "Adderall must be redacted in Assistant turn");
  assert(r4.anonymizedTurns[1].content.includes("insomnia"), "Medical symptoms must be preserved for utility!");
  console.log("  [✓] Audit 4 Passed: 100% of User & Assistant Psychiatric Drugs (Lexapro, Wellbutrin, Adderall) redacted!");

  // --- SCENARIO 5: SILICON VALLEY TECH COMP ---
  console.log("\n[Audit 5] Testing Scenario 5: Silicon Valley FAANG Tech Comp Multi-Turn Derivations...");
  const s5User = "Hey, need some honest career advice. I'm currently an L5 at Amazon making 340k TC (190k base, 150k RSUs). Just received an offer from Stripe for 390k (220k base, 170k equity) plus a 25k sign-on bonus. My monthly rent in SF is $3,600 and I still have $42,000 in student loans at 6.8%. Can you help me draft a confident, professional counter-offer email to push for 420k total comp, and break down whether the commute and WLB tradeoff makes sense?";
  const s5Asst = "Yes. I’d counter at $420K TC. I am currently at approximately $340K at Amazon, including $190K base and approximately $150K in equity. Stripe offer: Base $220K, Equity $170K, Sign-on $25K, Recurring TC $390K, First-year comp $415K. Target: Recurring TC $420K, First-year comp $445K. $390K vs $340K is only +$50K/year. Student loan $42K costs $2,856/year or $238/month.";

  const r5 = processDialogue(s5User, s5Asst);
  assert(!r5.anonymizedTurns[0].content.includes("340k"), "340k must be redacted in User turn");
  assert(!r5.anonymizedTurns[0].content.includes("190k"), "190k must be redacted in User turn");
  assert(!r5.anonymizedTurns[0].content.includes("150k"), "150k must be redacted in User turn");
  assert(!r5.anonymizedTurns[0].content.includes("390k"), "390k must be redacted in User turn");
  assert(!r5.anonymizedTurns[0].content.includes("420k"), "420k must be redacted in User turn");
  assert(!r5.anonymizedTurns[0].content.includes("$3,600"), "Rent must be redacted in User turn");
  assert(!r5.anonymizedTurns[0].content.includes("$42,000"), "Student loans must be redacted in User turn");
  // Assistant turn checks (Zero leak)
  assert(!r5.anonymizedTurns[1].content.includes("420K"), "$420K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("340K"), "$340K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("190K"), "$190K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("150K"), "$150K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("220K"), "$220K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("170K"), "$170K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("25K"), "$25K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("390K"), "$390K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("415K"), "Derived $415K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("445K"), "Derived $445K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("50K"), "Derived diff $50K must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("42K"), "$42K student loan must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("2,856"), "Derived loan interest $2,856 must be redacted in Assistant turn");
  assert(!r5.anonymizedTurns[1].content.includes("238"), "Derived monthly loan $238 must be redacted in Assistant turn");
  assert(r5.anonymizedTurns[0].content.includes("6.8%"), "Scale-free 6.8% rate must be preserved in User turn!");
  assert(r5.anonymizedTurns[1].content.includes("Amazon"), "Company name must be preserved!");
  assert(r5.anonymizedTurns[1].content.includes("Stripe"), "Company name must be preserved!");
  console.log("  [✓] Audit 5 Passed: 100% of User & Assistant FAANG Comp ($340k, $190k, $150k, $390k, $220k, $170k, $25k, $420k, $415k, $50k, $42k, $2,856, $238) redacted!");

  console.log("\n================================================================================");
  console.log("    ALL 5 REAL-WORLD MULTI-TURN INCIDENT & COMP SCENARIOS PASSED 100%!");
  console.log("================================================================================\n");
}

if (require.main === module) {
  runLiveMultiTurnAudit();
}

module.exports = runLiveMultiTurnAudit;
