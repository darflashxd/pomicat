/**
 * SafeShare-AI — SafeShare-PrivacyBench Out-of-Distribution (OOD) Human Benchmark
 * 
 * Evaluates real-world, human-written conversational prompts (typo-heavy, informal,
 * non-template) to compute formal cybersecurity metrics:
 *   - Secret Exposure Rate (SER)
 *   - Utility Degradation Rate (UDR)
 *   - Latency per Turn
 * 
 * Standard: Black Hat Asia 2027 Arsenal & USENIX Security
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const HeuristicsRedactor = require("./extension/engine/heuristics.js");
const ContextualClassifier = require("./extension/engine/contextual.js");
const ConsistentPseudonymizer = require("./extension/engine/pseudonymizer.js");

function runPrivacyBenchOODAudit() {
  console.log("================================================================================");
  console.log("   SAFESHARE-PRIVACYBENCH: OUT-OF-DISTRIBUTION (OOD) HUMAN BENCHMARK AUDIT");
  console.log("================================================================================");

  const oodPath = path.join(__dirname, "data", "test_ood_human.json");
  if (!fs.existsSync(oodPath)) {
    console.error(`[-] Benchmark file not found: ${oodPath}`);
    process.exit(1);
  }

  const cases = JSON.parse(fs.readFileSync(oodPath, "utf-8"));
  console.log(`[*] Loaded ${cases.length} out-of-distribution human conversational test prompts.\n`);

  let totalEntities = 0;
  let exposedEntities = 0;
  let totalNegatives = 0;
  let degradedNegatives = 0;
  let passedPrompts = 0;

  const startTime = Date.now();

  for (const c of cases) {
    const heuristics = new HeuristicsRedactor();
    const contextual = new ContextualClassifier();
    const pseudonymizer = new ConsistentPseudonymizer();

    const hRes = heuristics.scan(c.text);
    const cDets = contextual.classifyTurn(hRes.sanitizedText, 0);

    const { anonymizedTurns } = pseudonymizer.anonymizeConversation(
      [{ role: "user", content: hRes.sanitizedText }],
      cDets
    );

    const out = anonymizedTurns[0].content;
    let promptPassed = true;

    // 1. Evaluate Secret Exposure Rate (SER)
    for (const ent of c.entities) {
      totalEntities++;
      if (out.includes(ent.raw)) {
        exposedEntities++;
        promptPassed = false;
        console.error(`  [!] FAIL in ${c.id}: Entity '${ent.raw}' leaked in output!\n      Output: "${out}"`);
      }
    }

    // 2. Evaluate Hard Negatives (Utility Preservation / Zero False Positive)
    if (c.entities.length === 0) {
      totalNegatives++;
      if (out.includes("[REDACTED_") || out.includes("[INTERNAL_CORP_ASSET")) {
        degradedNegatives++;
        promptPassed = false;
        console.error(`  [!] FAIL in ${c.id}: Hard negative prompt over-redacted!\n      Output: "${out}"`);
      }
    }

    if (promptPassed) {
      passedPrompts++;
      console.log(`  [✓] ${c.id} PASSED (${c.entities.length > 0 ? c.entities.length + ' entities protected' : 'safe negative preserved'})`);
    } else {
      console.log(`  [✗] ${c.id} FAILED`);
    }
  }

  const durationMs = Date.now() - startTime;
  const avgLatency = (durationMs / cases.length).toFixed(2);

  const serRate = totalEntities > 0 ? ((exposedEntities / totalEntities) * 100).toFixed(2) : "0.00";
  const udrRate = totalNegatives > 0 ? ((degradedNegatives / totalNegatives) * 100).toFixed(2) : "0.00";

  console.log("\n================================================================================");
  console.log("            SAFESHARE-PRIVACYBENCH OOD FORMAL SECURITY METRICS");
  console.log("================================================================================");
  console.log(`[*] Total Prompts Evaluated           : ${cases.length}`);
  console.log(`[*] Prompts 100% Passed               : ${passedPrompts} / ${cases.length} (${((passedPrompts / cases.length) * 100).toFixed(1)}%)`);
  console.log(`[*] Secret Exposure Rate (SER)        : ${serRate}% (Target: 0.00%)`);
  console.log(`[*] Utility Degradation Rate (UDR)    : ${udrRate}% (Target: 0.00%)`);
  console.log(`[*] Real-World Human Detection Recall : ${(((totalEntities - exposedEntities) / totalEntities) * 100).toFixed(1)}%`);
  console.log(`[*] Average Processing Latency        : ${avgLatency} ms per turn`);
  console.log("================================================================================");

  if (exposedEntities === 0 && degradedNegatives === 0) {
    console.log("  >>> PRIVACYBENCH OOD HUMAN BENCHMARK PASSED 100% (ZERO LEAKS & ZERO OVER-REDACTION)! <<<");
    console.log("================================================================================\n");
    return true;
  } else {
    console.error(`[-] BENCHMARK FAILED: SER=${serRate}%, UDR=${udrRate}%`);
    process.exit(1);
  }
}

if (require.main === module) {
  runPrivacyBenchOODAudit();
}

module.exports = runPrivacyBenchOODAudit;
