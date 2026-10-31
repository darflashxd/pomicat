/**
 * PomiCat: Real-World De Jembras Benchmark Verification
 * 
 * Verifies the 5 critical failure modes identified in the case study:
 *   1. Key-Value Form Delimiter Name Extraction (name : de jembras -> name : [User_A])
 *   2. Academic Domain Identifier (NIM : 3002455595 -> NIM : [REDACTED_NIM])
 *   3. Multi-Year Algebraic Reconstruction Defense (10.8M, 21.6M, 32.4M, 54M)
 *   4. Zero Substring Slicing Mangling (Never slices .4 million into Rp32.[...])
 *   5. Scale-Free Utility Preservation (30%, 40%, 15%, 10%, 5%, 100%, 1-5 years, Indeed Rp 25.91M)
 */

const assert = require("assert");
const HeuristicsRedactor = require("../extension/engine/heuristics.js");
const ContextualClassifier = require("../extension/engine/contextual.js");
const ConsistentPseudonymizer = require("../extension/engine/pseudonymizer.js");

function runDeJembrasBenchmark() {
  console.log("================================================================================");
  console.log("      SAFESHARE-AI: REAL-WORLD DE JEMBRAS ALGEBRAIC BENCHMARK AUDIT");
  console.log("================================================================================");

  const heuristics = new HeuristicsRedactor();
  const contextual = new ContextualClassifier();
  const pseudonymizer = new ConsistentPseudonymizer();

  const deJembrasUser = `name : de jembras
NIM : 3002455595

my salary is Rp 3.000.000 and i would like to safe some my salary to buy cars in indonesia`;

  const deJembrasAssistant = `Sure. With a [REDACTED_FINANCIAL_1]/month salary, you can start saving for a car, but the target should be realistic and you should avoid putting your entire salary toward the car.

Suggested monthly budget
Category	Amount	%
🏦 Car savings	Rp900.000	30%
🍚 Food & daily needs	Rp1.200.000	40%
🚆 Transport	Rp450.000	15%
📱 Phone/internet & personal	Rp300.000	10%
🛟 Emergency/other	Rp150.000	5%
Total	Rp3.000.000	100%

If you save Rp900.000/month:

1 year → Rp10.8 million

2 years → Rp21.6 million

3 years → Rp32.4 million

5 years → Rp54 million

For a car in Indonesia, remember that the purchase price isn't the only cost. You'll also need to budget for fuel, maintenance, tax, insurance, parking, and unexpected repairs.

Market comparison: Indeed reports average salary for programmers in Jakarta is Rp 25.91 million.`;

  const turns = [
    { role: "user", content: deJembrasUser },
    { role: "assistant", content: deJembrasAssistant }
  ];

  const intermediateTurns = [];
  const detected = [];

  turns.forEach((t, i) => {
    const hRes = heuristics.scan(t.content);
    const cHits = contextual.classifyTurn(hRes.sanitizedText, i);
    detected.push(...cHits);
    intermediateTurns.push({ role: t.role, content: hRes.sanitizedText });
  });

  const res = pseudonymizer.anonymizeConversation(intermediateTurns, detected);

  console.log("\n[Sanitized User Turn]:\n", res.anonymizedTurns[0].content);
  console.log("\n[Sanitized Assistant Turn]:\n", res.anonymizedTurns[1].content);

  // Assertion 1: Key-Value name format 'name : de jembras' -> 'name : [User_A]'
  assert(!res.anonymizedTurns[0].content.includes("de jembras"), "Raw name 'de jembras' must be sanitized!");
  assert(res.anonymizedTurns[0].content.includes("[User_A]"), "Name must be mapped to [User_A]");
  console.log("\n  [✓] Check 1: Key-Value name format 'name : de jembras' -> 'name : [User_A]'");

  // Assertion 2: Academic ID 'NIM : 3002455595' -> 'NIM : [REDACTED_NIM]'
  assert(!res.anonymizedTurns[0].content.includes("3002455595"), "Student ID (NIM) must be sanitized!");
  assert(res.anonymizedTurns[0].content.includes("[REDACTED_NIM]"), "NIM must be tagged [REDACTED_NIM]");
  console.log("  [✓] Check 2: Academic identifier 'NIM : 3002455595' -> 'NIM : [REDACTED_NIM]'");

  // Assertion 3: Original salary in user turn
  assert(!res.anonymizedTurns[0].content.includes("3.000.000"), "Base salary must not leak in user turn!");
  assert(res.anonymizedTurns[0].content.includes("[REDACTED_FINANCIAL_1]"));
  console.log("  [✓] Check 3: Base salary 3.000.000 redacted cleanly as [REDACTED_FINANCIAL_1]");

  // Assertion 4: Multi-year accumulations (10.8M, 21.6M, 32.4M, 54M)
  assert(!res.anonymizedTurns[1].content.includes("10.8 million"), "1-year accumulation (10.8M) must not leak!");
  assert(!res.anonymizedTurns[1].content.includes("21.6 million"), "2-year accumulation (21.6M) must not leak!");
  assert(!res.anonymizedTurns[1].content.includes("32.4 million"), "3-year accumulation (32.4M) must not leak!");
  assert(!res.anonymizedTurns[1].content.includes("54 million"), "5-year accumulation (54M) must not leak!");
  assert(res.anonymizedTurns[1].content.includes("[REDACTED_SAVINGS_ACCUMULATION]"), "Must use savings accumulation tag");
  console.log("  [✓] Check 4: Multi-year accumulation numbers (10.8M, 21.6M, 32.4M, 54M) completely blocked!");

  // Assertion 5: Zero text mangling (never produces 'Rp32.[REDACTED]')
  assert(!res.anonymizedTurns[1].content.includes("Rp32."), "Substring slicing mangling (Rp32.[...]) must be ELIMINATED!");
  console.log("  [✓] Check 5: Zero text mangling confirmed (Whole-token span replacement)!");

  // Assertion 6: Scale-free quantities preserved
  assert(res.anonymizedTurns[1].content.includes("30%"), "Scale-free ratio 30% must be preserved");
  assert(res.anonymizedTurns[1].content.includes("40%"), "Scale-free ratio 40% must be preserved");
  assert(res.anonymizedTurns[1].content.includes("1 year"), "Timeline year counts must be preserved");
  console.log("  [✓] Check 6: Scale-free quantities (30%, 40%, year counts) 100% preserved for utility!");

  // Assertion 7: Independent market benchmarks preserved
  assert(res.anonymizedTurns[1].content.includes("Rp 25.91 million"), "Public market benchmark (Indeed Rp 25.91M) must remain untouched!");
  console.log("  [✓] Check 7: Zero false positive on public benchmark (Indeed Rp 25.91M)!");

  console.log("\n================================================================================");
  console.log("   ALL 7 DE JEMBRAS AUDIT CHECKS PASSED: ZERO LEAKS & ZERO MANGLING!");
  console.log("================================================================================");
}

runDeJembrasBenchmark();
