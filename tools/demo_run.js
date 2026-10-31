/**
 * PomiCat: Interactive End-to-End Demo Launcher
 * Runs the 3-Tier Redactor, encrypts a realistic sensitive AI session,
 * stores it into the Cloudflare Global Edge & Local Relay, and outputs the Zero-Knowledge links.
 */

const HeuristicsRedactor = require("../extension/engine/heuristics.js");
const ContextualClassifier = require("../extension/engine/contextual.js");
const ConsistentPseudonymizer = require("../extension/engine/pseudonymizer.js");
const SafeShareCrypto = require("../extension/engine/crypto.js");

async function launchDemo() {
  console.log("================================================================================");
  console.log("             SAFESHARE-AI: LIVE INTERACTIVE END-TO-END DEMO");
  console.log("================================================================================");

  const sampleTurns = [
    {
      role: "user",
      content: "Halo AI, NIK saya 3201012304950001 dan OpenAI Key saya sk-proj-ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv. Tolong buatkan draf negosiasi gaji ke manajemen. Gaji pokok saya saat ini adalah Rp 28.500.000 per bulan di kantor."
    },
    {
      role: "assistant",
      content: "Tentu! Berdasarkan data pasar tahun 2026, rata-rata gaji Software Engineer di Jakarta adalah Rp 28.500.000 per bulan. Untuk gaji Anda yang saat ini Rp 28.500.000, Anda bisa meminta kenaikan 15-20% menjadi sekitar Rp 33.000.000 dengan menekankan kontribusi Anda."
    }
  ];

  console.log("\n[Step 1] Input Percakapan Asli (Mengandung PII & Rahasia):");
  sampleTurns.forEach((t, i) => console.log(`  [Turn ${i} - ${t.role.toUpperCase()}]:\n  "${t.content}"\n`));

  // 1. Run Pipeline
  console.log("[*] Menjalankan Pipeline Redaksi 3-Tier SafeShare-AI...");
  const heuristics = new HeuristicsRedactor();
  const contextual = new ContextualClassifier();
  const pseudonymizer = new ConsistentPseudonymizer();

  const intermediateTurns = [];
  const detectedContextual = [];

  sampleTurns.forEach((t, i) => {
    const hResult = heuristics.scan(t.content);
    const cHits = contextual.classifyTurn(hResult.sanitizedText, i);
    detectedContextual.push(...cHits);
    intermediateTurns.push({ role: t.role, content: hResult.sanitizedText });
  });

  const { anonymizedTurns } = pseudonymizer.anonymizeConversation(intermediateTurns, detectedContextual);

  console.log("[+] Hasil Redaksi Cerdas (Konteks Terjaga & Rahasia Tersanitasi):");
  anonymizedTurns.forEach((t, i) => console.log(`  [Turn ${i} - ${t.role.toUpperCase()}]:\n  "${t.content}"\n`));

  // 2. Client-Side AES-256-GCM Encryption
  console.log("[*] Melakukan Enkripsi Client-Side (AES-256-GCM)...");
  const cloudflareBase = "https://safeshare-relay.bleedguard.workers.dev";
  const cryptoEngine = new SafeShareCrypto(cloudflareBase, cloudflareBase);
  const payload = {
    turns: anonymizedTurns,
    timestamp: new Date().toISOString(),
    owner: "demo-user"
  };

  const encResult = await cryptoEngine.encrypt(payload);

  // 3. Upload Ciphertext to Cloudflare Edge Relay
  console.log("[*] Mengunggah ciphertext ke Cloudflare Global Edge (Zero-Laptop Dependency)...");
  let cloudUploaded = false;
  try {
    const res = await fetch(`${cloudflareBase}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: encResult.shareId,
        ciphertext: encResult.ciphertext,
        ttl: 86400
      })
    });
    if (res.ok) {
      cloudUploaded = true;
      console.log("  [✓] Sukses tersimpan di Cloudflare D1 Global Database!");
    } else {
      console.warn("  [-] Cloudflare edge returned status:", res.status);
    }
  } catch (err) {
    console.warn("  [-] Gagal mengunggah ke Cloudflare edge:", err.message);
  }

  // 4. Also upload to local server if active on port 8787
  let localUploaded = false;
  try {
    const localRes = await fetch("http://localhost:8787/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: encResult.shareId,
        ciphertext: encResult.ciphertext,
        ttl: 86400
      })
    });
    if (localRes.ok) {
      localUploaded = true;
      console.log("  [✓] Sukses tersimpan di Relay Server Lokal (Port 8787)!");
    }
  } catch (e) {
    // Local server not running
  }

  const globalShareUrl = `${cloudflareBase}/s/${encResult.shareId}#${encResult.key}`;
  const localShareUrl = `http://localhost:8787/s/${encResult.shareId}#${encResult.key}`;

  console.log("\n" + "=".repeat(80));
  console.log("             TAUTAN BERBAGI SIAP DIGUNAKAN (ZERO-KNOWLEDGE)!");
  console.log("=".repeat(80));

  if (cloudUploaded) {
    console.log("\n🌐 1. TAUTAN GLOBAL CLOUDFLARE EDGE (Bisa Dibuka di HP / Siapa Saja, Laptop Anda OFF):");
    console.log(`   ${globalShareUrl}\n`);
  }

  if (localUploaded) {
    console.log("💻 2. TAUTAN LOCALHOST (Untuk Pengujian Offline di Laptop Sendiri):");
    console.log(`   ${localShareUrl}\n`);
  }

  console.log("⚡ 3. TAUTAN STANDALONE ZERO-SERVER (0% Database / Kunci & Data di URL):");
  console.log(`   ${encResult.standaloneShareUrl}\n`);

  console.log("🤖 4. TAUTAN YANG DILIHAT CRAWLER GOOGLE / BOT (Tanpa #key -> Layar Gembok):");
  console.log(`   ${cloudflareBase}/v/${encResult.shareId}\n`);

  console.log("=".repeat(80));
  console.log("Uji Coba Langsung di Browser Anda:");
  console.log("1. Buka Tautan Global di atas di HP atau browser lain untuk membuktikan link jalan publik.");
  console.log("2. Coba klik 'Continue in ChatGPT' / 'Continue in Claude' di halaman tersebut.");
  console.log("3. Buka Tautan Crawler untuk membuktikan bahwa Googlebot HANYA melihat lock screen!");
  console.log("=".repeat(80));
}

launchDemo();
