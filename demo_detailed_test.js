/**
 * SafeShare-AI — Comprehensive Realistic Stress-Test Demo
 * Simulates a complex enterprise conversation with mixed data:
 * - Hard Secrets (API keys, NIK, DB URI, phone)
 * - Personal Sensitive Context (Personal salary, private debt, psychiatric prescription)
 * - Safe Statistical & Technical Context (Market benchmark salary, local host, general medical questions)
 */

const HeuristicsRedactor = require("./extension/engine/heuristics.js");
const ContextualClassifier = require("./extension/engine/contextual.js");
const ConsistentPseudonymizer = require("./extension/engine/pseudonymizer.js");
const SafeShareCrypto = require("./extension/engine/crypto.js");

async function runDetailedTest() {
  console.log("================================================================================");
  console.log("       SAFESHARE-AI: DETAILED MULTI-DIMENSIONAL STRESS TEST");
  console.log("================================================================================");

  const sampleConversation = [
    {
      role: "user",
      content: 
        "Halo ChatGPT, tolong bantu saya melakukan review karir dan finansial. " +
        "Nama saya Budi Santoso, NIK saya 3201012304950001, email kerja saya budi.santoso@megacorp.internal, dan nomor WA saya 081234567890. " +
        "Saat ini gaji pokok saya adalah Rp 28.500.000 per bulan, namun cicilan KPR dan hutang pinjol saya mencapai Rp 14.200.000 per bulan. " +
        "Selain itu, dokter psikiater kemarin mendiagnosis saya mengidap depresi klinis dan meresepkan obat Lexapro 20mg setiap malam. " +
        "Di kantor, saya juga sedang memegang repositori rahasia Project Valkyrie Core dengan database di postgresql://admin:SuperSecretPass99!@prod-db-master.corp.internal:5432/core_db " +
        "dan OpenAI token saya sk-proj-ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv. " +
        "Apakah ada rekomendasi perencanaan keuangan dan penyesuaian beban kerja?"
    },
    {
      role: "assistant",
      content: 
        "Halo Budi, terima kasih telah berbagi. Mari kita bedah situasinya secara terstruktur:\n\n" +
        "1. Analisis Finansial & Pasar:\n" +
        "Berdasarkan survei industri tahun 2026, rata-rata gaji Software Engineer senior di Jakarta berkisar antara Rp 28.500.000 hingga Rp 35.000.000 per bulan. " +
        "Artinya kompensasi Anda berada pada benchmark pasar yang sehat. Namun rasio hutang Anda (Rp 14.200.000 terhadap Rp 28.500.000) adalah 49.8%, yang melampaui batas aman 30%.\n\n" +
        "2. Kesehatan Mental:\n" +
        "Mengenai obat Lexapro 20mg, secara farmakologi obat ini adalah SSRI yang membutuhkan waktu 2-4 minggu untuk stabil. Pastikan tidak menghentikan konsumsi tanpa pengawasan dokter.\n\n" +
        "3. Rekomendasi Beban Kerja:\n" +
        "Untuk keamanan teknis, jangan pernah menaruh kredensial database di script lokal, gunakan secret manager (misal AWS Secrets Manager). Untuk testing lokal, gunakan endpoint sandbox localhost:5432."
    }
  ];

  console.log("\n[INPUT RAW CHAT]");
  sampleConversation.forEach((t, i) => console.log(`--- [Turn ${i} - ${t.role.toUpperCase()}] ---\n${t.content}\n`));

  // Run Pipeline
  const heuristics = new HeuristicsRedactor();
  const contextual = new ContextualClassifier();
  const pseudonymizer = new ConsistentPseudonymizer();

  const intermediateTurns = [];
  const detectedContextual = [];

  sampleConversation.forEach((t, i) => {
    const hResult = heuristics.scan(t.content);
    const cHits = contextual.classifyTurn(hResult.sanitizedText, i);
    detectedContextual.push(...cHits);
    intermediateTurns.push({ role: t.role, content: hResult.sanitizedText });
  });

  const { anonymizedTurns, mappings } = pseudonymizer.anonymizeConversation(intermediateTurns, detectedContextual);

  console.log("\n[HASIL SETELAH REDAKSI CERDAS (TIER 1 + TIER 2 + TIER 3)]");
  anonymizedTurns.forEach((t, i) => console.log(`--- [Turn ${i} - ${t.role.toUpperCase()}] ---\n${t.content}\n`));

  console.log("\n[DAFTAR ENTITAS YANG DISENSOR & DISAMARKAN]:");
  mappings.forEach(m => console.log(`  - [${m.category}] "${m.original}" -> ${m.pseudonym}`));

  // Encrypt
  const globalDomain = "https://safeshare-relay.bleedguard.workers.dev";
  const cryptoEngine = new SafeShareCrypto(globalDomain, globalDomain);
  const encResult = await cryptoEngine.encrypt({
    turns: anonymizedTurns,
    timestamp: new Date().toISOString()
  });

  // Store into Cloudflare D1 Database via live production Worker
  const res = await fetch(`${globalDomain}/api/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: encResult.shareId,
      ciphertext: encResult.ciphertext,
      ttl: 86400
    })
  });

  console.log("\n" + "=".repeat(80));
  console.log("                       TAUTAN DEMO STRESS-TEST BERHASIL DIBUAT!");
  console.log("=".repeat(80));
  console.log("\n👉 Tautan Manusia (Bisa Didekripsi & Dilihat):");
  console.log(`   ${encResult.fullShareUrl}\n`);
  console.log("👉 Tautan Crawler (Googlebot / Bot Scraper):");
  console.log(`   ${globalDomain}/s/${encResult.shareId}\n`);
  console.log("=".repeat(80));
}

runDetailedTest().catch(console.error);
