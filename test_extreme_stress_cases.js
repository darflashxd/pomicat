/**
 * SafeShare-AI — Comprehensive Extreme Stress-Testing Suite
 * 
 * Verifies all 16 Out-of-the-Box Adversarial Vectors:
 *   Vector 01: Algebraic Inversion Defense (33 juta rounded midpoint projection)
 *   Vector 02: Delta Increment Only (Rp 4.275.000 salary bump)
 *   Vector 03: Cashflow Residual (Rp 14.300.000 salary - debt)
 *   Vector 04: Powerline Zsh Shell Prompt (@darflashxd )
 *   Vector 05: Kali Linux Modern Prompt (┌──(user㉿host))
 *   Vector 06: macOS Terminal Prompt (user@host ~ %)
 *   Vector 07: Windows PowerShell Prompt (PS C:\Users\user\...)
 *   Vector 08: Git Commit Author Traces (Author: user <email>)
 *   Vector 09: SSH Public Key Identity Comment (ssh-ed25519 ... user@host)
 *   Vector 10: POSIX whoami / id Command Output (uid=1000(user)...)
 *   Vector 11: Medical Brand-to-Generic Expansion (Lexapro <-> escitalopram)
 *   Vector 12: Zero False Positive on CTF Assembly (&setcontext)
 *   Vector 13: Zero False Positive on Public Salary Benchmark (Indeed Rp 25,91 juta)
 *   Vector 14: Zero False Positive on Educational Medical Mechanism
 *   Vector 15: Anti-Tamper Permanent Lockout & Hash Shredding (F5 immunity)
 *   Vector 16: Zero-Width Forensic Steganography Traitor Tracing
 */

const assert = require("assert");
const HeuristicsRedactor = require("./extension/engine/heuristics.js");
const ContextualClassifier = require("./extension/engine/contextual.js");
const ConsistentPseudonymizer = require("./extension/engine/pseudonymizer.js");
const SafeShareTamperGuard = require("./viewer/engine/tamper_guard.js");
const SafeShareSteganography = require("./viewer/engine/steganography.js");

function runExtremeStressAudit() {
  console.log("================================================================================");
  console.log("       SAFESHARE-AI: 16 ADVERSARIAL EXTREME STRESS-TEST SCENARIOS");
  console.log("================================================================================");

  const heuristics = new HeuristicsRedactor();
  const contextual = new ContextualClassifier();
  const pseudonymizer = new ConsistentPseudonymizer();

  // ---------------------------------------------------------------------------
  // VECTOR 01: Algebraic Inversion Defense (The 33 Juta Rounded Projection)
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 01] Testing Algebraic Inversion Defense (The 33 Juta Leak)...");
  pseudonymizer.reset();
  const turns01 = [
    { role: "user", content: "Gaji pokok saya saat ini adalah Rp 28.500.000 per bulan di kantor." },
    { role: "assistant", content: "Untuk gaji Anda yang saat ini Rp 28.500.000, Anda bisa meminta kenaikan 15-20% menjadi sekitar Rp 33.000.000 dengan menekankan kontribusi Anda." }
  ];
  const detected01 = [{ turnIndex: 0, raw: "Rp 28.500.000", category: "SENSITIVE_FINANCIAL" }];
  const res01 = pseudonymizer.anonymizeConversation(turns01, detected01);

  assert(!res01.anonymizedTurns[1].content.includes("33.000.000"), "33.000.000 must NEVER leak!");
  assert(res01.anonymizedTurns[1].content.includes("[REDACTED_PROJECTED_SALARY]"), "Must be replaced with [REDACTED_PROJECTED_SALARY]");
  console.log("  [+] Output:", res01.anonymizedTurns[1].content);
  console.log("  [✓] Vector 01 Passed: 33 Juta Algebraic Inversion completely neutralized!");

  // ---------------------------------------------------------------------------
  // VECTOR 02: Delta Increment Only
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 02] Testing Delta Increment Only (Rp 4.275.000 raise)...");
  const turns02 = [
    { role: "user", content: "Gaji saya Rp 28.500.000." },
    { role: "assistant", content: "Kenaikan 15% itu berarti kenaikan hanya Rp 4.275.000 per bulan." }
  ];
  const res02 = pseudonymizer.anonymizeConversation(turns02, detected01);
  assert(!res02.anonymizedTurns[1].content.includes("4.275.000"), "Delta increment 4.275.000 must not leak!");
  assert(res02.anonymizedTurns[1].content.includes("[REDACTED_SALARY_INCREMENT]"));
  console.log("  [✓] Vector 02 Passed: Delta Increment masked successfully!");

  // ---------------------------------------------------------------------------
  // VECTOR 03: Cashflow Residual (Salary - Debt)
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 03] Testing Cashflow Residual (Salary 28.5M - Debt 14.2M = 14.3M)...");
  pseudonymizer.reset();
  const turns03 = [
    { role: "user", content: "Gaji saya Rp 28.500.000 dan cicilan KPR Rp 14.200.000 per bulan." },
    { role: "assistant", content: "Sisa setelah cicilan Anda adalah Rp 14.300.000 per bulan." }
  ];
  const detected03 = [
    { turnIndex: 0, raw: "Rp 28.500.000", category: "SENSITIVE_FINANCIAL" },
    { turnIndex: 0, raw: "Rp 14.200.000", category: "SENSITIVE_FINANCIAL" }
  ];
  const res03 = pseudonymizer.anonymizeConversation(turns03, detected03);
  assert(!res03.anonymizedTurns[1].content.includes("14.300.000"), "Remainder 14.300.000 must not leak!");
  assert(res03.anonymizedTurns[1].content.includes("[REDACTED_REMAINDER_CASHFLOW]"));
  console.log("  [✓] Vector 03 Passed: Cashflow Residual masked successfully!");

  // ---------------------------------------------------------------------------
  // VECTOR 04: Powerline Zsh Shell Prompt (@darflashxd)
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 04] Testing Powerline Zsh Shell Prompt (@darflashxd )...");
  const raw04 = "Mon 28 Sep - 18:24  ~  @darflashxd  node demo_run.js";
  const h04 = heuristics.scan(raw04);
  assert(!h04.sanitizedText.includes("darflashxd"), "Handle @darflashxd must not leak in Powerline prompt!");
  assert(h04.sanitizedText.includes("@[user]"), "Must be sanitized to @[user]");
  console.log("  [+] Output:", h04.sanitizedText);
  console.log("  [✓] Vector 04 Passed: Powerline prompt sanitized!");

  // ---------------------------------------------------------------------------
  // VECTOR 05: Kali Linux Modern Shell Prompt
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 05] Testing Kali Linux Modern Shell Prompt...");
  const raw05 = "┌──(darflashxd㉿kali)-[~/CTFdScraper]\n└─$ ./run.sh";
  const h05 = heuristics.scan(raw05);
  assert(!h05.sanitizedText.includes("darflashxd"), "Username darflashxd must not leak in Kali prompt!");
  assert(!h05.sanitizedText.includes("CTFdScraper"), "Directory must not leak!");
  console.log("  [+] Output:\n", h05.sanitizedText);
  console.log("  [✓] Vector 05 Passed: Kali Linux prompt sanitized!");

  // ---------------------------------------------------------------------------
  // VECTOR 06: macOS Terminal Prompt
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 06] Testing macOS Terminal Prompt (user@host ~ %)...");
  const raw06 = "darflashxd@MacBook-Pro ~ % brew install cmake";
  const h06 = heuristics.scan(raw06);
  assert(!h06.sanitizedText.includes("darflashxd"), "Username must not leak in macOS prompt!");
  assert(!h06.sanitizedText.includes("MacBook-Pro"), "Hostname must not leak in macOS prompt!");
  console.log("  [✓] Vector 06 Passed: macOS prompt sanitized!");

  // ---------------------------------------------------------------------------
  // VECTOR 07: Windows PowerShell Prompt
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 07] Testing Windows PowerShell Prompt...");
  const raw07 = "PS C:\\Users\\darflashxd\\Projects\\secret> git status";
  const h07 = heuristics.scan(raw07);
  assert(!h07.sanitizedText.includes("darflashxd"), "Windows username must not leak!");
  assert(h07.sanitizedText.includes("C:\\Users\\[user]"), "Path must contain [user]");
  console.log("  [✓] Vector 07 Passed: Windows PowerShell prompt sanitized!");

  // ---------------------------------------------------------------------------
  // VECTOR 08: Git Commit Author Traces
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 08] Testing Git Commit Author Traces...");
  const raw08 = "Author: darflashxd <darflash@megacorp.internal>";
  const h08 = heuristics.scan(raw08);
  assert(!h08.sanitizedText.includes("darflashxd"), "Git author name must not leak!");
  assert(!h08.sanitizedText.includes("darflash@megacorp.internal"), "Git email must not leak!");
  console.log("  [✓] Vector 08 Passed: Git author trace sanitized!");

  // ---------------------------------------------------------------------------
  // VECTOR 09: SSH Public Key Identity Comment
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 09] Testing SSH Public Key Identity Comment...");
  const raw09 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG5pBMySecretKeyPayloadForDemo00000 darflashxd@laptop-arch";
  const h09 = heuristics.scan(raw09);
  assert(!h09.sanitizedText.includes("darflashxd@laptop-arch"), "SSH key comment must not leak!");
  assert(h09.sanitizedText.includes("[user]@[host]"), "Must be replaced with [user]@[host]");
  console.log("  [✓] Vector 09 Passed: SSH key comment sanitized!");

  // ---------------------------------------------------------------------------
  // VECTOR 10: POSIX whoami / id Command Output
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 10] Testing POSIX id Command Output...");
  const raw10 = "uid=1000(darflashxd) gid=1000(darflashxd) groups=1000(darflashxd)";
  const h10 = heuristics.scan(raw10);
  assert(!h10.sanitizedText.includes("darflashxd"), "whoami/id username must not leak!");
  console.log("  [✓] Vector 10 Passed: POSIX identity command output sanitized!");

  // ---------------------------------------------------------------------------
  // VECTOR 11: Medical Brand-to-Generic Expansion (Lexapro <-> escitalopram)
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 11] Testing Medical Brand-to-Generic Expansion...");
  pseudonymizer.reset();
  const turns11 = [
    { role: "user", content: "Dokter psikiater meresepkan saya Lexapro 20mg setiap malam." },
    { role: "assistant", content: "Karena ini menyangkut obat resep, jangan menghentikan escitalopram 20mg sendiri." }
  ];
  const detected11 = [{ turnIndex: 0, raw: "Lexapro 20mg", category: "SENSITIVE_HEALTH" }];
  const res11 = pseudonymizer.anonymizeConversation(turns11, detected11);
  assert(!res11.anonymizedTurns[1].content.toLowerCase().includes("escitalopram"), "Generic chemical escitalopram must not leak!");
  assert(!res11.anonymizedTurns[1].content.includes("Lexapro 20mg"));
  console.log("  [✓] Vector 11 Passed: Brand-to-generic medical mapping active!");

  // ---------------------------------------------------------------------------
  // VECTOR 12: Zero False Positive on CTF Assembly (&setcontext)
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 12] Testing Zero False Positive on CTF Assembly (&setcontext)...");
  const raw12 = "gdb -q --batch -ex \"x/2i &setcontext\" ./libc.so.6";
  const h12 = heuristics.scan(raw12);
  assert(h12.sanitizedText.includes("&setcontext"), "CTF syntax &setcontext must remain 100% intact!");
  assert(!h12.sanitizedText.includes("[REDACTED_ADDRESS]"), "Must NOT be misclassified as physical street address!");
  console.log("  [✓] Vector 12 Passed: CTF &setcontext command 100% preserved!");

  // ---------------------------------------------------------------------------
  // VECTOR 13: Zero False Positive on Public Salary Benchmark (Indeed)
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 13] Testing Zero False Positive on Public Benchmark (Indeed Rp 25,91 juta)...");
  const statText = "Indeed memperbarui datanya dan mencatat rata-rata base salary Senior Software Engineer Jakarta sekitar Rp25,91 juta/bulan.";
  const classifiedStat = contextual.classifyTurn(statText, 0);
  assert.strictEqual(classifiedStat.length, 0, "Public statistical benchmark must be preserved as SAFE (O)!");
  console.log("  [✓] Vector 13 Passed: Public market benchmark 100% preserved (No over-redaction)!");

  // ---------------------------------------------------------------------------
  // VECTOR 14: Zero False Positive on Educational Medical Mechanism
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 14] Testing Zero False Positive on Educational Medical Mechanism...");
  const eduMedText = "Bagaimana mekanisme kerja farmakologi dari obat Lexapro 20mg pada reseptor serotonin?";
  const classifiedEdu = contextual.classifyTurn(eduMedText, 0);
  assert.strictEqual(classifiedEdu.length, 0, "Educational pharmacology question must be preserved as SAFE (O)!");
  console.log("  [✓] Vector 14 Passed: Educational medical mechanism 100% preserved!");

  // ---------------------------------------------------------------------------
  // VECTOR 15: Anti-Tamper Permanent Lockout & Hash Shredding (F5 Immunity)
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 15] Testing Anti-Tamper Permanent Lockout & Hash Shredding...");
  const testShareId = "stress-tamper-session-001";
  const guard = new SafeShareTamperGuard({ shareId: testShareId });

  // Trigger simulated F12 violation
  guard.triggerViolation("Simulated F12 Key Press");
  assert.strictEqual(guard.isTriggered, true, "Guard must be triggered");

  // Verify poison persistence
  const isPoisoned = SafeShareTamperGuard.isPoisoned(testShareId);
  assert.strictEqual(isPoisoned, true, "Session must remain permanently poisoned against F5 refresh!");
  console.log("  [✓] Vector 15 Passed: Anti-Tamper permanent lockout verified!");

  // ---------------------------------------------------------------------------
  // VECTOR 16: Zero-Width Forensic Steganography Traitor Tracing
  // ---------------------------------------------------------------------------
  console.log("\n[Vector 16] Testing Zero-Width Forensic Steganography Traitor Tracing...");
  const stegKey = "SafeShare-Adversarial-Key-2026";
  const steg = new SafeShareSteganography(stegKey);
  const originalReport = "Evaluasi kinerja teknis rahasia kuartal 4 internal perbankan.";
  const traitorMeta = {
    recipientId: "adversary_bob",
    sessionId: "sess_adv_7788",
    timestamp: 1790000000000
  };

  const embedded = steg.embed(originalReport, traitorMeta, stegKey);
  assert(embedded.length > originalReport.length, "Embedded string must carry zero-width bits");
  assert.strictEqual(steg.clean(embedded), originalReport, "Cleaned string must match original bit-exact");

  const extracted = steg.extract(embedded, stegKey);
  assert.strictEqual(extracted.detected, true, "Watermark must be detected");
  assert.strictEqual(extracted.validSignature, true, "HMAC signature must verify");
  assert.strictEqual(extracted.metadata.recipientId, "adversary_bob", "Traitor ID must match 100%");
  assert.strictEqual(extracted.metadata.sessionId, "sess_adv_7788", "Session nonce must match 100%");
  console.log("  [✓] Vector 16 Passed: Forensic Traitor Tracing 100% verified!");

  console.log("\n================================================================================");
  console.log("   ALL 16 EXTREME ADVERSARIAL STRESS SCENARIOS PASSED WITH 100% ACCURACY!");
  console.log("================================================================================");
}

runExtremeStressAudit();
