# Catatan Perjalanan Riset, Arsitektur, Evaluasi Kegagalan, & Roadmap Inovasi: SafeShare-AI

**Target Proyek:** Publikasi Tool Open-Source di **Black Hat Asia 2027 Arsenal** & Paper Akademis / Skripsi  
**Penyusun:** Tim Riset Keamanan Konteks AI  
**Tanggal Dokumen:** September 2026  
**Status Repositori:** Monorepo `ai-context-security` (`/safeshare/`)

---

## 1. Latar Belakang & Motivasi Nyata Proyek

Antara tahun 2023 hingga 2026, hampir semua platform Large Language Model (LLM) konsumen terkemuka (Google Bard/Gemini, OpenAI ChatGPT, xAI Grok, Anthropic Claude, Perplexity, DeepSeek) menyediakan fitur **"Share Conversation Link"**. 

### Masalah Fundamental:
* **Tautan Publik Tanpa Otentikasi:** Secara arsitektural, tautan percakapan yang dibagikan adalah URL publik tanpa sistem login. Mesin pencari komersial (Googlebot, Bingbot) merayapi (*crawling*) URL tersebut dari sitemap, riwayat browsing, atau tautan yang dibagikan di forum publik.
* **Kebocoran Massal:** Puluhan ribu percakapan pribadi yang memuat slip gaji, rekam medis psikiatri, NIK KTP, password database staging, dan API key terindeks bebas di Google Search dan diarsipkan permanen di Wayback Machine.
* **Respons Reaktif Vendor:** Vendor hanya memasang tag `<meta name="robots" content="noindex">` setelah insiden menjadi berita viral. Namun `noindex` hanya menghentikan pendaftaran di hasil pencarian, **bukan mengenkripsi dokumen**. Halaman tersebut tetap dapat diakses, disalin, dan di-scrape oleh siapapun yang memegang link.

**Misi Awal SafeShare-AI:**
Membangun pelindung privasi di sisi browser pengguna (*client-side extension*) yang otomatis menyensor data pribadi sebelum tautan dibagikan, serta mengenkripsi data tersebut secara *end-to-end* sehingga server perantara dan mesin pencari hanya melihat data acak yang terkunci (*server-blind*).

---

## 2. Arsitektur Teknis yang Telah Dibangun (Tier 1 s.d. Tier 6)

SafeShare-AI saat ini mengimplementasikan jalur pemrosesan 6 lapis:

```text
[Obrolan AI di ChatGPT / Claude]
               │
               ▼
[Tier 1: Heuristics Deterministic Scanner] (<2ms)
├── NIK KTP Indonesia (16 digit validasi kalender & wilayah)
├── Kartu Kredit (Verifikasi Algoritma Luhn)
├── Dokumen Resmi: NPWP, Paspor RI, BPJS Kesehatan/TK, SIM A
├── Kredensial: OpenAI Key, Stripe Secret, AWS Key, GitHub Token, JWT, Linux Shadow Hash
├── Database URI: postgresql://, mysql://, redis:// dengan password
└── Shell Prompts: Zsh Powerline (@user ), Kali Linux, macOS (%), Windows CMD/PS, Git Author, SSH Key
               │
               ▼
[Tier 2: Contextual Integrity AI (DistilBERT Fine-Tuned)]
├── Model distilbert-base-multilingual-cased dilatih di GPU RTX 4060 (FP16, 62.000 dataset)
├── Menangani gaya bahasa orang pertama ("gaji saya") dan orang kedua AI ("gaji Anda", "penghasilan kamu")
└── Membedakan data personal vs data survei pasar publik (Indeed, Glassdoor, BPS) -> Zero False Positive
               │
               ▼
[Tier 3: Canonical Equivalence & Adversary-Oracle Reconstruction Solver]
├── Universal Financial Parser: Mendukung format baku (Rp 28.500.000), desimal (15,5 juta), dan slang gaul (45 jeti)
├── Adversary-Oracle Solver Loop: Mendeteksi apakah angka-angka turunan AI bisa membalikkan rahasia
└── Span-Based Token Replacement: Mengganti token angka utuh (mencegah teks terpotong cacat)
               │
               ▼
[Tier 4: Client-Side Cryptography (AES-256-GCM)]
├── Enkripsi di memori RAM browser menggunakan WebCrypto SubtleCrypto (kunci 256-bit + 96-bit random IV)
└── Kunci dekripsi diletakkan HANYA di URL Hash Fragment (#key) RFC 3986 (Server & Googlebot buta total)
               │
               ▼
[Tier 5: Cloudflare Global Edge & D1 Database]
├── Serverless Worker berjalan di 300+ kota di dunia (0% ketergantungan laptop pengirim)
├── Penyimpanan SQL Cloudflare D1 (100k write/hari, 5M read/hari free tier)
└── Opsi kedaluwarsa fleksibel: 24 Jam, 3 Hari, 7 Hari, serta Atomic Burn-After-Reading (1x lihat langsung musnah)
               │
               ▼
[Tier 6: Post-Decryption Viewing Enclave & Traitor Tracing]
├── Native Typography Viewport: Teks tajam dengan font sistem OS, scrolling mulus, bebas teks kaku
├── Forensic Steganography: Tanda air biner tak kasat mata (Zero-Width Unicode HMAC) untuk pelacakan pembocor
└── Active Tamper Guard: Jika F12 ditekan, #key di URL dihapus instan via history.replaceState dan sesi terkunci
```

---

## 3. Bedah Kasus Nyata: Kegagalan yang Terbongkar Saat Pengujian

Sistem di atas terlihat sangat solid secara teoritis. Namun, saat diuji dengan variasi percakapan nyata yang tidak terduga, sistem mengalami **beberapa kegagalan fatal**:

---

### A. Kasus Budianto: Kebocoran Proyeksi Kenaikan Gaji (33 Juta)
* **Skenario:** Pengguna memasukkan gaji Rp 28.500.000. Asisten AI menjawab: *"Untuk gaji Anda yang saat ini Rp 28.500.000, Anda bisa meminta kenaikan 15-20% menjadi sekitar Rp 33.000.000"*.
* **Kegagalan:** Gaji awal disensor menjadi `[REDACTED_FINANCIAL_1]`. Namun angka **Rp 33.000.000 lolos tanpa disensor**.
* **Penyebab:**
  1. Filter kontekstual lama hanya mencari kata ganti orang pertama (*"gaji saya"*). Respons AI memakai kata ganti orang kedua (*"gaji Anda"*), sehingga seluruh kalimat asisten dianggap bukan rahasia pribadi.
  2. Rumus aljabar lama hanya menghitung angka eksak ($28.5\text{M} \times 1.15 = 32.775.000$). AI melakukan pembulatan manusiawi ke jutaan terdekat ($33.000.000$).
* **Dampak:** Penyerang cukup membalikkan perhitungan: $33.000.000 / 1.175 \approx \mathbf{28.500.000 \text{ Rupiah}}$. Gaji asli korban terbongkar lewat pintu belakang.

---

### B. Kasus De Jembras: Kebocoran Aljabar Multitahun & Format Form
* **Skenario:**
  ```text
  name : de jembras
  NIM : 3002455595
  my salary is Rp 3.000.000 and i would like to safe some my salary to buy cars in indonesia
  ```
* **Kegagalan yang Terjadi:**
  1. `name : de jembras` **bocor total** karena regex nama hanya mengenali kalimat alami (*"nama saya"*, *"my name is"*), gagal menangkap format formulir bertitik dua.
  2. `NIM : 3002455595` **bocor total** karena sistem hanya memiliki aturan NIK 16 digit, tidak memiliki pengenal nomor mahasiswa (NIM).
  3. **Kebocoran Akumulasi Multitahun:** Asisten AI menulis alokasi mobil $30\%$ dan merincikan timeline tabungan:  
     `1 year → Rp10.8 million`  
     `2 years → Rp21.6 million`  
     `5 years → Rp54 million`  
     Penyerang menghitung: $10.800.000 / 12 = 900.000 \to 900.000 / 30\% = \mathbf{Rp\ 3.000.000}$. Gaji asli terbongkar persis.
  4. **Cacat Pemotongan String (*Substring Mangling*):** Pada kalimat `3 years → Rp32.4 million`, regex aljabar memotong parsial angka desimal `.4 million`, menyisakan teks rusak: `Rp32.[REDACTED_PROJECTED_SALARY]`.
  5. **Salah Label:** Seluruh pos anggaran bulanan (makan 40%, transport 15%) ditempeli label `[REDACTED_SALARY_INCREMENT]`, merusak konteks bahasa.

---

### C. Kasus Ekstrem V3: Kripto, Slang, Dokumen Negara, & False Positive
Saat diuji dengan kasus ekstrem:
* **NPWP (`01.234.567.8-901.000`) & Paspor (`C1234567`):** Awalnya lolos total.
* **12-Word BIP-39 Seed Phrase:** Frasa pemulihan dompet kripto (*witch collapse practice...*) lolos karena dikira kalimat bahasa Inggris biasa.
* **Slang *"45 jeti nett"*:** Angka 45 juta lolos karena sistem hanya mengenal kata *"juta"* dan *"jt"*.
* **Biomarker Lab Medis Disangka Uang:** Angka hasil tes virus HIV `45.000 copies/mL` sempat keliru disensor menjadi `[REDACTED_FINANCIAL_19] copies/mL`.
* **Over-Redaction di Kubernetes YAML:** Konfigurasi Linux `runAsUser: 1000` dan IP CIDR `10.244.0.15/32` sempat dibabat habis oleh solver aljabar dan diubah menjadi label anggaran belanja `[REDACTED_BUDGET_ALLOCATION]`.

---

## 4. Bedah Kritis: Mengapa Fitur Anti-Copy (Perangkap Ctrl+C) Dihapus Total?

Pada versi prototipe awal, kami sempat memasang fitur pencegatan tombol `Ctrl+C` dan penggantian teks dengan honeypot `AB-CANARY-EXFILTRATION-TRAP`.

### Mengapa Fitur Ini Adalah "Security Theater" & Kontradiksi Logis?
1. **Kontradiksi Langsung dengan Nilai Produk:**
   * Di satu sisi, sistem melarang pengguna menekan `Ctrl+C`.
   * Di sisi lain, sistem menyediakan tombol resmi **"Continue in ChatGPT / Claude"** yang menyalin teks percakapan bersih ke clipboard agar bisa dilanjutkan di tab baru.
   * **Hasilnya:** Pengguna cukup mengklik tombol *"Continue"*, lalu mem-paste teks tersebut ke Notepad. Pertahanan anti-copy gugur seketika dalam 1 detik.
2. **Merusak Pengalaman Pengguna (Bad UX):**
   Tujuan seseorang membagikan obrolan AI adalah agar rekannya bisa membaca teks, mencatat solusi teknis, dan meng-copy cuplikan kode. Memblokir copy membuat website terasa menjengkelkan (*hostile UI*).
3. **Bukan Batas Keamanan Nyata (Not a Security Boundary):**
   Siapapun yang menerima link sudah memegang teks terenkripsi dan kunci `#key`. Mereka bisa mengekstrak teks lewat inspect element, cURL, ekstensi lain, atau mematikan JavaScript.
4. **Keputusan Final:**
   * **Fitur pencegatan `Ctrl+C` dihapus total.** Seleksi teks dan copy dikembalikan normal dan alami.
   * **Filosofi Keamanan yang Benar:** Keamanan SafeShare bukan terletak pada melarang orang menekan tombol copy, melainkan **menjamin bahwa teks yang tampil di layar dan disalin pengguna sudah 100% steril dari rahasia asli, kredensial, dan jebakan matematika aljabar**.

---

## 5. Analisis Kritis: Mengapa SafeShare Terasa "Gampang Ditiru" (*Low Barrier to Entry*)?

Ini adalah evaluasi paling penting untuk masa depan proyek:

### 1. Masalah Pendekatan "Post-Inference Redaction"
Saat ini, SafeShare bekerja dengan cara:
`Pengguna mengetik chat mentah` $\to$ `Terkirim ke LLM` $\to$ `Ekstensi membaca teks output` $\to$ `Ekstensi menyensor teks`.
* Kelemahan fatal: **Rahasia asli pengguna sudah terlanjur terkirim dan terekam di server OpenAI/Claude/Google!**
* Ekstensi browser lain mana pun bisa melakukan hal yang sama hanya dengan script DOM biasa. Tidak ada benteng teknologi (*technical moat*) yang tinggi di sini.

### 2. Perang Tanpa Akhir "Whack-A-Mole" pada Regex
* Kita membuat aturan untuk NIK $\to$ jebol di NIM.
* Kita membuat aturan untuk NIM $\to$ jebol di NPWP.
* Kita membuat aturan untuk NPWP $\to$ jebol di Paspor.
* Kita membuat aturan untuk 15% $\to$ jebol di akumulasi 5 tahun.
* **Reviewer Black Hat akan langsung menilai:** *"Sistem ini rapuh karena berbasis aturan heuristik statis. Penyerang tinggal mencari format penulisan yang belum ada di daftar regex Anda."*

### 3. Dilema Ukuran Model: ONNX 129 MB vs Ekstensi Ringan 30 KB
* **Jika Memakai Model Deep Learning Penuh (DistilBERT ONNX ~129 MB):**
  * Ukuran file terlalu besar untuk Chrome Web Store / Mozilla AMO.
  * Menghabiskan ratusan MB RAM browser pengguna.
  * Menyebabkan jeda lambat (*cold-start lag*) saat browser baru dibuka.
* **Jika Hanya Memakai Script JavaScript Murni (~30 KB):**
  * Sangat ringan dan instan, tetapi terbatas pada aturan pola teks yang kaku.

---

## 6. Solusi Menuju Standar Black Hat Sejati (Beyond Regex & Gimmicks)

Untuk mengubah SafeShare-AI dari sekadar "ekstensi browser penyensor teks" menjadi **karya riset keamanan siber tingkat tinggi yang sulit ditiru (*Hard Technical Moat*)**, sistem harus berpindah ke 4 pilar arsitektur baru:

### A. Pilar 1: Pre-Inference Symbolic Transformation (Invarian: `secret ∉ outbound_prompt`)
* Rahasia asli **tidak boleh pernah keluar dari memori browser pengguna**.
* Sebelum prompt dikirim ke ChatGPT/Claude, ekstensi mencegat input dan mengganti angka rahasia menjadi variabel simbolik:
  * Input Asli: `Gaji saya Rp 3.000.000 per bulan, buatkan anggaran mobil 30%.`
  * Outbound Prompt ke LLM: `Gaji saya adalah <S1> per bulan, buatkan anggaran mobil 30% menggunakan rumus simbolik proporsional.`
* LLM menjawab dalam bentuk rumus matematika simbolik:
  * Jawaban LLM: `Alokasi mobil = 0.30 * <S1>, Akumulasi 1 tahun = 12 * 0.30 * <S1>.`
* Browser klien mengeksekusi **`LOCAL_COMPUTE`**:
  * Nilai `S1 = 3.000.000` dihitung di RAM browser lokal tanpa LLM pernah tahu berapa gaji aslinya!
  * Utilitas jawaban tetap 100% sempurna, rahasia aman secara mutlak dari server AI.

### B. Pilar 2: Taint Analysis & Semantic Provenance Graph
* Membangun graf pohon ketergantungan (*Dependency DAG*):
  Setiap angka di jawaban asisten dilacak asal-usulnya (*provenance*). Jika suatu angka merupakan turunan matematis dari variabel sensitif ($N = S_1 \times 0.30 \times 12$), node tersebut otomatis mewarisi status sensitif (*taint propagation*).

### C. Pilar 3: Adversary-Oracle Constraint Solver
* Bukan lagi mencocokkan regex persentase manual, melainkan menjalankan **solver penyerang otomatis di sisi klien**.
* Solver menguji: *Apakah dari kumpulan angka yang tampak di layar, ada kombinasi operasi kali/bagi dengan konstanta waktu (12, 24, 36, 60 bulan) yang menghasilkan nilai rahasia dalam batas toleransi $\epsilon$?*
* Jika ada $\to$ sistem memutus jalur inversi tersebut (*Greedy Hitting Set Redaction*) dengan mempertahankan rasio bebas-skala (30%) dan menyamarkan angka akumulasi absolutnya.

### D. Pilar 4: Model NLP In-Browser Ultra-Ringan (< 3 MB via WASM / Linear-CRF)
* Menggantikan DistilBERT 129 MB dengan model ekstraksi entitas berbasis **Linear-CRF terkuantisasi / FastText yang dikompilasi ke WebAssembly (WASM)**.
* Ukuran hanya 1–3 MB, latensi sub-milidetik (< 2 ms), dan dapat berjalan di semua jenis perangkat tanpa membutuhkan GPU.

---

## 7. Master Prompt untuk Konsultasi dengan AI Penalaran Tingkat Tinggi

Salin seluruh teks di bawah ini dan kirimkan ke AI tingkat lanjut (seperti **Claude 3.7 Sonnet**, **OpenAI o1 / GPT-4.5**, atau **DeepSeek-R1**) untuk mendapatkan tinjauan kritis dan saran metodologi baru:

```text
Halo, saya sedang mengembangkan proyek riset keamanan siber dan perkakas pertahanan privasi konteks AI bernama "SafeShare-AI" yang ditargetkan untuk Call for Tools di Black Hat Asia 2027 Arsenal serta paper ilmiah akademik (topik: Generative AI Privacy & Context Security).

Saat ini kami menghadapi krisis arsitektural dan evaluasi diri yang sangat serius:
"Proyek kami terasa terlalu mudah ditiru (copyable) dan terasa seperti sesuatu yang bisa dibuat oleh software engineer biasa dalam 1 minggu hanya dengan modal regex PII + WebCrypto AES-GCM + Cloudflare D1."

Kami ingin membuang semua bentuk 'security theater' atau 'gimmick' (seperti mencegat tombol Ctrl+C dengan JavaScript atau popup alarm anti-DevTools yang ujung-ujungnya tetap bisa di-bypass). Kami ingin membangun "Hard Technical Moat" yang berbasis sains keamanan data yang kokoh.

TOLONG BERIKAN AUDIT KRITIS, MASUKAN METODOLOGI, DAN DESAIN ARSITEKTUR TINGKAT TINGGI:

================================================================================
1. ARSITEKTUR KAMI SAAT INI (6-TIER SYSTEM)
================================================================================
- Tier 1 (Heuristics): Regex deterministik untuk NIK KTP, NPWP, Paspor, BPJS, SIM, API keys (OpenAI, Stripe, AWS, GitHub), database URI, EVM wallet (0x...), BIP-39 seed phrase, Linux shadow hash, dan shell prompt (Powerline, Kali, macOS, PowerShell).
- Tier 2 (Contextual AI): Model DistilBERT multilingual fine-tuned di GPU RTX 4060 (62.000 sampel kontras) untuk membedakan 'gaji saya' (personal) vs 'rata-rata pasar Indeed' (publik).
- Tier 3 (Pseudonymizer & Adversary Solver): Parser aljabar yang mencari angka turunan (proyeksi kenaikan 15-20%, pembulatan 33 juta, akumulasi multi-tahun) dan menggantinya dengan placeholder [REDACTED_...].
- Tier 4 (Client Cryptography): AES-256-GCM via WebCrypto. Kunci enkripsi ditaruh eksklusif di URI fragment (#key) RFC 3986 sehingga server Cloudflare hanya menyimpan ciphertext (server-blind, zero-laptop dependency).
- Tier 5 (Serverless Storage): Cloudflare Workers + D1 database dengan TTL 24 jam dan opsi atomic burn-after-reading.
- Tier 6 (Client Enclave): Forensic Steganography (tanda air tak kasat mata Zero-Width Unicode HMAC) untuk pelacakan pembocor (traitor tracing).

================================================================================
2. KELEMAHAN & KEGAGALAN NYATA YANG BARU SAJA TERJADI
================================================================================
Pada pengujian kasus nyata:
Input Pengguna:
"name : de jembras, NIM : 3002455595, my salary is Rp 3.000.000 and i would like to safe some my salary to buy cars in indonesia"

Hasil Output AI yang Bocor:
- Gaji awal disensor: [REDACTED_FINANCIAL_1]
- Alokasi tabungan mobil: 30%
- Akumulasi tahunan bocor: 1 year -> Rp10.8 million, 2 years -> Rp21.6 million, 5 years -> Rp54 million.
- Serangan Inversi Berhasil: Penyerang menghitung 10.8M / 12 = 900k -> 900k / 30% = Rp 3.000.000. Gaji pokok asli korban terbongkar 100%!
- Format "name :" dan "NIM : 3002455595" sempat lolos karena variasi format form.
- Terjadi substring mangling (Rp32.[REDACTED_PROJECTED_SALARY]) akibat pemotongan regex parsial.
- Terjadi over-redaction di kode Kubernetes: konfigurasi YAML runAsUser: 1000 dan IP 10.244.0.15/32 sempat salah disensor sebagai uang belanja.

================================================================================
3. PERTANYAAN STRATEGIS & RISET UNTUK ANDA
================================================================================
1. PARADIGMA INFERENSI ALJABAR (ALGEBRAIC RECONSTRUCTION DEFENSE):
   Bagaimana cara memecahkan masalah rekonstruksi aljabar ini secara deterministik dan elegan? Apakah pendekatan Pre-Inference Symbolic Transformation (mengganti rahasia menjadi token simbolik <S1> sebelum dikirim ke LLM, lalu browser klien menghitung lokal lewat LOCAL_COMPUTE) merupakan arsitektur terbaik? Atau apakah ada pendekatan constraint-solving lain yang lebih superior?

2. MODEL NLP IN-BROWSER ULTRA-RINGAN (< 3-5 MB):
   Model DistilBERT ONNX 129 MB terlalu besar untuk browser extension store dan lambat di CPU biasa. Bagaimana cara membangun classifier kontekstual in-browser dengan ukuran di bawah 3-5 MB (misal via WebAssembly, Linear-CRF, atau TinyBERT distilled) yang akurat membedakan data personal vs benchmark publik tanpa mudah dibypass oleh variasi bahasa santai?

3. MEMBANGUN "HARD TECHNICAL MOAT" UNTUK BLACK HAT ARSENAL 2027:
   Bagaimana cara memposisikan SafeShare agar dinilai sebagai karya riset keamanan siber kelas tinggi dan bukan sekadar "wrapper script regex + crypto yang gampang dicopy"? Inovasi sains atau formal verification apa yang harus kami tambahkan?

4. STATE-OF-THE-ART (SOTA) LITERATURE & PAPERS:
   Makalah ilmiah apa (2024–2026, IEEE S&P, USENIX Security, ACM CCS, NDSS, PETS) yang relevan mengenai inference attacks on redacted text, data reconstruction from generative outputs, atau provenance-aware privacy yang wajib kami jadikan rujukan utama?

Mohon berikan analisis yang tajam, objektif, dan blueprint solusi teknis yang konkret!
```
