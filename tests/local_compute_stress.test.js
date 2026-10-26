/**
 * SafeShare-AI — Comprehensive Extreme Stress Test for Local Compute & Symbolic <S1> Hydration
 * Validates fixes for:
 *   1. Dimensional analysis (Percentages vs Currencies vs Durations vs Ratios)
 *   2. LaTeX percent signs (\%), nested fractions, and exponents (^(n))
 *   3. KaTeX raw TeX annotations without delimiters
 *   4. International decimal commas (e.g. 0,15 or 2,5%)
 *   5. Derivation chains collapsing cleanly
 *   6. Co-existence of plain currency text ($500) and formula delimiters
 */

const assert = require("assert");
const SafeShareLocalCompute = require("../extension/engine/local_compute.js");

function runStressSuite() {
  console.log("================================================================================");
  console.log("       SAFESHARE-AI: LOCAL COMPUTE & <S1> HYDRATION EXTREME STRESS AUDIT");
  console.log("================================================================================");

  const lc = new SafeShareLocalCompute();
  assert.equal(lc.hydrateText('<S1> * -0.20', {'<S1>':{value:10000,currency:'USD'}}, true).evaluations[0].val, -2000);

  // ChatGPT renders symbols inside \texttt{...} (live KaTeX annotation, Oct 2026).
  const katexText = lc.hydrateText("0.25 \\times \\texttt{<S1>}", { "<S1>": { value: 4800, currency: "USD" } }, true);
  assert.equal(katexText.evaluations[0].val, 1200, `\\texttt{<S1>} must hydrate, got: ${katexText.hydratedText}`);
  assert(katexText.hydratedText.includes("$1,200"), `Must show $1,200, got: ${katexText.hydratedText}`);
  const vault = {
    "<S1>": { value: 20000000, currency: "IDR", raw: "Rp 20.000.000" },
    "<S2>": { value: 5000000, currency: "IDR", raw: "Rp 5.000.000" },
    "<S3>": { value: 10000, currency: "USD", raw: "$10,000" },
    "<S4>": { value: 2500, currency: "USD", raw: "$2,500" }
  };

  // --- TEST 1: DIMENSIONAL ANALYSIS (PERCENTAGE VS CURRENCY) ---
  console.log("\n[Test 1] Testing Dimensional Analysis: Currency +/- (Percent * Currency)...");
  // Addition with %
  const addPct = lc.hydrateText("Gaji baru: <S1> + 10% * <S1>", vault, false);
  assert(addPct.hydratedText.includes("Rp 22.000.000"), `Must be Rp 22.000.000, got: ${addPct.hydratedText}`);
  assert(!addPct.hydratedText.includes("2200000000%"), "Must NOT format addition as billions percent!");

  // Subtraction with %
  const subPct = lc.hydrateText("Potongan: <S1> - (20% * <S1>)", vault, false);
  assert(subPct.hydratedText.includes("Rp 16.000.000"), `Must be Rp 16.000.000, got: ${subPct.hydratedText}`);
  assert(!subPct.hydratedText.includes("1600000000%"), "Must NOT format subtraction as billions percent!");
  console.log("  [✓] Currency +/- (Percent * Currency) evaluates strictly to Currency!");

  // --- TEST 2: SCALAR DIVISION VS DURATION VS RATIO ---
  console.log("\n[Test 2] Testing Scalar Division vs Unit Duration vs Dimensionless Ratio...");
  // Scalar division: <S3> / 12 must be currency $833.33, NOT dimensionless "833.33"
  const scalarDiv = lc.hydrateText("Monthly USD: <S3> / 12", vault, false);
  assert(scalarDiv.hydratedText.includes("$833.33"), `Must be $833.33, got: ${scalarDiv.hydratedText}`);

  // Scalar division with duration snippet: <S3> / 4 months
  const durDiv = lc.hydrateText("Runway: <S3> / <S4> months", vault, false);
  assert(durDiv.hydratedText.includes("4 months"), `Must be 4 months, got: ${durDiv.hydratedText}`);

  // Currency / Currency ratio with ESOP or dilution keyword: must be percentage
  const ratioDiv = lc.hydrateText("Dilution: <S4> / <S3>", vault, false);
  assert(ratioDiv.hydratedText.includes("25%"), `Must be 25%, got: ${ratioDiv.hydratedText}`);
  console.log("  [✓] Scalar division, duration units, and ratios correctly distinguished!");

  // --- TEST 3: INTERNATIONAL DECIMAL COMMAS (0,15 / 1,5 / 2,5%) ---
  console.log("\n[Test 3] Testing International Decimal Commas (0,15 * <S1>)...");
  const commaMath = lc.hydrateText("Tunjangan: 0,15 * <S1>", vault, false);
  assert(commaMath.hydratedText.includes("Rp 3.000.000"), `Must be Rp 3.000.000, got: ${commaMath.hydratedText}`);
  assert(!commaMath.hydratedText.includes("0,Rp"), "Must not leave broken 0,Rp artifacts!");

  const commaMult = lc.hydrateText("Lembur: 1,5 * <S2>", vault, false);
  assert(commaMult.hydratedText.includes("Rp 7.500.000"), `Must be Rp 7.500.000, got: ${commaMult.hydratedText}`);
  console.log("  [✓] International decimal commas evaluated seamlessly without corrupting strings!");

  // --- TEST 4: LATEX PERCENT SINGS, NESTED FRACTIONS, AND EXPONENTS ---
  console.log("\n[Test 4] Testing LaTeX Math: \\%, Nested Fractions, Exponents, and Subscripts...");
  // LaTeX \% percent sign
  const latexPct = lc.hydrateText("\\[ \\text{Pajak} = 5\\% \\times \\langle S1 \\rangle \\]", vault, false);
  assert(latexPct.hydratedText.includes("Rp 1.000.000"), `Must be Rp 1.000.000, got: ${latexPct.hydratedText}`);

  // Nested fractions: \frac{\langle S1 \rangle - \langle S2 \rangle}{1 + \frac{1}{2}}
  // (20,000,000 - 5,000,000) / 1.5 = 15,000,000 / 1.5 = 10,000,000
  const nestedFrac = lc.hydrateText("\\[ \\text{Adj} = \\frac{\\langle S1 \\rangle - \\langle S2 \\rangle}{1 + \\frac{1}{2}} \\]", vault, false);
  assert(nestedFrac.hydratedText.includes("Rp 10.000.000"), `Must evaluate nested fractions, got: ${nestedFrac.hydratedText}`);

  // Compound exponent: <S3> * (1 + 0.08)^{5}
  const compound = lc.hydrateText("Future: <S3> * (1 + 0.08)^{5}", vault, false);
  assert(compound.hydratedText.includes("$14,693"), `Must calculate compound interest, got: ${compound.hydratedText}`);
  console.log("  [✓] LaTeX \\%, nested fractions, and exponent braces evaluated with exact precision!");

  // --- TEST 5: KATEX RAW TEX ANNOTATIONS WITHOUT DELIMITERS ---
  console.log("\n[Test 5] Testing KaTeX Raw TeX Annotations (Without Delimiters)...");
  const katexRaw = "\\text{Total} = 0.20 \\times \\langle S3 \\rangle";
  const katexRes = lc.hydrateText(katexRaw, vault, true);
  assert(katexRes.computedCount > 0, "KaTeX raw TeX annotation must be detected and hydrated!");
  assert(katexRes.hydratedText.includes("$2,000"), `Must evaluate to $2,000, got: ${katexRes.hydratedText}`);
  assert(katexRes.hydratedText.includes("ss-local-compute"), "Must include local compute badge!");
  console.log("  [✓] KaTeX raw TeX annotations without delimiters 100% hydrated!");

  // --- TEST 6: DERIVATION CHAINS COLLAPSING ---
  console.log("\n[Test 6] Testing Derivation Chains Collapsing (A = B = C = D)...");
  const chainPrompt = "ESOP after SAFE = 0.15 * (1 - <S4> / <S3>) = 0.15 * (1 - 0.25) = 0.15 * 0.75 = 0.1125 = 11.25%";
  const chainRes = lc.hydrateText(chainPrompt, vault, false);
  assert(chainRes.hydratedText.includes("ESOP after SAFE = 11.25%"), `Must collapse derivation chain cleanly, got: ${chainRes.hydratedText}`);
  assert(!chainRes.hydratedText.includes("= 0.15 * (1 - 0.25)"), "Intermediate hallucinated steps must be cleanly collapsed!");
  console.log("  [✓] Multi-step derivation chains collapsed into clean, verified answers!");

  // --- TEST 7: PLAIN CURRENCY ($500) AND DELIMITER CO-EXISTENCE ---
  console.log("\n[Test 7] Testing Plain Currency ($500) Co-Existence with Math...");
  const mixedText = "The consultation fee is $500 and the incentive is 0.20 * <S3>, giving a total of $2,500.";
  const mixedRes = lc.hydrateText(mixedText, vault, false);
  assert(mixedRes.hydratedText.includes("$500"), `Original $500 must NOT be eaten, got: ${mixedRes.hydratedText}`);
  assert(mixedRes.hydratedText.includes("$2,000"), `0.20 * <S3> must hydrate to $2,000, got: ${mixedRes.hydratedText}`);
  console.log("  [✓] Plain currency amounts in surrounding text stay 100% intact!");

  console.log("\n================================================================================");
  console.log("  ALL LOCAL COMPUTE STRESS TESTS PASSED: MATH ENGINE FULLY VERIFIED (100%)");
  console.log("================================================================================");
}

runStressSuite();
