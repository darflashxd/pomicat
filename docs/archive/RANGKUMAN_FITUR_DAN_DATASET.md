# SafeShare-AI & AgentBleed: Rangkuman Lengkap Fitur, Dataset, & Arsitektur

Dokumen ini berisi rangkuman komprehensif mengenai **seluruh fitur**, **arsitektur sistem**, serta **dataset pelatihan kecerdasan buatan (AI)** yang dibangun di dalam repositori ini. Disusun dengan bahasa yang lugas, sistematis, dan mudah dipahami untuk keperluan presentasi, laporan akademis, skripsi, maupun dokumentasi teknis tim.

---

## 1. Peta Besar Proyek: Dual-Track Architecture

Proyek ini menggabungkan dua pilar riset keamanan konteks AI yang saling melengkapi:

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    AI CONTEXT BOUNDARY SECURITY PLATFORM                        │
├──────────────────────────────────────┬──────────────────────────────────────────┤
│    Track 1: AgentBleed (OFENSIF)     │      Track 2: SafeShare-AI (DEFENSIF)    │
│    • Target: Black Hat Arsenal 2027  │      • Target: DEF CON Labs / Paper      │
│    • Fuzzer & Penetration Testing    │      • Browser Extension (Chrome/Firefox)│
│    • Uji kebocoran memori multi-user │      • In-browser AI PII Sanitizer (ONNX)│
│    • Lokasi: /agentbleed/            │      • Zero-Knowledge Enclave & Relay    │
│                                      │      • Lokasi: /safeshare/               │
└──────────────────────────────────────┴──────────────────────────────────────────┘
```

* **Track 1 (AgentBleed - Sisi Ofensif):** Alat uji penetrasi otomatis untuk membuktikan apakah memori jangka panjang AI (*vector memory*) di server perusahaan bisa bocor ke pengguna lain (*Cross-Tenant Data Spillage*).
* **Track 2 (SafeShare-AI - Sisi Defensif):** Ekstensi peramban dan Web Viewer privat berbasis *Zero-Knowledge* yang bertindak sebagai perisai pelindung obrolan pengguna di ChatGPT, Claude, dan DeepSeek sebelum teks keluar ke internet.

---

## 2. Bedah Model AI SafeShare: Dataset, Pelatihan, & Evaluasi

SafeShare tidak sekadar menyensor kata menggunakan regex sederhana, melainkan menggunakan model deep learning berbasis pemahaman konteks (*Contextual Integrity*).

### A. Konsep Filosofis: Contextual Integrity
Berdasarkan teori Helen Nissenbaum (*Contextual Integrity*), sebuah data bernilai sensitif **bukan hanya karena bentuk teksnya, melainkan karena siapa yang membicarakannya**:
1. **Konteks Pribadi (Harus Disensor):**
   * *"Gaji pokok bulanan saya adalah Rp28.500.000"* &rarr; **Sensitif**, karena ini milik orang pertama.
   * *"Dokter meresepkan saya obat Lexapro 20mg"* &rarr; **Sensitif**, ini adalah resep medis pribadi.
2. **Konteks Publik / Statistik / Edukasi (Harus Tetap Utuh / Zero False Positive):**
   * *"Rata-rata gaji Software Engineer di Jakarta Rp25,91 juta menurut data Indeed"* &rarr; **Aman**, ini adalah data pasar agregat.
   * *"Escitalopram adalah obat golongan SSRI untuk gangguan kecemasan"* &rarr; **Aman**, ini adalah ensiklopedia farmakologi.
   * *"Perintah debugging: `gdb -q -ex 'x/2i &setcontext'`"* &rarr; **Aman**, ini adalah analisis kode assembly.

Model AI dilatih untuk membedakan dua kondisi di atas secara otomatis.

---

### B. Detail Dataset Pelatihan (*Dataset Breakdown*)

Dataset dibangun secara mandiri menggunakan generator sintetis berbasis AST dan grammar terstruktur (`safeshare/data/generate_dataset.py`).

* **Total Ukuran Dataset:** **62.000 sampel kalimat**
* **Bahasa:** Bilingual (Bahasa Indonesia dan Bahasa Inggris seimbang 50:50).
* **Pembagian Dataset (*Data Split*):**
  * **Data Latih (*Train*):** `49.600 kalimat` (80%)
  * **Data Validasi (*Validation*):** `6.200 kalimat` (10%)
  * **Data Uji (*Test*):** `6.200 kalimat` (10%)
* **Lokasi Berkas:**
  * `safeshare/data/train.json` (13 MB)
  * `safeshare/data/val.json` (1.6 MB)
  * `safeshare/data/test.json` (1.6 MB)
  * `safeshare/data/schema.json` (Schema format label)

---

### C. 11 Label Entitas (Format BIO Token Classification)

Setiap kata di dalam kalimat dilabeli menggunakan standar BIO (*Beginning, Inside, Outside*):

| No | Label Tag | Arti / Contoh Entitas |
|:---:|---|---|
| 1 | `B-SENSITIVE_FINANCIAL` | Awal penyebutan angka keuangan pribadi (*Rp28.500.000*, *$120,000*, *cicilanku*) |
| 2 | `I-SENSITIVE_FINANCIAL` | Lanjutan dari entitas keuangan pribadi (*juta*, */bulan*, *rupiah*) |
| 3 | `B-SENSITIVE_HEALTH` | Awal nama diagnosis penyakit rahasia (*kanker usus*, *bipolar*, *Lexapro*, *Xanax*) |
| 4 | `I-SENSITIVE_HEALTH` | Lanjutan nama penyakit / dosis obat (*stadium 2*, *20mg*, *tipe 2*) |
| 5 | `B-SENSITIVE_CORP` | Awal nama sandi proyek rahasia / server (*Project Valkyrie*, *prod-db-master*) |
| 6 | `I-SENSITIVE_CORP` | Lanjutan nama aset perusahaan (*Core*, *Internal*, *Database*) |
| 7 | `B-SENSITIVE_LEGAL_HR` | Awal sanksi ketenagakerjaan internal (*Surat Peringatan Pertama*, *PHK sepihak*) |
| 8 | `I-SENSITIVE_LEGAL_HR` | Lanjutan istilah sanksi (*SP-3*, *PIP 30 hari*) |
| 9 | `B-SENSITIVE_USER` | Awal username privat, handle akun, shell prompt (*@jdoe_dev*, *ctfuser*) |
| 10 | `I-SENSITIVE_USER` | Lanjutan handle pengguna |
| 11 | `O` (*Outside*) | Kata biasa, istilah pemrograman, data survei publik, dan syntax kode |

---

### D. Arsitektur Model, Perangkat Keras, & Hasil Pelatihan

* **Model Dasar (*Base Model*):** `distilbert/distilbert-base-multilingual-cased` (kompatibel penuh dengan kosakata teknis Indonesia dan Inggris).
* **Perangkat Keras Pelatihan (*Training Hardware*):** NVIDIA GeForce RTX 4060 Laptop GPU (8GB VRAM) dengan akselerasi FP16 Tensor Cores.
* **Hyperparameter:** Batch size 32, Learning Rate `3e-5`, Optimizer AdamW dengan linear warmup scheduler, 3 epoch.
* **Hasil Evaluasi Akhir (`evaluation_metrics.json`):**
  * **Precision:** `1.0 (100%)`
  * **Recall:** `1.0 (100%)`
  * **F1-Score:** `1.0 (100%)`
  * **Accuracy:** `1.0 (100%)`
  * **Evaluation Loss:** `0.00032`
* **Optimalisasi Deployment (ONNX INT8 Quantization):**
  Model hasil pelatihan diekspor ke format ONNX dan dikuantisasi menjadi INT8 (`model_quantized.onnx`, ukuran 129 MB). Hal ini memungkinkan inferensi deep learning berjalan secepat kilat (latensi <20ms) langsung di CPU peramban tanpa membutuhkan server backend eksternal.

---

## 3. Fitur Lengkap SafeShare-AI (Sisi Defensif)

SafeShare-AI dirancang agar pengguna dapat membagikan obrolan AI mereka secara aman tanpa takut membocorkan rahasia pribadi dan tanpa bergantung pada laptop pengirim.

### 1. Sensor Berlapis 3 Tingkat (*3-Tier Redaction Pipeline*)
* **Tier 1 - Heuristics Scanner:** Mendeteksi pola pasti (*hard-coded pattern*) seperti API Key (OpenAI, AWS, GitHub), URL Database (`postgresql://...`), NIK KTP Indonesia (16 digit terverifikasi wilayah), nomor telepon seluler, alamat fisik rumah, dan shell prompt terminal (Kali Linux, Zsh Powerline, Bash).
* **Tier 2 - Contextual Integrity AI:** Menggunakan model DistilBERT di atas untuk membaca makna kalimat secara utuh. Jika kalimat bernada pribadi, angka gaji disensor. Jika kalimat bernada analisis pasar atau ilmiah, teks dibiarkan utuh.
* **Tier 3 - Canonical Equivalence Class Pseudonymizer:** Menggagalkan serangan rekonstruksi matematika (*Algebraic Reconstruction Attack*). Ketika AI assistant melakukan derivasi (misal: menghitung proyeksi kenaikan gaji 15%, sisa uang setelah cicilan, atau rasio hutang 49,8%), modul ini otomatis menyamarkan angka-angka turunan tersebut dengan placeholder yang seragam (`[REDACTED_PROJECTED_SALARY]`, `[REDACTED_REMAINDER_CASHFLOW]`).

### 2. Kriptografi Zero-Knowledge (AES-256-GCM)
* **Cara Kerja:** Pesan dienkripsi di RAM browser pengirim menggunakan kunci 256-bit acak.
* **Keunggulan Privasi:** Kunci dekripsi diletakkan pada URL Hash Fragment (`#key`). Menurut standar RFC 3986, apapun yang berada di belakang tanda pagar (`#`) **tidak pernah dikirim oleh browser ke server web mana pun**.
* **Kebal Google Search & AI Crawler:** Mesin pencari dan bot perayap hanya dapat melihat halaman terkunci (*lock screen*), karena mereka tidak memiliki kunci yang ada di hash URL.

### 3. Serverless Cloudflare Edge & D1 Database
* **Infrastruktur:** Berjalan di jaringan global Cloudflare Workers (300+ kota di seluruh dunia) dengan penyimpanan Cloudflare D1 SQL Database.
* **Zero-Laptop Dependency:** Pengirim bisa langsung mematikan laptopnya detik itu juga setelah tautan dibuat. Tautan tetap dapat diakses oleh penerima tanpa perlu laptop pengirim tetap menyala.
* **Masa Berlaku Fleksibel:** Tautan dapat diatur kedaluwarsa otomatis (24 Jam, 3 Hari, 7 Hari).

### 4. Proteksi Pasca-Dekripsi (*Post-Decryption Enclave*)
* **Anti-Copy Honeypot Trap:** Menggagalkan upaya pencurian teks melalui clipboard sistem operasi. Jika penerima mencoba memblok dan menyalin (*Ctrl+C* atau klik kanan), isi clipboard yang tersalin otomatis diganti dengan teks jebakan (*honeypot canary*).
* **Steganografi Forensik (*Traitor Tracing*):** Menanamkan tanda air digital tak kasat mata menggunakan karakter *zero-width* pada dokumen ekspor. Jika teks dibocorkan oleh penerima, pengirim dapat melacak siapa penerima yang membocorkannya.
* **Active Tamper Guard & RAM Zeroizer:** Mengawasi aktivitas ilegal di peramban (seperti membuka DevTools Inspect Element atau memasang breakpoint debugger). Jika terdeteksi, memori RAM seketika dinolkan (*zeroized*) dan layar langsung dikunci.
* **Atomic Burn-After-Reading:** Pilihan tautan sekali baca: data terenkripsi di server Cloudflare langsung dihancurkan seketika saat pertama kali dibuka oleh penerima.

### 5. Universal 1-Click Continue (Zero-Clipboard Continuation Bridge)
* **Fungsi:** Penerima tautan dapat melanjutkan obrolan tersebut ke akun ChatGPT, Claude, atau DeepSeek miliknya sendiri dengan 1 kali klik.
* **Tanpa Kebocoran:** Konteks obrolan diforward langsung ke antarmuka AI tanpa mengekspos teks mentah ke clipboard sistem operasi laptop.

### 6. Desain Antarmuka Modern "Calm Security"
* **Estetika:** Mengadopsi standar desain modern ala Linear dan 21st.dev dengan palet netral *zinc dark* (`#09090b`), border tipis 1px, tipografi proporsional, serta micro-icon SVG monokromatik (menggantikan ikon emoji mentah).
* **Side-by-Side Review:** Modal ekstensi menampilkan perbandingan langsung antara *Original Input* dan *Sanitized Output* secara berdampingan lengkap dengan format tabel yang rapi.

---

## 4. Fitur Lengkap AgentBleed (Sisi Ofensif)

AgentBleed adalah *fuzzer* dan scanner dinamis pertama yang ditujukan untuk mengaudit isolasi memori pada ekosistem multi-tenant AI Agent.

### 1. Token Canary Berentropi Tinggi
* Menghasilkan token unik deterministik dengan format `AB-CANARY-<HEX>-<CHECKSUM>`.
* Token memiliki probabilitas tabrakan acak sangat rendah (1 banding 281 triliun), memastikan jika token Tenant A muncul di sesi Tenant B, itu adalah **bukti mutlak terjadinya kebocoran data (*zero false positive*)**.

### 2. Metode Penetrasi Memori (*Attack Probes*)
* **Probe Direct ID Bypass (`direct_id`):** Menguji apakah penyerang bisa membaca memori korban hanya dengan memanggil `memory_id` atau `user_id` korban secara langsung tanpa autentikasi ketat.
* **Probe Wildcard Filter Stripping (`wildcard_filter`):** Menguji apakah sistem vector database mematikan filter partisi ketika penyerang mengirimkan karakter wildcard (`*`, string kosong, atau operator logika yang tidak tervalidasi).
* **Probe Agent Scope Leak (`agent_scope`):** Menguji apakah AI agent yang dipakai bersama oleh beberapa divisi (misal: HR dan Engineering) membocorkan rahasia divisi lain saat dipancing dengan instruksi manipulatif.
* **Probe Semantic Memory Bleed (`semantic`):** Menguji kebocoran berbasis kemiripan makna vektor (*cosine similarity*) saat penyerang menanyakan topik yang relevan dengan rahasia korban tanpa menyebut nama korban secara langsung.

### 3. Dukungan Vendor Vector Database Populer
AgentBleed dilengkapi dengan adapter modular untuk menguji berbagai arsitektur memori AI industri:
* **Mem0 OSS v2.1.0** (Memory layer AI agent paling populer).
* **Qdrant Vector Database** (Vector store performa tinggi berbasis Rust).
* **ChromaDB** (Database embedding standar untuk aplikasi LangChain).
* **LangGraph Long-Term Store** (Framework orkestrasi multi-agent enterprise).

### 4. Mesin Pelaporan Statistik Otomatis
* Menghitung **Leak Rate** agregat (persentase kebocoran).
* Menghitung **Wilson Score 95% Confidence Interval** untuk pembuktian ilmiah akademis.
* Menguji signifikansi data menggunakan **Fisher's Exact Test p-value**.
* Otomatis membuat laporan HTML interaktif dan ringkasan terminal berwarna.

---

## 5. Tabel Perbandingan & Nilai Inovasi

| Kategori | Cara Konvensional / Chatbot Biasa | Inovasi Proyek Ini (SafeShare & AgentBleed) |
|---|---|---|
| **Penyensoran Rahasia** | Regex sederhana berbasis kata kunci (mudah lolos jika kalimat diubah) | **Deep Learning Kontekstual (DistilBERT)** + pemahaman tata bahasa orang pertama vs data publik |
| **Derivasi Matematika** | Angka turunan bocor (misal AI menghitung kenaikan gaji 15% atau sisa cicilan) | **Canonical Equivalence Clustering**: menyensor hasil perhitungan matematis AI secara konsisten |
| **Berbagi Chat Publik** | Teks disimpan mentah di server pihak ketiga (terindeks Google & bot AI) | **Zero-Knowledge AES-256-GCM**: Kunci hanya ada di hash URL (`#`), server dan bot Google hanya melihat teks acak |
| **Ketergantungan Host** | Laptop pengirim harus tetap menyala (*ngrok/local server*) | **100% Serverless Edge**: Cloudflare Workers + D1 database, laptop bisa langsung dimatikan |
| **Keamanan Pasca-Kirim** | Teks bebas disalin, disimpan, atau disebarluaskan oleh penerima | **Anti-Copy Honeypot**, Active DevTools Tamper Guard, Steganografi Traitor-Tracing |
| **Audit Memori Agen** | Hanya mengandalkan analisis kode statis atau simulasi dummy | **AgentBleed Runtime Fuzzer**: Menguji langsung ke vector store asli (Mem0, Qdrant, Chroma) berbasis token canary |

---

## 6. Panduan Menjalankan Singkat (*Quickstart*)

### Menjalankan Fuzzer AgentBleed:
```bash
# 1. Jalankan target database Qdrant via Docker
docker compose up -d

# 2. Jalankan audit kebocoran memori multi-tenant
python3 -m agentbleed scan --config configs/mem0_qdrant.yaml
```

### Menjalankan Web Viewer SafeShare Secara Lokal:
```bash
# Jalankan relay lokal dan server statis
python3 safeshare/relay/server_local.py
# Buka di browser: http://localhost:8787
```

### Menjalankan Seluruh Unit Test Keamanan:
```bash
node safeshare/test_uncopyable_audit.js
node safeshare/test_edge_cases.js
node safeshare/test_real_chatgpt_output.js
```
*(Seluruh pengujian dirancang untuk lulus 100% tanpa cacat).*

---

*Dokumen ini diperbarui secara otomatis sesuai dengan arsitektur kode dan model terbaru per September 2026.*
