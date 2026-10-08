# SafeShare-AI 🛡️

> **Client-Side Zero-Knowledge Privacy Guard & Algebraic Reconstruction Defense for Generative AI Chats**  
> *Targeted for Black Hat Asia 2027 Arsenal & Academic Peer-Reviewed Publications*

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3_Compliant-success.svg)](extension/manifest.json)
[![Cryptography](https://img.shields.io/badge/Crypto-AES--256--GCM_WebCrypto-critical.svg)](extension/engine/crypto.js)
[![Edge Relay](https://img.shields.io/badge/Relay-Cloudflare_D1_Serverless-orange.svg)](relay/worker.js)
[![Audit](https://img.shields.io/badge/Security_Audit-100%25_Passed-brightgreen.svg)](AUDIT_BENCHMARK_REPORT.md)

---

## 1. The Core Problem: The Public AI Share Link Crisis (2023–2026)

Across major consumer Large Language Model (LLM) platforms (**ChatGPT, Claude, Grok, Google Gemini, DeepSeek**), the native *"Share Conversation Link"* feature has repeatedly led to massive exposure of private user data:
* **Unauthenticated Public URLs:** Shared conversation links are public web pages. Commercial search engines (Googlebot, Bingbot) and archive crawlers index these URLs automatically.
* **Massive Sensitive Data Exposure:** Tens of thousands of private chats containing developer API keys, database credentials, psychiatric medical records, tax IDs, and confidential salaries have been indexed publicly.
* **Vendor Reactive `noindex` Fallacy:** Vendors only slapped `<meta name="robots" content="noindex">` after public leaks went viral. However, `noindex` only stops search results listing; **it never encrypts the document**. Anyone or any bot possessing the link can read, scrape, and archive it freely.
* **The Algebraic Inversion Attack:** Naive redaction simply replaces a secret with `[REDACTED]`. However, when an AI assistant calculates derived metrics (e.g., 30% savings rate, 1-year accumulation of Rp 10.8M, multi-year timelines), an attacker easily performs mathematical inversion:
  $$\text{Original Salary} = \frac{\text{Rp } 10.800.000 / 12}{30\%} = \mathbf{\text{Rp } 3.000.000}$$
  The original secret is completely recovered through the back door!

**SafeShare-AI** solves this fundamentally by providing a **zero-knowledge, client-side browser enclave** that purges sensitive entities before prompts leave the client, blocks mathematical inversion, and encrypts chats end-to-end such that intermediaries and search engines are mathematically blind (**server-blind**).

---

## 2. Six-Tier Defense-in-Depth Architecture

```text
[Raw Conversation Input (ChatGPT / Claude / DeepSeek)]
                       │
                       ▼
[Tier 1: Deterministic Heuristic Scanner] (<2ms, deterministic regex)
├── Indonesian NIK / KTP (16 digits calendar & region verified)
├── Credit Cards (Luhn Algorithm checksum verification)
├── Official IDs: NPWP Tax ID, Indonesian Passport, BPJS Kesehatan/TK, SIM Driver License
├── Academic Identifiers: NIM / NPM / NRP / Student ID
├── API Keys & Credentials: OpenAI, Stripe live keys, GitHub tokens, AWS keys, JWT
├── Database URIs: postgresql://, mysql://, redis:// with passwords
├── High-Entropy Secrets: EVM Wallets (0x...), BIP-39 12-Word Seed Phrases, Linux /etc/shadow Hashes
└── Terminal Shell Prompts: Zsh Powerline (@user ), Kali Linux, macOS (%), Windows CMD/PS, Git Author, SSH Keys
                       │
                       ▼
[Tier 2: Contextual Integrity AI] (Multilingual DistilBERT)
├── Fine-tuned on GPU RTX 4060 across 62,000 contrastive bilingual samples
├── Distinguishes 1st-person private disclosures ("my salary", "gaji saya") vs.
│   Public aggregate benchmarks ("Indeed average salary", "Glassdoor median")
└── Zero False Positive on technical code syntax, CTF assembly, and public market research
                       │
                       ▼
[Tier 3: Canonical Equivalence & Adversary-Oracle Solver]
├── Universal Numeric Lexer: Normalizes Indonesian & English numerals (10.8M, 10,8 juta, 45 jeti)
├── Adversary-Oracle Loop: Simulates attacker inversion using periodic constants (12, 24, 36, 60 months)
├── Scale-Free Utility Preservation: Preserves safe scale-free ratios (30%, 40%) while suppressing unsafe absolute sums
└── Whole-Token Span Slicing: Eliminates regex substring mangling (no Rp32.[REDACTED] artifacts)
                       │
                       ▼
[Tier 4: Zero-Knowledge Client Cryptography] (AES-256-GCM)
├── Encrypted in client browser RAM using W3C WebCrypto SubtleCrypto (256-bit key + 96-bit random IV)
└── Decryption key placed EXCLUSIVELY in the URL Hash Fragment (#key) RFC 3986 (Server & Googlebot blind)
                       │
                       ▼
[Tier 5: Cloudflare Global Edge & D1 Serverless Storage]
├── Runs serverlessly across 300+ edge cities (0% sender laptop dependency)
├── Cloudflare D1 SQL storage with configurable TTL (24 hours, 3 days, 7 days)
└── Atomic Burn-After-Reading (Single-use links shredded immediately on first view)
                       │
                       ▼
[Tier 6: Post-Decryption Enclave & Traitor Tracing]
├── Dynamic Glyph Scrambling: Deranges character glyphs to defeat DOM text scraping
├── Forensic Steganography: Invisible zero-width Unicode HMAC for non-repudiation and traitor tracing
├── Active Tamper Guard: Instantly zeroizes RAM and shreds URL hash if DevTools/debugger is triggered
└── Universal 1-Click Continue: Bridges sanitized prompts directly to fresh ChatGPT/Claude tabs with zero clipboard leak
```

---

## 3. Quickstart: Installation & Usage

### A. End-User Browser Extension (Chrome / Brave / Firefox)
The extension package is **100% self-contained** (~70 KB) and requires no local servers or model downloads for normal end-users:

#### Google Chrome / Brave / Edge:
1. Download or clone this repository.
2. Open your browser and navigate to `chrome://extensions` (or `brave://extensions`).
3. Enable **"Developer mode"** in the top-right corner.
4. Click **"Load unpacked"** and select the `extension/` directory.
5. Open ChatGPT (`chatgpt.com`), Claude (`claude.ai`), or DeepSeek (`chat.deepseek.com`). SafeShare will automatically monitor and sanitize outgoing shared prompts.

#### Mozilla Firefox:
1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **"Load Temporary Add-on..."** and select `extension/manifest.json`.

---

### B. Running Local Zero-Knowledge Relay & Viewer (Offline Testing)
If you wish to host the relay and web viewer locally without relying on Cloudflare Edge:
```bash
# Launch the local serverless relay daemon on port 8787
npm run relay:local
# Or directly via Python:
python3 relay/server_local.py
```
Open `http://localhost:8787` in your browser. The web viewer will load with the local zero-knowledge decryption engine.

---

## 4. Empirical Security Benchmarks & Automated Tests

SafeShare-AI includes an extensive suite of automated test scripts covering edge cases, adversarial stress tests, and real-world failure benchmarks:

```bash
# Run the core test suite:
npm test

# Run all 8 test suites & comprehensive deep audits:
npm run test:all
```

### Specific Benchmark Suites:
* **`npm run test:privacybench`** — Evaluates the **SafeShare-PrivacyBench Out-of-Distribution (OOD)** human conversational benchmark to compute formal cybersecurity metrics: Secret Exposure Rate (SER), Utility Degradation Rate (UDR), and human detection recall.
* **`npm run test:adversarial`** — Tests 10 advanced adversarial evasion vectors: zero-width character evasion (\u200B in API keys), obfuscated/defanged emails ([at]/[dot]), email sign-off closing names, raw 9-digit SSN, international passports, multi-chain crypto (Solana Base58, Bitcoin Bech32), DevSecOps .env/YAML password blocks, HTTP Basic Auth Base64 headers, Indian Tech LPA compensation, and anti-over-redaction on general English "project management".
* **`npm run test:comprehensive`** — Evaluates 37 extensive multi-domain adversarial English scenarios across Cybersecurity/DevOps (Anthropic Claude keys, GCP API keys, HuggingFace, NPM, WireGuard, curl basic auth), Healthcare/HIPAA (psychotropics, oncology staging, clinical MDD transcripts), Workplace/HR (PIPs, Title VII harassment, unannounced NDA codenames), and unexpected edge cases (Markdown tables, code comments, obfuscated PII).
* **`npm run test:financial`** — Evaluates international financial PII, Silicon Valley executive tech compensation (TC, base, RSUs, ISO strike price), direct banking (US SSN, EIN, ABA routing number, IBAN, SWIFT/BIC), GAAP parentheses negative numbers, corporate burn rates, and macroeconomic zero-false-positive controls.
* **`npm run test:jembras`** — Tests the real-world **De Jembras** case study: verifies multi-year algebraic accumulation suppression (Rp 10.8M, 21.6M, 54M) while preserving scale-free percentages (30%, 40%) and key-value form delimiters (`name :`, `NIM :`).
* **`npm run test:stress`** — Runs 16 out-of-the-box V3 extreme stress vectors (Indonesian NPWP, Passport, SIM, BPJS, EVM wallet, BIP-39 mnemonic, Stripe secret keys, Linux shadow hashes, Kubernetes YAML preservation).
* **`npm run test:enclave`** — Validates the post-decryption enclave (tamper guard memory zeroing, zero-width steganography traitor-tracing, and glyph scrambler).
* **`npm run test:audit`** — Runs the master 57-check autonomous security audit across all 5 verification phases.

---

## 5. Dataset & Machine Learning R&D

SafeShare-AI is powered by the **SafeShare-PrivacyBench V3** dataset using a Probabilistic Context-Free Grammar (PCFG) and Template-Disjoint Partitioning:
* **Dataset Size:** 85,000+ balanced contrastive sentences across global tech compensation, DevSecOps secrets, healthcare disclosures, and macroeconomic controls.
* **Split:** 80% Train (68,000), 10% Validation (8,500), 10% Test (8,500) partitioned with **Disjoint Template Sets** to eliminate template memorization leakage.
* **Out-of-Distribution (OOD) Human Benchmark:** `data/test_ood_human.json` containing human conversational prompts for formal SER (Secret Exposure Rate) and UDR (Utility Degradation Rate) evaluation.
* **Labeling:** 11 BIO token classification labels (`B-SENSITIVE_FINANCIAL`, `I-SENSITIVE_FINANCIAL`, `B-SENSITIVE_HEALTH`, `B-SENSITIVE_CORP`, `B-SENSITIVE_LEGAL_HR`, `B-SENSITIVE_USER`, etc.).
* **Base Architecture:** `distilbert/distilbert-base-multilingual-cased`.
* **Hardware:** NVIDIA GeForce RTX 4060 Laptop GPU (FP16 Tensor Cores, CUDA 12.4).

### Developer Model Weights:
Because model weights exceed GitHub's 100MB file limit, researchers wishing to run the PyTorch / ONNX evaluation pipeline should refer to [`MODELS_SETUP.md`](MODELS_SETUP.md) for Google Drive download instructions.

---

## 6. Repository Layout

```text
safeshare-ai/
├── extension/             # Browser extension (Chrome & Firefox MV3)
│   ├── engine/            # Heuristics, Contextual, Pseudonymizer, Crypto
│   ├── ui/                # Modern Calm Security modal dialog
│   └── models/onnx/       # Model configs, tokenizers, vocab
├── viewer/                # Client-Side Zero-Knowledge Web Enclave
│   ├── engine/            # Glyph scrambler, Steganography, Tamper guard, Bridge
│   ├── index.html         # Lock screen & decrypted chat viewer
│   ├── app.js             # Client controller
│   └── crypto.js          # WebCrypto AES-256-GCM decryptor
├── relay/                 # Cloudflare Global Edge Worker & Local Daemon
│   ├── worker.js          # Cloudflare Worker code
│   ├── wrangler.toml      # Cloudflare D1 configuration
│   ├── schema.sql         # D1 SQL database schema
│   └── server_local.py    # Local standalone relay server
├── data/                  # 62,000 labeled dataset & synthetic generator
├── training/              # Fine-tuning, evaluation, and ONNX quantization scripts
├── docs/                  # Full research blueprints & academic briefs
│   ├── BLUEPRINT_SAFESHARE_DEFENSE.md
│   ├── RESEARCH_JOURNEY_ROADMAP.md
│   ├── AUDIT_BENCHMARK_REPORT.md
│   ├── RANGKUMAN_FITUR_DAN_DATASET.md
│   ├── LLM_CHAT_PRIVACY_RESEARCH_BRIEF.md
│   └── deepresearch/      # Next-gen research blueprints and review papers
├── package.json           # NPM scripts for running all audits
├── requirements.txt       # Python dependencies for ML R&D
├── .gitignore             # Strict exclusion of graphify, venv, and large weights
├── LICENSE                # Apache 2.0 Open-Source License
└── README.md              # Project documentation
```

---

## 7. License & Credits

Distributed under the **Apache 2.0 License**. See [`LICENSE`](LICENSE) for details.

Developed by the **SafeShare-AI Research Team** for submission to **Black Hat Asia 2027 Arsenal** and academic publications in AI privacy and context security.
