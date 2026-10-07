/**
 * Test using the EXACT real-world ChatGPT assistant response provided by the user.
 * Validates:
 * 1. Full name Budianto Kusuma Alama -> [User_A] (no leaking Kusuma Alama)
 * 2. Physical address -> [REDACTED_ADDRESS]
 * 3. Terminal prompt venv) dracraaah@midn8:~/...$ -> [user]@[host]:~/[sandbox_path]$
 * 4. GDB command &setcontext -> NOT REDACTED (zero false positive on technical computing)
 * 5. Salary projections & increments -> [REDACTED_PROJECTED_SALARY], [REDACTED_SALARY_INCREMENT] (no trailing .000)
 * 6. Residual table cash flows -> [REDACTED_PROJECTED_CASHFLOW] (Rp18.575.000 and Rp20.000.000 blocked)
 * 7. Generic medication escitalopram -> [CONFIDENTIAL_HEALTH_RECORD_1] (brand-to-generic mapped)
 * 8. Market statistics (Indeed, Glassdoor, Levels.fyi) -> 100% PRESERVED
 */

const assert = require("assert");
const HeuristicsRedactor = require("./extension/engine/heuristics.js");
const ConsistentPseudonymizer = require("./extension/engine/pseudonymizer.js");

const rawUserPrompt = `
Halo ChatGPT, tolong bantu saya melakukan review karir, keuangan, dan troubleshooting teknis secara mendalam.

1. Profil Pribadi & Kontak:
Nama saya Budianto Kusuma Alama, alamat saya di jalan kampung durian runtuh RT 04 RW 02 nomor telfon saya 081372138173, dan email kerja saya budianto.kusuma@techindo.internal.

2. Kondisi Finansial & Karir:
Saat ini gaji pokok saya adalah Rp 28.500.000 per bulan di kantor, namun cicilan KPR dan hutang pinjol saya mencapai Rp 14.200.000 per bulan. 
Jika saya ingin mengajukan kenaikan gaji 15% atau 20% pada evaluasi kuartal ini:
- Berapa proyeksi gaji baru saya setelah naik 15% dan 20%?
- Berapa nominal kenaikan bersih yang saya terima per bulan?
- Bagaimana perbandingannya dengan rata-rata pasar Software Engineer senior di Jakarta tahun 2026?

3. Kondisi Medis:
Kemarin dokter psikiater mendiagnosis saya menderita gangguan kecemasan dan meresepkan Lexapro 20mg setiap malam. Apakah ada tips menjaga produktivitas kerja dengan kondisi ini?

4. Masalah Teknis & Kode:
Di pekerjaan CTF saya tadi sore, saya mengeksekusi shell terminal berikut:
venv) dracraaah@midn8:~/CTFdScraper/CTF/CTF COMPFEST 18/Binary Exploitation/未来日記$ gdb -q --batch -ex "x/2i &setcontext" ./libc.so.6
Dan koneksi staging database internal kami adalah:
postgresql://admin:SuperSecretPass99!@prod-db-master.corp.internal:5432/core_db
Serta OpenAI API token: sk-proj-ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv.

Tolong berikan analisis terstruktur untuk seluruh poin di atas!
`;

const rawAssistantReply = `
Berikut analisis terstruktur. Saya tidak akan menyalin ulang alamat, telepon, email kerja, password database, atau API token yang Anda cantumkan. Karena kredensial tersebut sudah terpapar di chat, bagian keamanan di bawah saya perlakukan sebagai insiden credential exposure.

1. Finansial & proyeksi kenaikan gaji

Gaji pokok saat ini: Rp 28.500.000/bulan
Cicilan KPR + pinjaman: Rp 14.200.000/bulan

Skenario	Gaji/bulan	Kenaikan	Sisa setelah cicilan*
Saat ini	Rp 28.500.000	—	Rp14.300.000
Naik 15%	32.775.000	4.275.000	Rp18.575.000
Naik 20%	34.200.000	5.700.000	Rp20.000.000

*Ini hanya gaji - cicilan, belum memperhitungkan pajak, BPJS, kebutuhan hidup, dan pengeluaran lainnya.

Secara matematis:
15%: Rp28,5 juta × 1,15 = Rp32,775 jt
20%: Rp28,5 juta × 1,20 = Rp34,2 juta

Dibandingkan pasar Jakarta 2026:
Indeed memperbarui datanya September 2026 dan mencatat rata-rata base salary Senior Software Engineer Jakarta sekitar Rp25,91 juta/bulan, berdasarkan 17 laporan.
Glassdoor mencatat median total pay sekitar Rp26,1 juta/bulan, dengan base pay sekitar Rp16,9–30 juta dan additional pay sekitar Rp1,3–4,2 juta.
Levels.fyi mencatat median total compensation tahunan Senior Software Engineer Jakarta sekitar Rp402,7 juta/tahun, atau kira-kira Rp33,6 juta/bulan jika dibagi 12.

2. Kondisi kecemasan & produktivitas kerja
Karena ini menyangkut obat resep, jangan mengubah dosis, waktu minum, atau menghentikan escitalopram/Lexapro 20mg sendiri. Dokter yang meresepkan adalah pihak yang tepat untuk menyesuaikan terapi.

3. Troubleshooting command GDB
Command Anda secara konsep melakukan:
gdb -q --batch \\
  -ex "x/2i &setcontext" \\
  ./libc.so.6

Artinya:
-q → quiet mode
--batch → jalankan command lalu keluar
-ex → execute command GDB
x/2i → examine 2 instruction
&setcontext → alamat fungsi setcontext
./libc.so.6 → binary yang dibuka

Jadi tujuan command tersebut adalah melihat dua instruksi assembly mulai dari alamat fungsi setcontext.
`;

const heuristics = new HeuristicsRedactor();
const pseudonymizer = new ConsistentPseudonymizer();

// Step 1: Scan with Heuristics
const userH = heuristics.scan(rawUserPrompt);
const assistantH = heuristics.scan(rawAssistantReply);

const turns = [
  { role: "user", content: userH.sanitizedText },
  { role: "assistant", content: assistantH.sanitizedText }
];

const detectedEntities = [
  { turnIndex: 0, raw: "Rp 28.500.000", category: "SENSITIVE_FINANCIAL" },
  { turnIndex: 0, raw: "Rp 14.200.000", category: "SENSITIVE_FINANCIAL" },
  { turnIndex: 0, raw: "Lexapro 20mg", category: "SENSITIVE_HEALTH" }
];

const { anonymizedTurns } = pseudonymizer.anonymizeConversation(turns, detectedEntities);

console.log("================================================================================");
console.log("       AUDIT HASIL NYATA: CHATGPT RAW RESPONSE RE-EVALUATION");
console.log("================================================================================");
console.log("\n[SANITIZED USER PROMPT]:\n", anonymizedTurns[0].content);
console.log("\n[SANITIZED ASSISTANT RESPONSE]:\n", anonymizedTurns[1].content);

console.log("\n" + "=".repeat(80));
console.log("PENILAIAN DETAIL PER KASUS:");

// 1. Check Name Sanitization
assert(anonymizedTurns[0].content.includes("[User_A]"), "Nama user harus diganti [User_A]");
assert(!anonymizedTurns[0].content.includes("Budianto Kusuma Alama"), "Nama lengkap asli tidak boleh ada");
console.log("  [✓] Cek 1: Nama lengkap Budianto Kusuma Alama -> [User_A]");

// 2. Check Address
assert(anonymizedTurns[0].content.includes("[REDACTED_ADDRESS]"), "Alamat rumah harus disensor");
assert(!anonymizedTurns[0].content.includes("kampung durian runtuh"), "Nama jalan/kampung tidak boleh bocor");
console.log("  [✓] Cek 2: Alamat rumah fisik tersensor bersih");

// 3. Check Terminal Prompt
assert(anonymizedTurns[0].content.includes("[user]@[host]:~/[sandbox_path]$"), "Terminal shell prompt harus disamarkan");
assert(!anonymizedTurns[0].content.includes("dracraaah@midn8"), "Username dan hostname lokal tidak boleh bocor");
assert(!anonymizedTurns[0].content.includes("CTFdScraper"), "Struktur path direktori lokal tidak boleh bocor");
console.log("  [✓] Cek 3: Terminal shell CTF & home path tersamarkan rapi");

// 4. Check GDB Zero False Positive
assert(anonymizedTurns[1].content.includes('&setcontext → alamat fungsi setcontext'), "Istilah komputasi 'alamat fungsi setcontext' TIDAK BOLEH disensor!");
assert(!anonymizedTurns[1].content.includes('alamat di [REDACTED_ADDRESS] setcontext'), "Zero false positive pada perintah GDB");
console.log("  [✓] Cek 4: Zero False Positive pada analisis teknis GDB & assembly");

// 5. Check Algebraic Table Residuals
assert(!anonymizedTurns[1].content.includes("18.575.000"), "Angka sisa cicilan 18.575.000 TIDAK BOLEH bocor!");
assert(!anonymizedTurns[1].content.includes("20.000.000"), "Angka sisa cicilan 20.000.000 TIDAK BOLEH bocor!");
assert(!anonymizedTurns[1].content.includes(".000\t"), "Tidak boleh ada ekor .000 yang menggantung di tabel!");
assert(!anonymizedTurns[1].content.includes(".000 "), "Tidak boleh ada ekor .000 menggantung!");
console.log("  [✓] Cek 5: Kolom sisa cicilan tabel (18.575.000 & 20.000.000) dan ekor .000 tertutup rapat!");

// 6. Check Medical Generic Expansion
assert(!anonymizedTurns[1].content.toLowerCase().includes("escitalopram"), "Zat kimia generik escitalopram HARUS ikut tersensor!");
assert(!anonymizedTurns[1].content.includes("Lexapro 20mg"), "Merk Lexapro harus tersensor!");
console.log("  [✓] Cek 6: Zat generik escitalopram tersensor otomatis via medical mapping!");

// 7. Check Market Statistics Preserved
assert(anonymizedTurns[1].content.includes("Rp25,91 juta"), "Data survei Indeed Rp25,91 juta harus tetap utuh");
assert(anonymizedTurns[1].content.includes("Rp26,1 juta"), "Data survei Glassdoor Rp26,1 juta harus tetap utuh");
assert(anonymizedTurns[1].content.includes("Rp402,7 juta"), "Data survei Levels.fyi Rp402,7 juta harus tetap utuh");
console.log("  [✓] Cek 7: Data pasar industri (Indeed, Glassdoor, Levels.fyi) 100% UTUH!");

console.log("\n================================================================================");
console.log("   HASIL AUDIT MUTLAK: 7 DARI 7 PENGUJIAN LULUS SEMPURNA TANPA CACAT!");
console.log("================================================================================");
