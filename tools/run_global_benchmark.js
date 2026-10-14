/**
 * SafeShare-AI — Comprehensive Global PII Benchmark Runner
 * Benchmarks SafeShare against:
 * 1. Microsoft Presidio Research (synth_dataset_v2)
 * 2. Gretel AI Synthetic Multilingual Finance PII
 * 3. ai4privacy OpenPII 300k Global Dataset
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const Heuristics = require("../extension/engine/heuristics.js");
const Contextual = require("../extension/engine/contextual.js");
const Pseudonymizer = require("../extension/engine/pseudonymizer.js");

const SENSITIVE_CATEGORIES = new Set([
  // Core PII
  "EMAIL", "EMAIL_ADDRESS", "email",
  "TEL", "PHONE_NUMBER", "phone_number", "phone",
  "PASSPORT", "US_PASSPORT", "passport",
  "IDCARD", "NATIONAL_ID", "id_number", "identification_number",
  "SOCIALNUMBER", "US_SSN", "ssn", "social_security_number",
  "DRIVERLICENSE", "US_DRIVER_LICENSE", "driver_license",
  "IP", "IP_ADDRESS", "ip_address", "ip",
  "PASS", "PASSWORD", "password",
  // Financial
  "CREDIT_CARD", "credit_card", "credit_card_number",
  "IBAN_CODE", "iban", "bank_account", "account_number", "routing_number",
  // Physical location / addresses
  "STREET", "STREET_ADDRESS", "street_address", "SECADDRESS", "POSTCODE",
  // Names
  "PERSON", "name", "first_name", "last_name", "GIVENNAME1", "LASTNAME1"
]);

function normalizeCategory(label) {
  const l = (label || "").toUpperCase();
  if (l.includes("EMAIL")) return "EMAIL";
  if (l.includes("PHONE") || l === "TEL") return "PHONE";
  if (l.includes("PASS") && !l.includes("PASSPORT")) return "PASSWORD";
  if (l.includes("PASSPORT")) return "PASSPORT";
  if (l.includes("SSN") || l.includes("SOCIAL")) return "SSN_TAX_ID";
  if (l.includes("DRIVER")) return "DRIVER_LICENSE";
  if (l.includes("IDCARD") || l.includes("NATIONAL_ID")) return "NATIONAL_ID";
  if (l.includes("IP")) return "IP_ADDRESS";
  if (l.includes("CREDIT") || l.includes("CARD")) return "CREDIT_CARD";
  if (l.includes("IBAN") || l.includes("ACCOUNT") || l.includes("ROUTING")) return "BANK_ACCOUNT";
  if (l.includes("STREET") || l.includes("ADDRESS") || l.includes("POSTCODE")) return "STREET_ADDRESS";
  if (l.includes("NAME") || l === "PERSON") return "PERSON_NAME";
  return label;
}

async function runBenchmark() {
  console.log("================================================================================");
  console.log("      SAFESHARE-AI: MULTI-DATASET GLOBAL PII BENCHMARK EVALUATOR");
  console.log("================================================================================");

  const heuristics = new Heuristics();
  const contextual = new Contextual();
  const pseudonymizer = new Pseudonymizer();

  const gapsReport = {
    evaluated_at: new Date().toISOString(),
    datasets: {},
    summary: {},
    sample_leaks: []
  };

  let grandTotalRecords = 0;
  let grandTotalTargets = 0;
  let grandProtectedTargets = 0;
  let grandLeakedTargets = 0;

  const categoryStats = {};

  const sampleLeaksByCat = {};

  function recordStat(cat, protectedFlag, sampleInfo) {
    if (!categoryStats[cat]) {
      categoryStats[cat] = { total: 0, protected: 0, leaked: 0 };
    }
    categoryStats[cat].total++;
    if (protectedFlag) {
      categoryStats[cat].protected++;
    } else {
      categoryStats[cat].leaked++;
      if (!sampleLeaksByCat[cat]) sampleLeaksByCat[cat] = [];
      if (sampleLeaksByCat[cat].length < 10) {
        sampleLeaksByCat[cat].push(sampleInfo);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // DATASET 1: Microsoft Presidio Research (synth_dataset_v2)
  // ---------------------------------------------------------------------------
  const presidioPath = path.join(__dirname, "..", "data", "benchmarks", "presidio_synth_v2.json");
  if (fs.existsSync(presidioPath)) {
    console.log("\n[1/3] Benchmarking Microsoft Presidio Research Dataset...");
    const presidioData = JSON.parse(fs.readFileSync(presidioPath, "utf8"));
    let dsRecords = 0;
    let dsTargets = 0;
    let dsProtected = 0;
    const t0 = Date.now();

    for (const item of presidioData) {
      dsRecords++;
      const text = item.full_text || "";
      if (!text) continue;

      const hScan = heuristics.scan(text);
      const cDets = contextual.classifyTurn(hScan.sanitizedText, 0);
      const res = pseudonymizer.anonymizeConversation([{ role: "user", content: hScan.sanitizedText }], cDets, hScan.detections);
      const output = res.anonymizedTurns[0].content;

      for (const span of (item.spans || [])) {
        const val = span.entity_value ? span.entity_value.trim() : "";
        if (!val || val.length < 3) continue; // Skip single punctuation/short tokens
        if (!SENSITIVE_CATEGORIES.has(span.entity_type)) continue;

        const cat = normalizeCategory(span.entity_type);
        dsTargets++;
        const isLeaked = output.includes(val);
        const isProtected = !isLeaked;

        if (isProtected) dsProtected++;
        recordStat(cat, isProtected, {
          dataset: "Presidio",
          category: cat,
          raw_type: span.entity_type,
          value: val,
          snippet: text.slice(Math.max(0, span.start_position - 30), Math.min(text.length, span.end_position + 30))
        });
      }
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const recall = dsTargets > 0 ? ((dsProtected / dsTargets) * 100).toFixed(2) : "100.00";
    console.log(`  Records: ${dsRecords} | Targets: ${dsTargets} | Protected: ${dsProtected} | Recall: ${recall}% | Elapsed: ${elapsed}s`);
    gapsReport.datasets["Presidio"] = { records: dsRecords, targets: dsTargets, protected: dsProtected, recall: `${recall}%` };
    grandTotalRecords += dsRecords;
    grandTotalTargets += dsTargets;
    grandProtectedTargets += dsProtected;
  }

  // ---------------------------------------------------------------------------
  // DATASET 2: Gretel AI Synthetic Finance Dataset
  // ---------------------------------------------------------------------------
  const gretelPath = path.join(__dirname, "..", "data", "benchmarks", "gretel_finance_test.json");
  if (fs.existsSync(gretelPath)) {
    console.log("\n[2/3] Benchmarking Gretel AI Synthetic Finance PII Dataset...");
    const gretelData = JSON.parse(fs.readFileSync(gretelPath, "utf8"));
    let dsRecords = 0;
    let dsTargets = 0;
    let dsProtected = 0;
    const t0 = Date.now();

    for (const item of gretelData) {
      dsRecords++;
      const text = item.text || "";
      if (!text) continue;

      const hScan = heuristics.scan(text);
      const cDets = contextual.classifyTurn(hScan.sanitizedText, 0);
      const res = pseudonymizer.anonymizeConversation([{ role: "user", content: hScan.sanitizedText }], cDets, hScan.detections);
      const output = res.anonymizedTurns[0].content;

      for (const span of (item.spans || [])) {
        const val = text.substring(span.start, span.end).trim();
        if (!val || val.length < 3) continue;
        if (!SENSITIVE_CATEGORIES.has(span.label)) continue;

        const cat = normalizeCategory(span.label);
        dsTargets++;
        const isLeaked = output.includes(val);
        const isProtected = !isLeaked;

        if (isProtected) dsProtected++;
        recordStat(cat, isProtected, {
          dataset: "Gretel_Finance",
          category: cat,
          raw_type: span.label,
          value: val,
          snippet: text.slice(Math.max(0, span.start - 30), Math.min(text.length, span.end + 30))
        });
      }
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const recall = dsTargets > 0 ? ((dsProtected / dsTargets) * 100).toFixed(2) : "100.00";
    console.log(`  Records: ${dsRecords} | Targets: ${dsTargets} | Protected: ${dsProtected} | Recall: ${recall}% | Elapsed: ${elapsed}s`);
    gapsReport.datasets["Gretel_Finance"] = { records: dsRecords, targets: dsTargets, protected: dsProtected, recall: `${recall}%` };
    grandTotalRecords += dsRecords;
    grandTotalTargets += dsTargets;
    grandProtectedTargets += dsProtected;
  }

  // ---------------------------------------------------------------------------
  // DATASET 3: ai4privacy OpenPII 300k Benchmark
  // ---------------------------------------------------------------------------
  const ai4privacyPath = path.join(__dirname, "..", "data", "benchmarks", "ai4privacy_openpii_8k.jsonl");
  if (fs.existsSync(ai4privacyPath)) {
    console.log("\n[3/3] Benchmarking ai4privacy OpenPII 300k English Suite...");
    let dsRecords = 0;
    let dsTargets = 0;
    let dsProtected = 0;
    const t0 = Date.now();

    const rl = readline.createInterface({
      input: fs.createReadStream(ai4privacyPath),
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      dsRecords++;
      const item = JSON.parse(line);
      const text = item.source_text || "";
      if (!text) continue;

      const hScan = heuristics.scan(text);
      const cDets = contextual.classifyTurn(hScan.sanitizedText, 0);
      const res = pseudonymizer.anonymizeConversation([{ role: "user", content: hScan.sanitizedText }], cDets, hScan.detections);
      const output = res.anonymizedTurns[0].content;

      for (const m of (item.privacy_mask || [])) {
        const val = (m.value || "").trim();
        if (!val || val.length < 3) continue;
        if (!SENSITIVE_CATEGORIES.has(m.label)) continue;

        const cat = normalizeCategory(m.label);
        dsTargets++;
        const isLeaked = output.includes(val);
        const isProtected = !isLeaked;

        if (isProtected) dsProtected++;
        recordStat(cat, isProtected, {
          dataset: "ai4privacy",
          category: cat,
          raw_type: m.label,
          value: val,
          snippet: text.slice(Math.max(0, m.start - 30), Math.min(text.length, m.end + 30))
        });
      }
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const recall = dsTargets > 0 ? ((dsProtected / dsTargets) * 100).toFixed(2) : "100.00";
    console.log(`  Records: ${dsRecords} | Targets: ${dsTargets} | Protected: ${dsProtected} | Recall: ${recall}% | Elapsed: ${elapsed}s`);
    gapsReport.datasets["ai4privacy"] = { records: dsRecords, targets: dsTargets, protected: dsProtected, recall: `${recall}%` };
    grandTotalRecords += dsRecords;
    grandTotalTargets += dsTargets;
    grandProtectedTargets += dsProtected;
  }

  // ---------------------------------------------------------------------------
  // FINAL CONSOLIDATION & BREAKDOWN
  // ---------------------------------------------------------------------------
  grandLeakedTargets = grandTotalTargets - grandProtectedTargets;
  const grandRecall = grandTotalTargets > 0 ? ((grandProtectedTargets / grandTotalTargets) * 100).toFixed(2) : "100.00";
  const grandLeakRate = grandTotalTargets > 0 ? ((grandLeakedTargets / grandTotalTargets) * 100).toFixed(2) : "0.00";

  console.log("\n================================================================================");
  console.log("                      GLOBAL BENCHMARK AUDIT RESULTS");
  console.log("================================================================================");
  console.log(`[*] Total Records Evaluated : ${grandTotalRecords}`);
  console.log(`[*] Total Sensitive Targets : ${grandTotalTargets}`);
  console.log(`[*] Protected Secrets       : ${grandProtectedTargets} (${grandRecall}%)`);
  console.log(`[*] Leaked Secrets (Gaps)   : ${grandLeakedTargets} (${grandLeakRate}%)`);

  console.log("\n[*] BREAKDOWN BY ENTITY CATEGORY:");
  console.log("--------------------------------------------------------------------------------");
  console.log("Category           | Total Targets | Protected | Leaked  | Recall Rate");
  console.log("--------------------------------------------------------------------------------");

  for (const [cat, stat] of Object.entries(categoryStats).sort((a,b) => b[1].total - a[1].total)) {
    const rec = ((stat.protected / stat.total) * 100).toFixed(1);
    const catCol = cat.padEnd(18, " ");
    const totCol = String(stat.total).padStart(13, " ");
    const proCol = String(stat.protected).padStart(9, " ");
    const lkCol  = String(stat.leaked).padStart(7, " ");
    const recCol = (rec + "%").padStart(11, " ");
    console.log(`${catCol} | ${totCol} | ${proCol} | ${lkCol} | ${recCol}`);
    gapsReport.summary[cat] = { total: stat.total, protected: stat.protected, leaked: stat.leaked, recall: `${rec}%` };
  }
  console.log("--------------------------------------------------------------------------------");

  gapsReport.sample_leaks = sampleLeaksByCat;
  const reportOut = path.join(__dirname, "..", "data", "benchmarks", "benchmark_gaps_report.json");
  fs.writeFileSync(reportOut, JSON.stringify(gapsReport, null, 2), "utf8");
  console.log(`\n[+] Full gap analysis and failure samples saved to: ${reportOut}`);
}

runBenchmark().catch(console.error);
