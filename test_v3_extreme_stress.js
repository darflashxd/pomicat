/**
 * SafeShare-AI — Comprehensive V3 Extreme Stress-Testing Suite
 * 
 * Verifies the 16 High-Adversarial Out-of-the-Box Edge Cases:
 *   Case 01: Form-style Name (Nama Lengkap : Raden Mas Danang Sutowijoyo)
 *   Case 02: Indonesian NPWP Tax ID (01.234.567.8-901.000)
 *   Case 03: Indonesian Passport (C1234567)
 *   Case 04: BPJS Ketenagakerjaan (19012345678)
 *   Case 05: BPJS Kesehatan (0001234567890)
 *   Case 06: Indonesian Driving License SIM A (980112345678)
 *   Case 07: KTP Full Address with Comma Segments
 *   Case 08: Indonesian Slang Financial (45 jeti nett & 3,5 jeti)
 *   Case 09: Web3 EVM / Ethereum Wallet Address (0x71C8...)
 *   Case 10: BIP-39 12-Word Mnemonic Recovery Seed Phrase
 *   Case 11: Production Stripe API Secret Key (sk_live_...)
 *   Case 12: Slack Incoming Webhook Integration URL
 *   Case 13: Linux /etc/shadow Password Hash ($6$rounds=...)
 *   Case 14: Clinical Lab Biomarkers (CD4 185 cells/uL & HIV Viral Load 45.000 copies/mL)
 *   Case 15: Psychotropic Medications (Clonazepam, Risperidone, Lithium Carbonate)
 *   Case 16: Zero False Positive on Kubernetes Code & IP CIDR (runAsUser: 1000, 10.244.0.15/32)
 */

const assert = require("assert");
const HeuristicsRedactor = require("./extension/engine/heuristics.js");
const ContextualClassifier = require("./extension/engine/contextual.js");
const ConsistentPseudonymizer = require("./extension/engine/pseudonymizer.js");

function runV3StressAudit() {
  console.log("================================================================================");
  console.log("       SAFESHARE-AI: 16 OUT-OF-THE-BOX V3 EXTREME STRESS SCENARIOS");
  console.log("================================================================================");

  const heuristics = new HeuristicsRedactor();
  const contextual = new ContextualClassifier();
  const pseudonymizer = new ConsistentPseudonymizer();

  function processChat(userText, assistantText = "") {
    pseudonymizer.reset();
    const turns = [
      { role: "user", content: userText },
      { role: "assistant", content: assistantText }
    ];

    const intermediateTurns = [];
    const detected = [];

    turns.forEach((t, i) => {
      const hRes = heuristics.scan(t.content);
      const cHits = contextual.classifyTurn(hRes.sanitizedText, i);
      detected.push(...cHits);
      intermediateTurns.push({ role: t.role, content: hRes.sanitizedText });
    });

    return pseudonymizer.anonymizeConversation(intermediateTurns, detected);
  }

  // --- Case 01: Form-style Name ---
  console.log("\n[Case 01] Testing Form-style Name (Nama Lengkap : Raden Mas Danang Sutowijoyo)...");
  const res01 = processChat("Nama Lengkap : Raden Mas Danang Sutowijoyo\nEmail: danang@corp.internal");
  assert(!res01.anonymizedTurns[0].content.includes("Danang Sutowijoyo"), "Name must be sanitized!");
  assert(res01.anonymizedTurns[0].content.includes("[User_A]"), "Must map to [User_A]");
  console.log("  [✓] Case 01 Passed: Form-style name sanitized to [User_A]");

  // --- Case 02: Indonesian NPWP Tax ID ---
  console.log("\n[Case 02] Testing Indonesian NPWP Tax ID (01.234.567.8-901.000)...");
  const res02 = processChat("NPWP Pribadi : 01.234.567.8-901.000 untuk lapor SPT.");
  assert(!res02.anonymizedTurns[0].content.includes("01.234.567.8-901.000"), "NPWP must be redacted!");
  assert(res02.anonymizedTurns[0].content.includes("[REDACTED_NPWP]"));
  console.log("  [✓] Case 02 Passed: NPWP Tax ID redacted cleanly!");

  // --- Case 03: Indonesian Passport ---
  console.log("\n[Case 03] Testing Passport RI (C1234567)...");
  const res03 = processChat("Nomor Paspor RI : C1234567 berlaku sampai 2031.");
  assert(!res03.anonymizedTurns[0].content.includes("C1234567"), "Passport number must not leak!");
  assert(res03.anonymizedTurns[0].content.includes("[REDACTED_PASSPORT]"));
  console.log("  [✓] Case 03 Passed: Passport number redacted!");

  // --- Case 04 & 05: BPJS Ketenagakerjaan & BPJS Kesehatan ---
  console.log("\n[Case 04 & 05] Testing BPJS Kesehatan & Ketenagakerjaan...");
  const res04 = processChat("Nomor BPJS Ketenagakerjaan : 19012345678 dan Nomor BPJS Kesehatan : 0001234567890.");
  assert(!res04.anonymizedTurns[0].content.includes("19012345678"), "BPJS TK must not leak!");
  assert(!res04.anonymizedTurns[0].content.includes("0001234567890"), "BPJS Kesehatan must not leak!");
  assert(res04.anonymizedTurns[0].content.includes("[REDACTED_BPJS]"));
  console.log("  [✓] Case 04 & 05 Passed: BPJS numbers redacted cleanly!");

  // --- Case 06: Indonesian Driver License (SIM) ---
  console.log("\n[Case 06] Testing Indonesian SIM A (980112345678)...");
  const res06 = processChat("Nomor SIM A : 980112345678 atas nama saya.");
  assert(!res06.anonymizedTurns[0].content.includes("980112345678"), "SIM must not leak!");
  assert(res06.anonymizedTurns[0].content.includes("[REDACTED_SIM]"));
  console.log("  [✓] Case 06 Passed: SIM driver license redacted!");

  // --- Case 07: KTP Full Address with Form Header & Comma Segments ---
  console.log("\n[Case 07] Testing KTP Address with Comma Segments...");
  const res07 = processChat("Alamat KTP : Jalan Swadaya IV Gang Kelinci No. 28 RT 07 RW 03, Kelurahan Menteng Atas, Setiabudi, Jakarta Selatan\nNomor HP: 081198765432");
  assert(!res07.anonymizedTurns[0].content.includes("Swadaya IV Gang Kelinci"), "Full street address must be redacted!");
  assert(!res07.anonymizedTurns[0].content.includes("Menteng Atas"), "Subdistrict must not leak!");
  assert(res07.anonymizedTurns[0].content.includes("[REDACTED_ADDRESS]"));
  console.log("  [✓] Case 07 Passed: Full KTP address with commas completely redacted!");

  // --- Case 08: Slang Financial (45 jeti nett & 3,5 jeti) ---
  console.log("\n[Case 08] Testing Slang Financial (45 jeti nett & 3,5 jeti)...");
  const res08 = processChat("Gaji pokok gwe sebenernya 45 jeti nett per bulan, ditambah transport 3,5 jeti.", "Total penghasilan dari gaji 45 jeti dan transport 3,5 jeti adalah 48,5 jeti.");
  assert(!res08.anonymizedTurns[0].content.includes("45 jeti"), "45 jeti must be redacted in user turn!");
  assert(!res08.anonymizedTurns[0].content.includes("3,5 jeti"), "3,5 jeti must be redacted in user turn!");
  assert(!res08.anonymizedTurns[1].content.includes("45 jeti"), "45 jeti must not leak in assistant turn!");
  assert(!res08.anonymizedTurns[1].content.includes("48,5 jeti"), "Derived sum 48,5 jeti must not leak!");
  console.log("  [✓] Case 08 Passed: Slang financial '45 jeti' and derived sums completely masked!");

  // --- Case 09: Ethereum / EVM Wallet Address ---
  console.log("\n[Case 09] Testing EVM Ethereum Wallet Address (0x71C8...)...");
  const res09 = processChat("Alamat EVM / Ethereum hot-wallet saya: 0x71C8363837F033a061E33074b12574A9292397B1.");
  assert(!res09.anonymizedTurns[0].content.includes("0x71C8363837F033a061E33074b12574A9292397B1"), "ETH wallet must be redacted!");
  assert(res09.anonymizedTurns[0].content.includes("[REDACTED_CRYPTO_WALLET]"));
  console.log("  [✓] Case 09 Passed: Ethereum EVM address redacted!");

  // --- Case 10: BIP-39 12-Word Mnemonic Recovery Seed Phrase ---
  console.log("\n[Case 10] Testing BIP-39 12-Word Seed Phrase...");
  const res10 = processChat("Kunci 12-Word Mnemonic Recovery Seed Phrase backup (BIP-39) saya: witch collapse practice feed shame open despair creek road again ice least\nLainnya aman.");
  assert(!res10.anonymizedTurns[0].content.includes("witch collapse practice feed"), "Mnemonic words must not leak!");
  assert(res10.anonymizedTurns[0].content.includes("[REDACTED_MNEMONIC_SEED_PHRASE]"));
  console.log("  [✓] Case 10 Passed: BIP-39 12-word recovery seed phrase redacted!");

  // --- Case 11: Production Stripe Secret Key ---
  console.log("\n[Case 11] Testing Production Stripe Secret Key (sk_live_...)...");
  const testStripeKey = ["sk", "live", "51MzqABC1234567890defghijklmnopqrstuvwxyz"].join("_");
  const res11 = processChat(`Stripe key: ${testStripeKey}.`);
  assert(!res11.anonymizedTurns[0].content.includes(testStripeKey), "Stripe secret must be redacted!");
  assert(res11.anonymizedTurns[0].content.includes("[REDACTED_STRIPE_KEY]"));
  console.log("  [✓] Case 11 Passed: Stripe secret key masked with placeholder!");

  // --- Case 12: Slack Incoming Webhook URL ---
  console.log("\n[Case 12] Testing Slack Webhook Integration URL...");
  const testSlackWebhook = ["https://", "hooks.slack.com", "/services/T012AB34C/B567DE89F/1a2b3c4d5e6f7g8h9i0jklmn"].join("");
  const res12 = processChat(`Endpoint: ${testSlackWebhook}.`);
  assert(!res12.anonymizedTurns[0].content.includes("T012AB34C/B567DE89F/1a2b3c4d5e6f7g8h9i0jklmn"), "Slack token must not leak!");
  assert(res12.anonymizedTurns[0].content.includes("[REDACTED_SLACK_WEBHOOK]"));
  console.log("  [✓] Case 12 Passed: Slack incoming webhook masked!");

  // --- Case 13: Linux /etc/shadow Password Hash ---
  console.log("\n[Case 13] Testing Linux /etc/shadow Password Hash ($6$rounds=...)...");
  const res13 = processChat("cat /etc/shadow\nroot:$6$rounds=4096$roundsSalt123$qZ18xTA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0:19500:0:99999:7:::");
  assert(!res13.anonymizedTurns[0].content.includes("roundsSalt123$qZ18xT"), "Shadow hash must be redacted!");
  assert(res13.anonymizedTurns[0].content.includes("[REDACTED_PASSWORD_HASH]"));
  console.log("  [✓] Case 13 Passed: Linux /etc/shadow hash redacted!");

  // --- Case 14: Clinical Lab Biomarkers (CD4 & Viral Load) ---
  console.log("\n[Case 14] Testing Clinical Lab Biomarkers vs Currency Confusion...");
  const res14 = processChat("Hasil tes darah: Limfosit CD4 absolut tercatat 185 cells/uL dan HIV-1 RNA Quantitative Viral Load tercatat 45.000 copies/mL.");
  assert(!res14.anonymizedTurns[0].content.includes("185 cells/uL"), "CD4 lab biomarker must be redacted!");
  assert(!res14.anonymizedTurns[0].content.includes("45.000 copies/mL"), "Viral load lab biomarker must be redacted!");
  assert(res14.anonymizedTurns[0].content.includes("[CONFIDENTIAL_HEALTH_RECORD_"), "Must be tagged as health record");
  assert(!res14.anonymizedTurns[0].content.includes("[REDACTED_FINANCIAL_"), "Viral load must NEVER be mistaken as money!");
  console.log("  [✓] Case 14 Passed: Medical lab biomarkers sanitized without financial false-tagging!");

  // --- Case 15: Psychotropic Medications ---
  console.log("\n[Case 15] Testing Psychotropics (Clonazepam, Risperidone, Lithium Carbonate)...");
  const res15 = processChat("Resep psikiater: Clonazepam 2mg, Risperidone 2mg, dan Lithium Carbonate 300mg.");
  assert(!res15.anonymizedTurns[0].content.includes("Clonazepam 2mg"), "Clonazepam must be redacted!");
  assert(!res15.anonymizedTurns[0].content.includes("Risperidone 2mg"), "Risperidone must be redacted!");
  assert(!res15.anonymizedTurns[0].content.includes("Lithium Carbonate 300mg"), "Lithium Carbonate must be redacted!");
  console.log("  [✓] Case 15 Passed: Psychotropic medications completely redacted!");

  // --- Case 16: Zero False Positive on Kubernetes Code & IP CIDR ---
  console.log("\n[Case 16] Testing Zero False Positive on Kubernetes YAML & IP CIDR...");
  const k8sUserPrompt = "Tolong perbaiki deployment Kubernetes ini.";
  const k8sAssistantReply = `Berikut konfigurasinya:
\`\`\`yaml
securityContext:
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000
cidr: 10.244.0.15/32
\`\`\`
Endpoint metrics internal: http://10.244.0.15:9090/metrics`;

  const res16 = processChat(k8sUserPrompt, k8sAssistantReply);
  assert(res16.anonymizedTurns[1].content.includes("runAsUser: 1000"), "runAsUser: 1000 in code block must be 100% PRESERVED!");
  assert(res16.anonymizedTurns[1].content.includes("runAsGroup: 1000"), "runAsGroup: 1000 must be PRESERVED!");
  assert(res16.anonymizedTurns[1].content.includes("10.244.0.15/32"), "IP CIDR 10.244.0.15/32 must not be mangled as money!");
  assert(!res16.anonymizedTurns[1].content.includes("[REDACTED_BUDGET_ALLOCATION]/32"), "IP CIDR must not have budget tag!");
  console.log("  [✓] Case 16 Passed: Kubernetes YAML & Private IP CIDR 100% preserved (Zero over-redaction)!");

  console.log("\n================================================================================");
  console.log("   ALL 16 V3 EXTREME ADVERSARIAL STRESS SCENARIOS PASSED WITH 100% ACCURACY!");
  console.log("================================================================================");
}

runV3StressAudit();
