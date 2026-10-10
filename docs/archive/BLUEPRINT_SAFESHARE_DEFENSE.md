# Cetak Biru Arsitektur & Riset Teknis: SafeShare-AI
## Pertahanan Privasi Konteks AI Klien: Zero-Knowledge Enclave, Sanitasi Kontekstual, & Penanganan Kebocoran Rekonstruksi Aljabar

**Target Luaran Riset:** Publikasi Open-Source Tool di **Black Hat Asia 2027 Arsenal** & Paper Akademis / Skripsi  
**Penyusun:** Tim Riset Keamanan Konteks AI  
**Tanggal Dokumen:** September 2026  
**Status Proyek:** Prototipe Aktif (Chrome & Firefox Extension + Cloudflare Global Edge Worker + D1 Database + Evaluasi Model DistilBERT di NVIDIA RTX 4060)

---

## 1. Executive Summary & Identitas Proyek

SafeShare-AI adalah sistem pertahanan privasi sisi klien (*client-side privacy guard*) yang dirancang untuk mencegah paparan data sensitif (PII, PHI, kredensial korporat, dan informasi finansial) saat pengguna berinteraksi dengan platform Large Language Model (ChatGPT, Claude, DeepSeek) maupun saat membagikan tautan percakapan (*shared AI chat links*).

Proyek ini merupakan pilar defensif dari riset monorepo **AI Context Security**, berdampingan dengan pilar ofensif **AgentBleed** (fuzzer kebocoran memori multi-tenant agent):

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   AI CONTEXT BOUNDARY SECURITY                         │
├───────────────────────────────────┬────────────────────────────────────┤
│   Track 1: AgentBleed (OFENSIF)   │    Track 2: SafeShare (DEFENSIF)   │
│   • Target: Black Hat Arsenal     │    • Target: DEF CON Labs / Paper  │
│   • Fuzzer kebocoran memori agent │    • Browser extension zero-knowl. │
│   • Multi-tenant vector store     │    • Post-decryption enclave       │
│   • Lokasi: /agentbleed/          │    • Lokasi: /safeshare/           │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 2. Problem Statement: Dua Tembok Privasi Obrolan AI (2023–2026)

### 2.1 Tembok Pertama: Transport & Search Engine Indexing (Googlebot Crawling)
Sepanjang 2023–2026, hampir seluruh vendor AI komersial terkemuka (Google Bard/Gemini, OpenAI ChatGPT, xAI Grok, Anthropic Claude, DeepSeek) berulang kali mengalami insiden di mana fitur *"Share Link"* menghasilkan halaman HTML publik yang diindeks oleh mesin pencari (Google, Bing, DuckDuckGo):
* **Penyebab:** Tautan yang dibagikan secara arsitektural adalah URL publik tanpa otentikasi (*unauthenticated public URL*).
* **Solusi Reaktif Vendor:** Vendor hanya memasang tag `<meta name="robots" content="noindex">` setelah insiden terjadi. Namun tag `noindex` hanya mencegah *listing* mesin pencari, tetapi **tidak mengenkripsi data**. Siapapun atau bot perayap independen yang memegang URL tetap dapat membaca, menyalin, dan mengarsipkan dokumen secara bebas.

### 2.2 Tembok Kedua: Post-Decryption Exfiltration & Algebraic Inversion Leaks
Ketika solusi enkripsi *Zero-Knowledge* diterapkan (data dienkripsi di klien dan didekripsi di browser penerima), muncul ancaman baru di titik konsumsi:
* **The Analog Hole & Clipboard Stealer:** Teks yang didekripsi di HTML DOM telanjang bebas disalin (`Ctrl+C`), diinspeksi via DevTools, atau disadap malware lokal melalui clipboard sistem operasi.
* **The Algebraic Inversion Attack:** Jika angka sensitif (misal: gaji asli) disensor menjadi `[REDACTED]`, asisten AI sering kali melakukan kalkulasi matematika turunan di jawabannya (misal: menghitung persentase tabungan, akumulasi tahunan, atau sisa hutang). Penyerang cukup membalikkan perhitungan aljabar sederhana untuk merekonstruksi kembali angka asli korban secara deterministik.

---

## 3. Arsitektur Pertahanan SafeShare-AI Saat Ini

SafeShare-AI mengimplementasikan **6 lapisan pertahanan berlapis (*Defense-in-Depth*)**:

```text
[Input Percakapan AI]
         │
         ├──► [Tier 1: Heuristics Scanner] (<2ms, deterministic regex)
         │        └── NIK KTP, Kartu Kredit, API Key, Terminal Prompt, Password DB
         │
         ├──► [Tier 2: Contextual Integrity Model] (DistilBERT Multilingual Fine-Tuned)
         │        └── Membedakan data personal vs data publik/benchmark (Indeed/BPS)
         │
         ├──► [Tier 3: Canonical Equivalence & Algebraic Sweeper]
         │        └── Menyamarkan angka turunan, persentase, midpoint, dan residual cashflow
         │
         ├──► [Tier 4: Zero-Knowledge Client Cryptography] (WebCrypto AES-256-GCM)
         │        └── Kunci enkripsi ditaruh eksklusif di URI Fragment (#key) RFC 3986
         │
         ├──► [Tier 5: Cloudflare Global Edge & D1 Serverless Storage]
         │        └── 0% Laptop Dependency, Ephemeral Auto-Purge, Single-Use Burn Option
         │
         └──► [Tier 6: Post-Decryption Enclave (Sisi Penerima)]
                  ├── Anti-Copy Honeypot Decoy (Tukar Ctrl+C dengan AB-CANARY Token)
                  ├── Steganografi Forensik (Traitor Tracing via Zero-Width Unicode HMAC)
                  └── Active Tamper Guard (Hapus #key & kunci permanen saat F12 terdeteksi)
```

### Rincian Spesifikasi Komponen:
1. **Tier 1 (Heuristics):** Mendeteksi pola deterministik:
   * NIK KTP Indonesia (16 digit valid).
   * Nomor Kartu Kredit (verifikasi algoritma Luhn).
   * API Secret Keys (OpenAI `sk-proj-`, GitHub `ghp_`, AWS `AKIA`, JWT tokens).
   * Database Credentials (`postgresql://user:pass@host:port/db`).
   * Shell Prompts (Zsh Powerline `@user `, Kali Linux `┌──(user㉿host)`, macOS `user@host ~ %`, Windows PowerShell `PS C:\Users\user>`).
   * Output identitas sistem: `$ whoami`, `$ id`, commit Git author, dan komentar SSH key.
2. **Tier 2 (AI Kontekstual):** Model `distilbert-base-multilingual-cased` yang dilatih khusus dengan dataset kontras 62.000 sampel pada GPU RTX 4060 (FP16). Membedakan kalimat orang pertama/kedua (*"gaji saya"*, *"gaji Anda"*) dari kalimat publik (*"rata-rata gaji di Jakarta"*).
3. **Tier 3 (Pseudonimizer & Aljabar):** Menghitung nilai turunan matematika dari angka finansial dasar (kenaikan $15\%$, $20\%$, nilai tengah rentang, sisa cicilan kpr) dan menggantinya dengan placeholder seragam (`[REDACTED_PROJECTED_SALARY]`, `[REDACTED_REMAINDER_CASHFLOW]`).
4. **Tier 4 (Enkripsi ZK):** WebCrypto SubtleCrypto AES-256-GCM dengan 96-bit random IV. Kunci rahasia diekspor ke URL hash (`#key`), tidak pernah terkirim ke server mana pun di internet.
5. **Tier 5 (Edge Storage):** Cloudflare Worker + Cloudflare D1 SQL database (`safeshare-relay.bleedguard.workers.dev`). Mendukung masa aktif 24 jam s.d. 7 hari, serta opsi *Atomic Burn-After-Reading* (penghancuran instan setelah 1 kali baca).
6. **Tier 6 (Enclave):**
   * *Forensic Watermarking:* Menyisipkan karakter *Zero-Width Unicode* (`\uFEFF`, `\u200B`, `\u200C`, `\u200D`) berisi `HMAC-SHA256(recipient_id + session_id + timestamp, master_key)`. Jika teks difoto atau diketik ulang ke internet, pengirim bisa melacak siapa penerima yang membocorkannya via CLI decoder.
   * *Anti-Tamper Lockout:* Jika F12 ditekan, `#key` di address bar dihapus instan via `history.replaceState`, memori RAM dinolkan, dan sinyal darurat `/api/revoke/:id` memusnahkan link dari database global.

---

## 4. Bedah Kasus Kegagalan Nyata (Case Study: "De Jembras Car Savings Failure")

Berikut adalah hasil pengujian nyata (*real-world test*) yang mengekspos batas limitasi sistem SafeShare saat ini:

### 4.1 Input Percakapan Pengguna:
```text
[USER]:
name : de jembras
NIM : 3002455595

my salary is Rp 3.000.000 and i would like to safe some my salary to buy cars in indonesia
```

### 4.2 Respons Asisten AI (ChatGPT) Setelah Melalui SafeShare:
```text
[ASSISTANT]:
Sure. With a [REDACTED_FINANCIAL_1]/month salary, you can start saving for a car, but the target should be realistic and you should avoid putting your entire salary toward the car.

Suggested monthly budget
Category	Amount	%
🏦 Car savings	[REDACTED_SALARY_INCREMENT]	30%
🍚 Food & daily needs	[REDACTED_SALARY_INCREMENT]	40%
🚆 Transport	[REDACTED_SALARY_INCREMENT]	15%
📱 Phone/internet & personal	[REDACTED_SALARY_INCREMENT]	10%
🛟 Emergency/other	[REDACTED_SALARY_INCREMENT]	5%
Total	[REDACTED_FINANCIAL_1]	100%

If you save [REDACTED_SALARY_INCREMENT]/month:

1 year → Rp10.8 million

2 years → Rp21.6 million

3 years → Rp32.[REDACTED_PROJECTED_SALARY]

5 years → Rp54 million

For a car in Indonesia, remember that the purchase price isn't the only cost...
```

### 4.3 Analisis 5 Titik Kegagalan Fatal:

1. **Kegagalan Ekstraksi Nama (*Name Format Bypass*):**
   * String: `name : de jembras`
   * Pola regex hanya mengenali kalimat alami (`nama saya`, `my name is`, `i am`). Format formulir dengan titik dua `name :` gagal ditangkap, sehingga nama asli korban bocor total tanpa disensor.
2. **Entitas Domain Tidak Dikenal (*NIM Leak*):**
   * String: `NIM : 3002455595` (Nomor Induk Mahasiswa 10 digit).
   * Heuristik hanya memiliki aturan NIK KTP 16 digit. Angka identitas akademik mahasiswa lolos 100%.
3. **Kebocoran Rekonstruksi Aljabar Multitahun (*The Multi-Year Algebraic Leak*):**
   * Di teks tertulis: Alokasi mobil = `30%`.
   * Di bawah tertulis akumulasi:
     * `1 year → Rp10.8 million`
     * `2 years → Rp21.6 million`
     * `5 years → Rp54 million`
   * **Rumus Inversi Penyerang:**
     $$\text{Tabungan bulanan} = \frac{\text{Rp } 10.800.000}{12 \text{ bulan}} = \text{Rp } 900.000$$
     $$\text{Gaji Pokok Asli} = \frac{\text{Rp } 900.000}{30\%} = \mathbf{Rp\ 3.000.000 \text{ (Tepat Rp 3 Juta!)}}$$
   * Angka akumulasi tahunan (`10.8 million`, `21.6 million`, `54 million`) **bocor mentah-mentah**, membuat sensor pada gaji pokok menjadi tidak berguna.
4. **Tabrakan Pemotongan Substring (*Substring Slicing Collision / Text Mangling*):**
   * String asli asisten: `3 years → Rp32.4 million` ($3 \times 10.8\text{M}$).
   * Mesin regex mencari variasi aljabar dan secara salah memotong desimal `.4 million`, sehingga menghasilkan teks rusak: `Rp32.[REDACTED_PROJECTED_SALARY]`.
5. **Kekacauan Semantik Label (*Semantic Mislabeling*):**
   * Seluruh alokasi anggaran (makan 40%, transport 15%, pulsa 10%) semuanya ditempeli label `[REDACTED_SALARY_INCREMENT]`, padahal ini adalah pos anggaran (*budget breakdown*), bukan kenaikan gaji.

---

## 5. Akar Masalah Fundamental (Architectural Bottlenecks)

### 5.1 Jebakan "Whack-A-Mole" pada Pendekatan Berbasis Aturan (Rule-Based Regex)
Pendekatan berbasis regex dan daftar kata kunci (*heuristics*) memiliki kelemahan inheren: setiap kali aturan baru ditambahkan (misal: NIM, gelar, format titik dua), pengguna atau LLM selalu menemukan format sintaksis baru yang luput dari filter.

### 5.2 Kompleksitas Eksponensial Inferensi Matematika LLM
LLM bersifat generatif dan mampu menghasilkan ribuan variasi aljabar:
* Timeline proyeksi: 1 tahun, 2 tahun, 3 tahun, 5 tahun, 10 tahun.
* Pembagian anggaran: $5\%, 10\%, 15\%, 20\%, 30\%, 40\%$.
* Perhitungan bunga majemuk, estimasi DP cicilan, biaya pajak/asuransi.  
Mustahil mengantisipasi seluruh variasi angka turunan ini hanya dengan membuat daftar *hardcoded array* persentase.

### 5.3 Dilema Ukuran Model: ONNX 129 MB vs Ekstensi Ringan 30 KB
* **Jika Memakai Model Deep Learning Penuh di Ekstensi:** Model ONNX DistilBERT terkuantisasi berukuran ~129 MB. Ukuran ini melampaui batas toko ekstensi (Chrome Web Store / Mozilla AMO), memakan ratusan MB RAM browser klien, dan menyebabkan latensi tinggi di perangkat tanpa GPU.
* **Jika Hanya Memakai Script JavaScript Ringan (~30 KB):** Sangat ringan dan instan, tetapi rapuh terhadap variasi bahasa santai dan inferensi aljabar tingkat lanjut.

---

## 6. Daftar Pertanyaan Riset Tingkat Lanjut untuk Kolaborasi / Konsultasi AI

Gunakan pertanyaan-pertanyaan ini saat meminta saran kepada AI penalaran tingkat tinggi (Claude 3.7 Sonnet, OpenAI o1, DeepSeek-R1) atau pakar keamanan siber:

### Pertanyaan 1: Paradigma Penanganan Kebocoran Aljabar (Algebraic Inversion Defense)
> *"Bagaimana arsitektur terbaik untuk menggagalkan Algebraic Reconstruction Attack pada percakapan AI tanpa merusak keterbacaan percakapan? Apakah ada metode yang lebih elegan daripada regex hardcoded persentase, misalnya menggunakan Symbolic Math Parser, Abstract Syntax Tree (AST) evaluator, Semantic Number Clustering, atau Numerical Differential Privacy perturbation?"*

### Pertanyaan 2: Solusi Klasifikasi Entitas In-Browser Ultra-Ringan (< 5 MB)
> *"Bagaimana cara memecahkan masalah identifikasi entitas sensitif kontekstual (PII/PHI) yang fleksibel di sisi browser pengguna tanpa harus mengunduh model neural network berukuran 129 MB? Apakah ada pendekatan arsitektur model ultra-ringan (misal berbasis WebAssembly, TinyBERT terdistilasi khusus, bloom filters, atau automata-based semantic graph) yang ukurannya di bawah 5 MB tetapi tetap memiliki akurasi kontekstual tinggi?"*

### Pertanyaan 3: Standar Penilaian Seleksi Black Hat Arsenal
> *"Dari sudut pandang Reviewer Black Hat Arsenal / DEF CON Demo Labs, inovasi mana yang memiliki nilai ilmiah dan praktis tertinggi untuk dipresentasikan:
> a. Algoritma matematis sanitasi aljabar deterministik?
> b. Kriptografi Zero-Knowledge & forensic traitor-tracing enclave di browser?
> c. Solusi end-to-end yang menggabungkan audit ofensif (AgentBleed) dan mitigasi defensif (SafeShare)?"*

### Pertanyaan 4: Rujukan State-of-the-Art (SOTA) & Makalah Ilmiah Relevan
> *"Apakah ada makalah riset siber terbaru (2024–2026, IEEE S&P, USENIX Security, ACM CCS, NDSS, atau arXiv) yang secara spesifik meneliti 'Inference Attacks on Redacted Text' atau 'Mathematical Data Reconstruction from LLM Outputs' yang dapat kami jadikan landasan teori akademis?"*

---

## 7. Data Spesifikasi Teknis & Repositori

| Parameter | Spesifikasi Lingkungan Pengujian |
| :--- | :--- |
| **Sistem Operasi** | Arch Linux x86_64 (Linux Kernel 6.13 / Wayland Hyprland) |
| **Perangkat Keras Pelatihan** | NVIDIA GeForce RTX 4060 Laptop GPU (8GB GDDR6 VRAM, CUDA 12.4, FP16) |
| **Model Dasar Klasifikasi** | `distilbert/distilbert-base-multilingual-cased` |
| **Dataset Pelatihan Terkini** | 62.000 sampel kontras (Indonesian & English multi-domain) |
| **Metrik Evaluasi Test Set** | Precision: 1.0, Recall: 1.0, F1-Score: 1.0, Test Loss: 0.00032 |
| **Ekspor Kuantisasi** | ONNX Runtime INT8 (`model_quantized.onnx`, 128.89 MB, latensi inferensi 6.53 ms) |
| **Infrastruktur Relay Global** | Cloudflare Workers Serverless (300+ kota) + Cloudflare D1 Database |
| **Standar Kriptografi** | W3C SubtleCrypto AES-256-GCM, RFC 3986 URI Hash Fragment |
| **Repositori Kode** | Monorepo Git: `ai-context-security` (`/safeshare/` & `/agentbleed/`) |

---

### Template Teks Pembuka untuk Diskusi dengan AI Lain:

Salin teks berikut sebagai pembuka prompt saat berkonsultasi dengan AI lain:

```text
Halo, saya sedang mengembangkan riset keamanan siber dan perkakas pertahanan privasi konteks AI bernama "SafeShare-AI" yang ditargetkan untuk publikasi di Black Hat Asia 2027 Arsenal dan paper akademis.

Kami telah membangun arsitektur 6-tier (Heuristics, Contextual AI DistilBERT di RTX 4060, Algebraic Sweeper, Zero-Knowledge AES-GCM, Cloudflare Edge D1, dan Post-Decryption Enclave). Namun pada pengujian kasus nyata, kami menemukan kegagalan fatal berupa "Algebraic Inversion Leak" di mana LLM membeberkan angka akumulasi multi-tahun yang memungkinkan penyerang menghitung mundur gaji pokok asli yang sudah disensor, serta kegagalan format nama/NIM.

Berikut adalah dokumen arsitektur teknis lengkap kami:
[TEMPELKAN ISI FILE BLUEPRINT_SAFESHARE_DEFENSE.md DI SINI]

Tolong berikan analisis mendalam, kritik arsitektur, dan rekomendasi metodologi yang lebih superior untuk memecahkan masalah ini!
```
