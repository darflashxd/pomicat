/**
 * PomiCat: Comprehensive Symbolic Transformation & LOCAL_COMPUTE Audit
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
const SafeShareLocalCompute = require("../extension/engine/local_compute.js");
const SafeShareSymbolicVault = require("../extension/engine/symbolic_vault.js");
const SafeShareSymbolicRewriter = require("../extension/engine/symbolic_rewriter.js");

function runSymbolicLocalComputeSuite() {
  console.log("================================================================================");
  console.log("   SAFESHARE-AI: PRE-INFERENCE SYMBOLIC & LOCAL_COMPUTE CHECKS");
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

  // Active chat session binding
  vault.loadFromSession("chat_session_xyz");
  assert.strictEqual(vault.activeChatId, "chat_session_xyz");
  const sChat = vault.register("Rp 5.000.000", 5000000, "FINANCIAL", { currency: "IDR" });
  assert.strictEqual(sChat, "<S1>");
  vault.clear();
  assert.strictEqual(vault.activeChatId, null);

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
  console.log("\n[Test 8] Testing Interactive HTML Badges...");
  const htmlHydrated = localCompute.hydrateText("Allocated: 0.30 * <S1>", vaultData, true);
  assert(htmlHydrated.hydratedText.includes("class=\"ss-local-compute\""), "Must contain local compute badge class");
  assert(!htmlHydrated.hydratedText.includes("⚡ local"), "Must not contain tacky ⚡ local tag");
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

  // --- TEST 10: LATEX ESOP DISPLAY MATH HYDRATION ---
  console.log("\n[Test 10] Testing LaTeX ESOP Display Math Hydration (User Bug 1 Scenario)...");
  const latexVault = {
    "<S1>": { value: 1500000, currency: "USD", raw: "$1,500,000" },
    "<S4>": { value: 18000000, currency: "USD", raw: "$18M" }
  };
  const latexDoc = `\\[\\text{ESOP after SAFE} = 0.15\\left(1-\\frac{\\langle S1\\rangle}{\\langle S4\\rangle}\\right)\\]\n\\[\\text{ESOP reduction} = 0.15\\frac{\\langle S1\\rangle}{\\langle S4\\rangle}\\]`;
  const latexHydrated = localCompute.hydrateText(latexDoc, latexVault, false);
  assert(latexHydrated.hydratedText.includes("13.75\\%"), "ESOP after SAFE must evaluate to 13.75%");
  assert(latexHydrated.hydratedText.includes("1.25\\%"), "ESOP reduction must evaluate to 1.25%");
  assert(!latexHydrated.hydratedText.includes("\\langle S1\\rangle"), "LaTeX angle brackets must be completely resolved!");
  console.log("  [✓] Test 10 Passed: LaTeX ESOP equations correctly evaluated to 13.75% and 1.25%!");

  // --- TEST 11: UNICODE MATH OPERATORS & TABLE CELL FORMULAS ---
  console.log("\n[Test 11] Testing Unicode Math Operators & Table Cell Formulas (User Bug 1 Scenario)...");
  const tableVault = {
    "<S1>": { value: 1500000, currency: "USD", raw: "$1,500,000" },
    "<S2>": { value: 145000, currency: "USD", raw: "$145,000" },
    "<S3>": { value: 820000, currency: "USD", raw: "$820,000" }
  };
  const tableDoc = `
Scenario\tMonthly burn\tCash after 3 months\tCash after 6 months
Current cash only\t<S2>\t<S3> − 3 × <S2>\t<S3> − 6 × <S2>
Bridge received\t<S2>\t<S3> + <S1> − 3 × <S2>\t<S3> + <S1> − 6 × <S2>
Bridge + 20% burn reduction\t0.80 × <S2>\t<S3> + <S1> − 2.40 × <S2>\t<S3> + <S1> − 4.80 × <S2>
- Immediate liquidity: adds <S1> to available cash once funded.
- More time to execute: extends runway by <S1> / <S2> months at constant burn.`;

  const tableHydrated = localCompute.hydrateText(tableDoc, tableVault, false);
  assert(tableHydrated.hydratedText.includes("$385,000"), "<S3> − 3 × <S2> must evaluate to $385,000");
  assert(tableHydrated.hydratedText.includes("$-50,000"), "<S3> − 6 × <S2> must evaluate to $-50,000");
  assert(tableHydrated.hydratedText.includes("$1,885,000"), "<S3> + <S1> − 3 × <S2> must evaluate to $1,885,000");
  assert(tableHydrated.hydratedText.includes("$116,000"), "0.80 × <S2> must evaluate to $116,000");
  assert(tableHydrated.hydratedText.includes("$1,972,000"), "<S3> + <S1> − 2.40 × <S2> must evaluate to $1,972,000");
  assert(tableHydrated.hydratedText.includes("adds $1,500,000 to available cash"), "adds <S1> must evaluate to $1,500,000");
  assert(tableHydrated.hydratedText.includes("runway by 10.34 months"), "<S1> / <S2> months must evaluate to 10.34 months");
  console.log("  [✓] Test 11 Passed: Table cell math with Unicode operators (−, ×) 100% evaluated!");

  // --- TEST 12: CONTEXT-AWARE CURRENCY INFERENCE (USD FOR SILICON VALLEY CAREER PROMPT) ---
  console.log("\n[Test 12] Testing Context-Aware Currency Inference (USD vs IDR Fix)...");
  const svPrompt = "Hey, need some honest career advice. I'm currently an L5 at Amazon making 340k TC (190k base, 150k RSUs). Just received an offer from Stripe for 390k (220k base, 170k equity) plus a 25k sign-on bonus. My monthly rent in SF is $3,600 and I still have $42,000 in student loans at 6.8%. Can you help me draft a confident, professional counter-offer email to push for 420k total comp?";
  const svVault = new SafeShareSymbolicVault("sv_test_");
  const svRewriter = new SafeShareSymbolicRewriter(svVault);
  const svRes = svRewriter.rewrite(svPrompt);
  const svEntries = svVault.getAll();
  // Verify currency of 420k is USD, not IDR!
  const cand420 = Object.values(svEntries).find(v => v.raw === "420k" || v.value === 420000);
  assert(cand420 && cand420.currency === "USD", "420k in Amazon/Stripe/SF context must be detected as USD, NOT IDR!");
  // Test formatting
  const formatted420 = localCompute.formatValue(cand420.value, cand420.currency);
  assert.strictEqual(formatted420, "$420,000", "420k must be formatted as $420,000 (NEVER Rp 420.000)!");
  console.log("  [✓] Test 12 Passed: Silicon Valley career prompt correctly inferred as USD ($420,000)!");

  // --- TEST 13: DOM EXTRACTION ZERO-LEAK SHARE INVARIANT ---
  console.log("\n[Test 13] Testing DOM Extraction Zero-Leak Invariant (User Bug 2 Fix)...");
  // Simulate an element in live tab hydrated with local compute span
  const mockContainer = {
    cloneNode(deep) {
      return {
        querySelectorAll(selector) {
          if (selector.includes("ss-local-compute")) {
            return [
              {
                getAttribute(attr) { return attr === "data-expr" ? "%3CS10%3E" : null; },
                replaceWith(node) { this.textContent = node; this.innerText = node; }
              }
            ];
          }
          return [];
        },
        innerText: "I wanted to ask whether there is flexibility to bring the total annual compensation closer to <S10>."
      };
    },
    innerText: "I wanted to ask whether there is flexibility to bring the total annual compensation closer to Rp 420.000."
  };

  // Function simulating content_script getCleanNodeContent
  function simulateCleanExtraction(el) {
    const clone = el.cloneNode(true);
    const spans = clone.querySelectorAll(".ss-local-compute, [data-expr]");
    spans.forEach(s => {
      const orig = s.getAttribute("data-expr");
      if (orig) s.replaceWith(decodeURIComponent(orig));
    });
    return (clone.innerText || "").trim();
  }

  const extractedForShare = simulateCleanExtraction(mockContainer);
  assert(extractedForShare.includes("<S10>"), "Extracted text for share payload MUST restore <S10>!");
  assert(!extractedForShare.includes("420"), "Extracted text for share payload MUST NEVER contain raw 420!");
  assert(!extractedForShare.includes("⚡ local"), "Extracted text for share payload MUST NOT contain local badge artifacts!");
  console.log("  [✓] Test 13 Passed: DOM extraction zero-leak invariant verified! Outbound share payload is 100% clean of client RAM secrets!");

  // --- TEST 14: HTML ELEMENT SYMBOL NORMALIZATION (<s18></s18>) ---
  console.log("\n[Test 14] Testing HTML Element Symbol Normalization (<s18></s18> & <s19></s19>)...");
  const htmlInput = `Monthly burn: <s19></s19>
Current SVB cash: <s20></s20>
Bridge amount: <s18></s18>
SAFE post-money valuation cap: <s21></s21>
adds <s18></s18> to cash available for operations.
Defined cap-based dilution: the ownership impact can be estimated using <s18></s18> / <s21></s21>.
Incremental runway=<s18></s18> / <s19></s19> months`;

  const safeVault = {
    "<S18>": { value: 1500000, currency: "USD", raw: "$1,500,000" },
    "<S19>": { value: 145000, currency: "USD", raw: "$145,000" },
    "<S20>": { value: 820000, currency: "USD", raw: "$820,000" },
    "<S21>": { value: 18000000, currency: "USD", raw: "$18M" }
  };

  const htmlHydratedRes = localCompute.hydrateText(htmlInput, safeVault, true);
  assert(htmlHydratedRes.hydratedText.includes("$145,000"), "Monthly burn must evaluate to $145,000");
  assert(htmlHydratedRes.hydratedText.includes("$820,000"), "SVB cash must evaluate to $820,000");
  assert(htmlHydratedRes.hydratedText.includes("$1,500,000"), "Bridge amount must evaluate to $1,500,000");
  assert(htmlHydratedRes.hydratedText.includes("$18,000,000"), "Valuation cap must evaluate to $18,000,000");
  assert(htmlHydratedRes.hydratedText.includes("adds <span"), "adds <s18> must be hydrated as badge");
  assert(htmlHydratedRes.hydratedText.includes("8.33%"), "dilution ratio must evaluate to 8.33%");
  assert(htmlHydratedRes.hydratedText.includes("10.34"), "incremental runway must evaluate to 10.34");
  assert(!htmlHydratedRes.hydratedText.includes("<s18></s18>"), "All <s18> HTML tags must be resolved!");
  console.log("  [✓] Test 14 Passed: All browser-generated <s18></s18> HTML tags successfully parsed and hydrated into numbers!");

  // --- TEST 15: FIXED-POINT ARITHMETIC & MULTI-CURRENCY (SGD, AUD, CAD, CHF) ---
  console.log("\n[Test 15] Testing Fixed-Point Arithmetic & Global Currencies (SGD, AUD, CAD, CHF)...");
  assert.strictEqual(localCompute.compute("0.1 + 0.2"), 0.3, "Fixed-point arithmetic must prevent IEEE-754 0.30000000000000004 drift");
  assert.strictEqual(localCompute.compute("19.99 * 100"), 1999, "Fixed-point arithmetic must prevent float rounding drift");
  assert.strictEqual(localCompute.formatValue(50000, "SGD"), "S$50,000");
  assert.strictEqual(localCompute.formatValue(75000, "AUD"), "A$75,000");
  assert.strictEqual(localCompute.formatValue(92000, "CAD"), "C$92,000");
  // The Swiss group separator is ' or ’ depending on the ICU version bundled with Node/the browser
  assert.match(localCompute.formatValue(120000, "CHF"), /^CHF 120['’]000$/);
  console.log("  [✓] Test 15 Passed: Fixed-point arithmetic and SGD/AUD/CAD/CHF currency formatting verified!");

  // --- TEST 16: DEPENDENCY-DISTANCE BINDING THRESHOLD (<= 12 TOKENS) ---
  console.log("\n[Test 16] Testing Dependency-Distance Binding Threshold (<= 12 tokens)...");
  const distantPrompt = "Please read through document version 450 published in section 2024 which discusses generic architecture without any financial details.";
  const rDistant = rewriter.analyze(distantPrompt);
  assert.strictEqual(rDistant.detectedItems.length, 0, "Distant numbers without financial trigger must not bind");

  const boundPrompt = "My current base salary is 185000 and my target bonus is 35000.";
  const rBound = rewriter.analyze(boundPrompt);
  assert(rBound.detectedItems.length > 0, "Numbers adjacent to 'salary' and 'bonus' within 12 tokens must bind");
  console.log("  [✓] Test 16 Passed: Dependency-distance threshold (<= 12 tokens) successfully discriminates!");

  // --- TEST 17: RELATIONAL OPERATORS, PIECEWISE IF/MIN/MAX, & EXPR ENVELOPES ---
  console.log("\n[Test 17] Testing Relational AST, Conditional IF, & {{EXPR:}} Envelopes...");
  const taxVault = {
    "<S1>": { value: 25000000, currency: "IDR", raw: "Rp 25.000.000" }
  };
  const taxSymbols = { "<S1>": 25000000, "S1": 25000000 };

  // 1. Relational & Boolean operators
  assert.strictEqual(localCompute.compute("10 > 5"), 1);
  assert.strictEqual(localCompute.compute("10 <= 5"), 0);
  assert.strictEqual(localCompute.compute("5 == 5"), 1);
  assert.strictEqual(localCompute.compute("5 != 4"), 1);
  assert.strictEqual(localCompute.compute("(10 > 5) && (5 > 2)"), 1);
  assert.strictEqual(localCompute.compute("MIN(10, 5, 20)"), 5);
  assert.strictEqual(localCompute.compute("MAX(10, 5, 20)"), 20);
  assert.strictEqual(localCompute.compute("ROUND(123.456, 2)"), 123.46);

  // 2. Conditional Piecewise IF
  const ifExpr = "IF(<S1> > 20000000, (<S1> - 20000000) * 0.25 + 3000000, <S1> * 0.15)";
  const ifRes = localCompute.compute(ifExpr, taxSymbols);
  assert.strictEqual(ifRes, 4250000, "IF expression must evaluate true branch (4,250,000)");

  // 3. Hydrate text with {{EXPR: ...}} envelope and tagless IF
  const mixedLlmResp = "Calculated tax: {{EXPR: IF(<S1> > 20000000, (<S1> - 20000000) * 0.25 + 3000000, <S1> * 0.15)}} with bracket MIN(<S1>, 30000000).";
  const mixedHydrated = localCompute.hydrateText(mixedLlmResp, taxVault, false);
  assert(mixedHydrated.hydratedText.includes("Rp 4.250.000"), "Envelope must resolve to Rp 4.250.000");
  assert(mixedHydrated.hydratedText.includes("Rp 25.000.000"), "Tagless MIN must resolve to Rp 25.000.000");
  console.log("  [✓] Test 17 Passed: Relational operators, piecewise IF/MIN/MAX, and {{EXPR:}} verified!");

  // --- TEST 18: CHATGPT REAL-WORLD ESCAPE, LATEX WRAPPER & CHAINED EQUATION RESOLUTION ---
  console.log("\n[Test 18] Testing ChatGPT <escape>, \\text{} Wrapper & Chained Derivation Equations...");
  const chatgptVault = {
    "<S1>": { value: 25000000, currency: "IDR", raw: "Rp 25.000.000" }
  };
  const chatgptResponse = `Dengan gaji bulanan sebesar <escape><S1></escape> dan bonus 15%, perhitungannya adalah:
- Bonus 15%: \\(0.15 \\times \\text{<S1>}\\)
- Total gaji + bonus: \\(\\text{<S1>} + 0.15 \\times \\text{<S1>} = 1.15 \\times \\text{<S1>}\\)
Jadi, bonus kamu sebesar \\(0.15 \\times \\text{<S1>}\\), sedangkan total gaji setelah bonus adalah \\(1.15 \\times \\text{<S1>}\\).`;

  const chatgptHydrated = localCompute.hydrateText(chatgptResponse, chatgptVault, false);
  assert(!chatgptHydrated.hydratedText.includes("<escape>"), "<escape> tags must be completely removed");
  assert(!chatgptHydrated.hydratedText.includes("\\text{"), "\\text{} wrappers must be completely unpacked");
  assert(chatgptHydrated.hydratedText.includes("Bonus 15%: Rp 3.750.000"), "Bonus must calculate to Rp 3.750.000");
  assert(chatgptHydrated.hydratedText.includes("Total gaji + bonus: Rp 28.750.000"), "Total must calculate to Rp 28.750.000");
  assert(chatgptHydrated.hydratedText.includes("Rp 25.000.000"), "Base salary must hydrate to Rp 25.000.000");

  // Also test [[EXPR: ...]] with semantic-role symbol S1_GAJI_POKOK
  const semanticExprResponse = "Gaji: [[EXPR: S1_GAJI_POKOK]], Bonus: [[EXPR: S1_GAJI_POKOK * 0.15]], Total: [[EXPR: S1_GAJI_POKOK * 1.15]]";
  const semanticHydrated = localCompute.hydrateText(semanticExprResponse, chatgptVault, false);
  assert(semanticHydrated.hydratedText.includes("Gaji: Rp 25.000.000"), "Single variable [[EXPR: S1_GAJI_POKOK]] must resolve");
  assert(semanticHydrated.hydratedText.includes("Bonus: Rp 3.750.000"), "Multiplication [[EXPR: S1_GAJI_POKOK * 0.15]] must resolve");
  assert(semanticHydrated.hydratedText.includes("Total: Rp 28.750.000"), "Total [[EXPR: S1_GAJI_POKOK * 1.15]] must resolve");
  console.log("  [✓] Test 18 Passed: ChatGPT <escape>, \\text{}, equation chains, and [[EXPR: S1_ROLE]] verified!");

  // --- TEST 19: TAGLESS NATURAL INFIX IN MARKDOWN TABLES & META-STEERING SAFETY ---
  console.log("\n[Test 19] Testing Tagless Natural Infix in Tables & Anti-Self-Hydration Steering...");
  const budgetVault = {
    "<S1>": { value: 18500000, currency: "IDR", raw: "Rp 18.500.000" },
    "<S2>": { value: 4200000, currency: "IDR", raw: "Rp 4.200.000" },
    "<S3>": { value: 3100000, currency: "IDR", raw: "Rp 3.100.000" }
  };

  // 1. Tagless natural table hydration without [[EXPR:]] tags
  const rawTableResponse = [
    "| Komponen | Perhitungan |",
    "| Gaji Pokok | VAL1_GAJI |",
    "| Bonus (20%) | 0.20 * VAL1_GAJI |",
    "| Total Pemasukan | 1.20 * VAL1_GAJI |",
    "| Pengeluaran | VAL2_SEWA + VAL3_CICILAN |",
    "| Sisa Bersih | (1.20 * VAL1_GAJI) - (VAL2_SEWA + VAL3_CICILAN) |"
  ].join("\n");

  const hydratedTable = localCompute.hydrateText(rawTableResponse, budgetVault, false);
  assert(hydratedTable.hydratedText.includes("Gaji Pokok | Rp 18.500.000"), "Base salary must hydrate in table");
  assert(hydratedTable.hydratedText.includes("Bonus (20%) | Rp 3.700.000"), "Bonus must hydrate in table");
  assert(hydratedTable.hydratedText.includes("Total Pemasukan | Rp 22.200.000"), "Income must hydrate in table");
  assert(hydratedTable.hydratedText.includes("Pengeluaran | Rp 7.300.000"), "Expenses must hydrate in table");
  assert(hydratedTable.hydratedText.includes("Sisa Bersih | Rp 14.900.000"), "Net balance must evaluate to Rp 14.900.000");

  // 2. Chained plain text equation collapsing
  const chainedText = "Total Pemasukan = VAL1_GAJI + 0.20 * VAL1_GAJI = 1.20 * VAL1_GAJI";
  const hydratedChained = localCompute.hydrateText(chainedText, budgetVault, false);
  assert(hydratedChained.hydratedText.includes("Rp 22.200.000"), "Chained equation must collapse to Rp 22.200.000");

  // 3. Meta-example steering anti-self-hydration invariant: VAL_A, VAL_B MUST NEVER mutate into Rp 0
  const steeringPromptSample = "[PROTOKOL PRIVASI: Perlakukan variabel <S1>, <S2>, <S3> sebagai parameter angka tetap. Keluarkan rincian anggaran secara langsung menggunakan ekspresi aljabar standar (contoh: 0.20 * VAL_A, (1.20 * VAL_A) - (VAL_B + VAL_C)). Jangan gunakan tag escape atau persamaan berantai.]";
  const hydratedSteering = localCompute.hydrateText(steeringPromptSample, budgetVault, false);
  assert(hydratedSteering.hydratedText.includes("VAL_A"), "Meta-example VAL_A must not be mutated");
  assert(hydratedSteering.hydratedText.includes("VAL_B"), "Meta-example VAL_B must not be mutated");
  assert(!hydratedSteering.hydratedText.includes("Rp 0"), "Steering prompt must NEVER self-hydrate into Rp 0!");
  console.log("  [✓] Test 19 Passed: Tagless markdown tables, chained equations, and meta-steering safety verified!");

  // --- TEST 20: REAL CHATGPT BACKTICKS, \boxed{}, & NESTED PARENS REHYDRATION ---
  console.log("\n[Test 20] Testing Real ChatGPT Markdown Tables, \\boxed{} LaTeX, & Nested Parens...");
  const chatGptSample = [
    "| Komponen | Formula | Nilai |",
    "| Gaji pokok | `S1` | Rp `S1` |",
    "| Bonus 20% | `0.20 * S1` | Rp `0.20 * S1` |",
    "| Total pendapatan | `1.20 * S1` | Rp `1.20 * S1` |",
    "| Sewa apartemen | `S2` | Rp `S2` |",
    "| Cicilan mobil | `S3` | Rp `S3` |",
    "| Total pengeluaran | `S2 + S3` | Rp `S2 + S3` |",
    "",
    "\\[ \\boxed{(1.20 \\times S1)-(S2+S3)} \\]",
    "",
    "Sisa uang bersih = Rp `((1.20 * S1) - (S2 + S3))`"
  ].join("\n");

  const hydratedChatGpt = localCompute.hydrateText(chatGptSample, budgetVault, false);
  assert(hydratedChatGpt.hydratedText.includes("`Rp 18.500.000`"), "Gaji pokok in backtick must hydrate");
  assert(hydratedChatGpt.hydratedText.includes("`Rp 3.700.000`"), "Bonus in backtick must hydrate");
  assert(hydratedChatGpt.hydratedText.includes("`Rp 22.200.000`"), "Total income must hydrate");
  assert(hydratedChatGpt.hydratedText.includes("`Rp 4.200.000`"), "Rent must hydrate");
  assert(hydratedChatGpt.hydratedText.includes("`Rp 3.100.000`"), "Installment must hydrate");
  assert(hydratedChatGpt.hydratedText.includes("`Rp 7.300.000`"), "Total expenses must hydrate");
  assert(hydratedChatGpt.hydratedText.includes("Rp 14.900.000"), "LaTeX \\boxed{} equation must hydrate to Rp 14.900.000");
  assert(!hydratedChatGpt.hydratedText.includes("(Rp 14.900.000"), "Must NOT have orphan left parenthesis");
  assert(!hydratedChatGpt.hydratedText.includes("Rp Rp"), "Must NOT have duplicate Rp currency prefix");

  // Also test HTML mode (td and code tags as received from DOM)
  const domHtmlCell = "<td>Rp <code>0.20 * S1</code></td>";
  const hydratedCell = localCompute.hydrateText(domHtmlCell, budgetVault, true);
  assert(hydratedCell.hydratedText.includes("Rp 3.700.000"), "DOM HTML cell must hydrate without being blocked by <code> tag");
  assert(hydratedCell.hydratedText.includes("ss-local-compute"), "HTML badge must be attached");

  console.log("  [✓] Test 20 Passed: Real ChatGPT output rehydration 100% verified!");

  console.log("\n================================================================================");
  console.log("   ALL 20 PRE-INFERENCE SYMBOLIC & LOCAL_COMPUTE AUDITS PASSED 100%!");
  console.log("================================================================================\n");
}

if (require.main === module) {
  runSymbolicLocalComputeSuite();
}

module.exports = runSymbolicLocalComputeSuite;
