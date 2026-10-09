/**
 * SafeShare-AI — Comprehensive Symbolic Transformation & LOCAL_COMPUTE Audit
 * Validates the Next-Generation Hard Technical Moat:
 * 
 *  1. Invariant: secret ∉ outbound_prompt (Zero server-side leakage).
 *  2. Dijkstra Shunting-Yard AST Operator Precedence & Parentheses (Zero eval() / XSS immune).
 *  3. In-Context Steering Protocol generation (ID & EN).
 *  4. Ephemeral Vault Lifecycle (session storage, symbol deduplication, purge).
 *  5. Local Compute Hydration across diverse currencies (IDR, USD, EUR, GBP).
 *  6. Multi-turn compound expressions (<S1> - <S2>, 12 * 0.30 * <S1>, (<S1> * 1.15) - 500000).
 *  7. Graceful degradation on malformed formulas (Zero crash).
 */

const assert = require("assert");
const SafeShareLocalCompute = require("./extension/engine/local_compute.js");
const SafeShareSymbolicVault = require("./extension/engine/symbolic_vault.js");
const SafeShareSymbolicRewriter = require("./extension/engine/symbolic_rewriter.js");

function runSymbolicLocalComputeSuite() {
  console.log("================================================================================");
  console.log("   SAFESHARE-AI: PRE-INFERENCE SYMBOLIC & LOCAL_COMPUTE AUDIT (BLACK HAT)");
  console.log("================================================================================");

  const localCompute = new SafeShareLocalCompute();
  const vault = new SafeShareSymbolicVault();
  const rewriter = new SafeShareSymbolicRewriter(vault);

  // --- TEST 1: OPERATOR PRECEDENCE & SHUNTING-YARD AST ---
  console.log("\n[Test 1] Testing Shunting-Yard AST Precedence & Parentheses (Zero-Eval)...");
  assert.strictEqual(localCompute.compute("2 + 3 * 4"), 14, "Multiplication must precede addition");
  assert.strictEqual(localCompute.compute("(2 + 3) * 4"), 20, "Parentheses must override precedence");
  assert.strictEqual(localCompute.compute("10 - 4 - 2"), 4, "Left-associative subtraction");
  assert.strictEqual(localCompute.compute("2 ^ 3"), 8, "Exponentiation");
  assert.strictEqual(localCompute.compute("17 % 5"), 2, "Modulo operation");
  assert.strictEqual(localCompute.compute("-5 + 10"), 5, "Unary minus support");
  console.log("  [✓] Test 1 Passed: Mathematical operator precedence verified without eval()!");

  // --- TEST 2: VARIABLE RESOLUTION & PERCENTAGES ---
  console.log("\n[Test 2] Testing Symbolic Variable Substitution & Percentages...");
  const symbols = { "<S1>": 3000000, "S1": 3000000, "<S2>": 450000, "S2": 450000 };
  assert.strictEqual(localCompute.compute("0.30 * <S1>", symbols), 900000);
  assert.strictEqual(localCompute.compute("12 * 0.30 * <S1>", symbols), 10800000);
  assert.strictEqual(localCompute.compute("<S1> * 15%", symbols), 450000);
  assert.strictEqual(localCompute.compute("<S1> - <S2>", symbols), 2550000);
  assert.strictEqual(localCompute.compute("(<S1> * 1.15) - <S2>", symbols), 3000000);
  console.log("  [✓] Test 2 Passed: Variable resolution (<S1>, <S2>) and percentages 100% accurate!");

  // --- TEST 3: CURRENCY FORMATTING ---
  console.log("\n[Test 3] Testing Multi-Currency Locale Formatting...");
  assert.strictEqual(localCompute.formatValue(900000, "IDR"), "Rp 900.000");
  assert.strictEqual(localCompute.formatValue(4200, "USD"), "$4,200");
  assert.strictEqual(localCompute.formatValue(450.50, "USD"), "$450.50");
  assert.strictEqual(localCompute.formatValue(1500, "EUR"), "€1.500");
  assert.strictEqual(localCompute.formatValue(2500, "GBP"), "£2,500");
  console.log("  [✓] Test 3 Passed: IDR, USD, EUR, GBP currency formatters verified!");

  // --- TEST 4: EPHEMERAL VAULT LIFECYCLE ---
  console.log("\n[Test 4] Testing Ephemeral Vault Registration, Deduplication & Clear...");
  vault.clear();
  assert.strictEqual(vault.size(), 0);

  const s1 = vault.register("Rp 3.000.000", 3000000, "FINANCIAL", { currency: "IDR" });
  assert.strictEqual(s1, "<S1>");
  assert.strictEqual(vault.size(), 1);

  // Duplicate registration must return existing symbol
  const s1Again = vault.register("Rp 3.000.000", 3000000, "FINANCIAL", { currency: "IDR" });
  assert.strictEqual(s1Again, "<S1>", "Duplicate secret must re-use existing symbol <S1>");
  assert.strictEqual(vault.size(), 1);

  const s2 = vault.register("$450", 450, "FINANCIAL", { currency: "USD" });
  assert.strictEqual(s2, "<S2>");
  assert.strictEqual(vault.size(), 2);

  assert.strictEqual(vault.get("<S1>").value, 3000000);
  assert.strictEqual(vault.get("<S2>").value, 450);

  vault.clear();
  assert.strictEqual(vault.size(), 0);
  console.log("  [✓] Test 4 Passed: Ephemeral vault lifecycle, deduplication, and cleanup verified!");

  // --- TEST 5: PRE-INFERENCE PROMPT REWRITING (DE JEMBRAS CASE) ---
  console.log("\n[Test 5] Testing Pre-Inference Invariant on De Jembras Case (secret ∉ outbound_prompt)...");
  vault.clear();
  const jembrasPrompt = "my salary is Rp 3.000.000 and i would like to safe some my salary to buy cars in indonesia";
  const rJembras = rewriter.rewrite(jembrasPrompt);

  assert(rJembras.isTransformed, "Prompt must be identified as sensitive and transformed");
  assert(rJembras.symbols.includes("<S1>"), "Must generate symbol <S1>");
  assert(!rJembras.sanitizedPrompt.includes("3.000.000"), "Raw string '3.000.000' MUST NOT exist in outbound prompt!");
  assert(!rJembras.sanitizedPrompt.includes("3000000"), "Raw digits '3000000' MUST NOT exist in outbound prompt!");
  assert(rJembras.sanitizedPrompt.includes("<S1>"), "Symbol <S1> must be present in sanitized prompt!");
  assert(rJembras.sanitizedPrompt.includes("[PRIVACY PROTOCOL:"), "Must attach steering protocol in English!");
  console.log("  [✓] Test 5 Passed: De Jembras prompt rewritten; strict invariant secret ∉ outbound_prompt confirmed!");

  // --- TEST 6: PRE-INFERENCE PROMPT REWRITING (INDONESIAN LANGUAGE STEERING) ---
  console.log("\n[Test 6] Testing Indonesian Language Prompt Steering...");
  vault.clear();
  const idPrompt = "Gaji saya Rp 15.000.000 per bulan di kantor, cicilan saya Rp 4.500.000. Berapa tabungan saya jika hemat 25%?";
  const rId = rewriter.rewrite(idPrompt);

  assert(rId.isTransformed);
  assert(!rId.sanitizedPrompt.includes("15.000.000"));
  assert(!rId.sanitizedPrompt.includes("4.500.000"));
  assert(rId.sanitizedPrompt.includes("<S1>"));
  assert(rId.sanitizedPrompt.includes("[PROTOKOL PRIVASI:"), "Must attach steering protocol in Indonesian!");
  console.log("  [✓] Test 6 Passed: Indonesian language steering protocol injected cleanly!");

  // --- TEST 7: LOCAL HYDRATION OF SIMULATED LLM RESPONSE ---
  console.log("\n[Test 7] Testing Local Hydration on Simulated Multi-Period LLM Response...");
  const simulatedLlmText = `Suggested monthly budget:
Category	Amount	%
Car savings	0.30 * <S1>	30%
Food & daily needs	0.40 * <S1>	40%
Transport	0.15 * <S1>	15%
Phone/internet	0.10 * <S1>	10%
Emergency	0.05 * <S1>	5%

If you save 0.30 * <S1>/month:
1 year -> 12 * 0.30 * <S1>
2 years -> 24 * 0.30 * <S1>
5 years -> 60 * 0.30 * <S1>`;

  const vaultData = {
    "<S1>": { value: 3000000, currency: "IDR", raw: "Rp 3.000.000" }
  };

  const hydrated = localCompute.hydrateText(simulatedLlmText, vaultData, false);
  assert(hydrated.hydratedText.includes("Car savings\tRp 900.000\t30%"), "Car savings must evaluate to Rp 900.000");
  assert(hydrated.hydratedText.includes("Food & daily needs\tRp 1.200.000\t40%"), "Food must evaluate to Rp 1.200.000");
  assert(hydrated.hydratedText.includes("1 year -> Rp 10.800.000"), "1 year accumulation must evaluate to Rp 10.800.000");
  assert(hydrated.hydratedText.includes("2 years -> Rp 21.600.000"), "2 year accumulation must evaluate to Rp 21.600.000");
  assert(hydrated.hydratedText.includes("5 years -> Rp 54.000.000"), "5 year accumulation must evaluate to Rp 54.000.000");
  assert(!hydrated.hydratedText.includes("<S1>"), "All <S1> expressions must be resolved in final hydrated text!");
  console.log("  [✓] Test 7 Passed: Multi-year accumulations and budget allocations locally hydrated with 100% accuracy!");

  // --- TEST 8: INTERACTIVE HTML BADGE RENDERING ---
  console.log("\n[Test 8] Testing Interactive HTML Badges ([⚡ local])...");
  const htmlHydrated = localCompute.hydrateText("Allocated: 0.30 * <S1>", vaultData, true);
  assert(htmlHydrated.hydratedText.includes("class=\"ss-local-compute\""), "Must contain local compute badge class");
  assert(htmlHydrated.hydratedText.includes("⚡ local"), "Must contain local tag indicator");
  assert(htmlHydrated.hydratedText.includes("Rp 900.000"), "Must display calculated value");
  console.log("  [✓] Test 8 Passed: Interactive local badge HTML rendered with encoded formulas!");

  // --- TEST 9: ROBUSTNESS & GRACEFUL DEGRADATION ---
  console.log("\n[Test 9] Testing Robustness Against Non-Symbolic Text & Malformed Math...");
  assert.strictEqual(localCompute.compute(""), 0, "Empty expression returns 0");
  assert.throws(() => localCompute.compute("10 / 0"), /Division by zero/, "Division by zero throws handled error");
  assert.throws(() => localCompute.compute("2 + * 3"), /Insufficient operands/, "Malformed syntax throws handled error");

  // Non-mathematical sentence must pass untouched
  const normalText = "Please write a python script to parse CSV files.";
  const untouched = localCompute.hydrateText(normalText, vaultData, false);
  assert.strictEqual(untouched.hydratedText, normalText, "Normal text must not be mutated");
  console.log("  [✓] Test 9 Passed: Graceful degradation and zero side-effects on normal non-symbolic text!");

  console.log("\n================================================================================");
  console.log("   ALL 9 PRE-INFERENCE SYMBOLIC & LOCAL_COMPUTE AUDITS PASSED 100%!");
  console.log("================================================================================\n");
}

if (require.main === module) {
  runSymbolicLocalComputeSuite();
}

module.exports = runSymbolicLocalComputeSuite;
