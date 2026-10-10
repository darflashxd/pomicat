# SafeShare-AI — Deep Research & Technical Audit Handoff

> **Purpose:** This document is a handoff brief for an AI CLI / coding-research agent. It is intentionally written as an actionable research specification rather than a marketing document.
>
> **Primary project source:** `BLUEPRINT_SAFESHARE_DEFENSE.md` (September 2026), the current SafeShare-AI architecture and failure analysis.
>
> **Important:** Treat statements marked **[BLUEPRINT]** as claims from the supplied project document. Do not silently treat them as externally verified facts. Any claim marked **[TO VERIFY]** must be checked against current primary sources or reproduced experimentally.

---

## 0. Mission

Perform a **deep technical research, security architecture review, and experimental roadmap** for SafeShare-AI.

The end goal is to turn the current prototype into a technically defensible research project suitable for:

1. an academic paper / undergraduate thesis,
2. an open-source security tool,
3. a high-quality live demonstration / security conference submission such as Black Hat Asia Arsenal 2027.

The main research problem is **not merely PII detection**. The central challenge is:

> How can a client-side privacy system prevent sensitive facts from being reconstructed or inferred from otherwise sanitized LLM conversations, while preserving useful conversational behavior and keeping the client lightweight?

The current prototype already explores a six-tier defense-in-depth architecture, but the failure case demonstrates that **redacting source values is insufficient when derived values remain observable**.

---

# 1. Authoritative Project Context

## 1.1 Project identity

**Project:** SafeShare-AI

**Repository concept:** `ai-context-security`

**Defensive track:** `/safeshare/`

**Related offensive research:** AgentBleed, a separate project concerning leakage across AI-agent memory / tenant boundaries.

**Target outputs:** open-source security tool + academic research + possible Black Hat Asia Arsenal 2027 submission.

### [BLUEPRINT]
The project is described as a client-side privacy guard for AI conversations and shared AI chat links, targeting sensitive data such as PII, PHI, credentials, and financial information.

See the supplied blueprint for the exact architectural claims and terminology.

Source lines: `BLUEPRINT_SAFESHARE_DEFENSE.md` lines 11–15.

---

# 2. Current Six-Tier Architecture

The current design is:

```text
[Input Conversation AI]
        │
        ├──► Tier 1: Heuristics Scanner
        │       deterministic regex / format-based detection
        │
        ├──► Tier 2: Contextual Integrity Model
        │       DistilBERT multilingual fine-tuned classifier
        │
        ├──► Tier 3: Canonical Equivalence & Algebraic Sweeper
        │       derived-value detection / masking
        │
        ├──► Tier 4: Zero-Knowledge Client Cryptography
        │       AES-256-GCM + URI fragment key
        │
        ├──► Tier 5: Cloudflare Edge + D1 Storage
        │       encrypted payload relay / TTL / burn option
        │
        └──► Tier 6: Post-Decryption Enclave
                anti-copy mechanism
                forensic watermarking
                tamper response
```

### [BLUEPRINT] Current implementation claims

- Tier 1 detects Indonesian NIK, credit cards using Luhn, common API-key formats, database credentials, shell prompts, identity outputs, and related patterns.
- Tier 2 uses `distilbert/distilbert-base-multilingual-cased` with a project-specific contrastive dataset.
- Tier 3 attempts to identify derived financial numbers and algebraic relationships.
- Tier 4 uses WebCrypto AES-256-GCM with a 96-bit random IV; the encryption key is placed in the URI fragment.
- Tier 5 uses Cloudflare Workers + D1 for relay/storage, TTL, and burn-after-reading.
- Tier 6 uses anti-copy logic, invisible Unicode watermarking, and browser tamper response.

See blueprint lines 47–70 and 73–87.

---

# 3. Critical Real-World Failure Case

## 3.1 Input

```text
name : de jembras
NIM : 3002455595

my salary is Rp 3.000.000 and i would like to safe some my salary to buy cars in indonesia
```

The actual project test case is documented in the supplied blueprint.

## 3.2 Sanitized assistant response

The assistant response retained multiple derived values, including:

```text
Car savings = 30%
1 year  → Rp10.8 million
2 years → Rp21.6 million
5 years → Rp54 million
```

while the original monthly salary was replaced with a redaction placeholder.

## 3.3 Reconstruction

An attacker can calculate:

```text
monthly savings = 10,800,000 / 12
                = 900,000

salary = 900,000 / 0.30
       = 3,000,000
```

This means the source secret can be absent from the text while the **constraint system implied by the remaining text is sufficient to recover it**.

This is the core research problem.

### [BLUEPRINT] Five observed failures

1. **Name-format bypass**
   - `name : de jembras` was not caught by the current natural-language name patterns.

2. **Domain entity bypass**
   - A 10-digit NIM was not recognized because the current heuristic emphasized 16-digit NIK patterns.

3. **Multi-year algebraic reconstruction**
   - Derived yearly savings exposed enough equations to solve for the original salary.

4. **Substring collision / text mangling**
   - A mathematical-number rule incorrectly damaged `Rp32.4 million`.

5. **Semantic label confusion**
   - Budget allocation values were all tagged as `[REDACTED_SALARY_INCREMENT]`, even though they represented distinct semantic concepts.

Source: blueprint lines 131–155.

---

# 4. Core Security Thesis to Investigate

The system should move from:

```text
Detect secret → replace secret
```

toward:

```text
Identify sensitive source facts
        ↓
Track their semantic / numerical provenance
        ↓
Construct constraints induced by visible text
        ↓
Detect whether the visible output still determines the secret
        ↓
Rewrite / suppress the minimum set of dependent expressions
        ↓
Verify residual disclosure risk
```

The research question is therefore closer to **provenance-aware inference control** or **constraint-preserving privacy sanitization** than simple regex redaction.

Do NOT prematurely assume that “algebraic reconstruction” is already a standardized academic attack class. Treat the terminology as a project term unless reliable literature establishes a recognized equivalent.

---

# 5. Primary Research Question

Investigate the following:

> **RQ1:** How can a browser-side privacy guard detect and suppress LLM-generated outputs that allow an attacker to infer a redacted sensitive value through mathematical, logical, semantic, or cross-message relationships?

Secondary questions:

- **RQ2:** Can source-value taint tracking be combined with symbolic math / constraint solving to detect reconstructability more reliably than hardcoded regexes?
- **RQ3:** What is the smallest practical browser-resident model or algorithmic stack for contextual PII detection while staying below ~5 MB additional model payload?
- **RQ4:** What security guarantees are actually provided by a URI-fragment AES-GCM design, and what threats remain at the browser endpoint?
- **RQ5:** Can post-decryption provenance tracing materially improve accountability without being presented as prevention of copying?
- **RQ6:** How should the system measure privacy leakage, utility loss, false positives, and false negatives in a reproducible benchmark?

---

# 6. Required Deep-Research Tracks

## Track A — Algebraic / Inferential Reconstruction Defense

Investigate techniques including:

### A1. Symbolic expression extraction

Explore:

- mathematical expression parsing,
- numeric normalization,
- currency normalization,
- percent / ratio parsing,
- unit conversion,
- temporal aggregation,
- equation extraction from natural language,
- AST construction,
- symbolic simplification,
- interval arithmetic,
- constraint graphs,
- SMT/SAT solving where appropriate.

Determine whether a lightweight symbolic engine is practical in a browser.

Potential implementations to evaluate:

- custom numeric AST,
- `math.js`,
- a WASM symbolic engine,
- a restricted expression grammar,
- a custom constraint graph rather than full CAS.

Do not assume a full computer algebra system is necessary.

### A2. Provenance / taint tracking

Investigate whether each sensitive source value can receive a persistent internal identifier such as:

```text
S1 = sensitive salary
S2 = sensitive NIM
S3 = sensitive person name
```

Then expressions generated downstream can be represented as:

```text
E1 = 0.30 * S1
E2 = 12 * E1
E3 = 5 * 12 * E1
```

The visible text can then be analyzed for whether a set of visible values provides sufficient constraints to solve for `S1`.

Explore:

- information-flow tracking,
- data lineage,
- provenance graphs,
- symbolic taint propagation,
- dependency graphs,
- semantic dataflow.

### A3. Reconstructability criterion

Develop a formal criterion for when a sanitized output is unsafe.

Possible formulation:

Let `S` be a sensitive variable and `O` the observable output.

The output is potentially reconstructive when there exists a function or constraint system `f` such that:

```text
S = f(O, publicly known assumptions)
```

More generally, investigate whether:

```text
H(S | O, A) ≈ 0
```

for relevant attacker knowledge `A`, where `H` is conditional uncertainty.

Do not claim this equation is a complete security definition without literature support.

### A4. Partial / approximate reconstruction

The attack is not limited to exact recovery.

Research:

- bounded intervals,
- approximate salary bands,
- ranking inference,
- percentage + total combinations,
- mortgage / installment inference,
- tax reconstruction,
- reverse-engineering hidden quantities from normalized tables,
- cross-turn accumulation.

Example:

```text
[REDACTED_SALARY]
30% → Rp900k
annual → Rp10.8m
```

Exact reconstruction is obvious, but even:

```text
savings ≈ Rp850k–950k
saving rate = 30%
```

may expose a tight enough interval to constitute privacy leakage.

### A5. Cross-message inference

Do not restrict the detector to one assistant response.

Investigate whether the attacker can combine:

```text
turn 1 + turn 2 + turn 3 + shared conversation metadata
```

to recover a sensitive variable.

This should become a first-class benchmark category.

### A6. Non-financial examples

Construct equivalent cases for:

- age,
- salary,
- debt,
- medical measurements,
- body weight,
- exam scores,
- household expenses,
- employee counts,
- timestamps,
- location ranges,
- unique IDs,
- account balances.

The research should prove whether the architecture generalizes beyond finance.

---

# 7. Candidate Defense Architecture

Investigate a redesigned pipeline along these lines:

```text
                  ┌───────────────────────────────┐
                  │ Sensitive Fact Registry       │
                  │ S1, S2, S3, ...               │
                  └───────────────┬───────────────┘
                                  │
                    taint / provenance IDs
                                  │
                                  ▼
┌─────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ Text parser │ → │ Entity/context NER  │ → │ Numeric normalizer  │
└─────────────┘   └─────────────────────┘   └─────────┬───────────┘
                                                       │
                                                       ▼
                                          ┌────────────────────────┐
                                          │ Provenance / constraint│
                                          │ graph                  │
                                          └───────────┬────────────┘
                                                      │
                                                      ▼
                                          ┌────────────────────────┐
                                          │ Reconstructability     │
                                          │ analysis                │
                                          └───────────┬────────────┘
                                                      │
                              ┌───────────────────────┼──────────────────────┐
                              │                       │                      │
                              ▼                       ▼                      ▼
                         SAFE OUTPUT          PARTIAL RISK           HIGH RISK
                              │                       │                      │
                              ▼                       ▼                      ▼
                        allow                  generalize             rewrite/suppress
```

The AI CLI should determine which components are genuinely necessary and which are overengineering.

---

# 8. Alternative Defense Strategies to Compare

The research must compare, not merely list, these approaches:

## Strategy 1 — Regex / heuristic rules

Baseline.

Measure:

- precision,
- recall,
- latency,
- implementation complexity,
- adversarial bypass rate.

## Strategy 2 — NER / contextual classifier

Possible options:

- DistilBERT,
- TinyBERT,
- MiniLM-class models,
- compact transformer,
- ONNX Runtime Web,
- WASM inference,
- quantized model,
- browser-native APIs if any are suitable.

## Strategy 3 — Symbolic / rule-based numerical engine

No large neural model required.

Potentially better suited for:

- percentages,
- multiplication,
- division,
- totals,
- annualization,
- ratios,
- unit conversion.

## Strategy 4 — Hybrid detector

```text
heuristics + tiny contextual model + numeric constraint engine
```

This is the most important candidate architecture to evaluate.

## Strategy 5 — Differential privacy / numerical perturbation

Research carefully before using.

Questions:

- Does DP actually fit an individual chat sanitization problem?
- Is this a local privacy transformation or a statistical disclosure problem?
- How would epsilon / delta be defined?
- Does perturbation break useful budgeting / technical answers?
- Could correlated outputs cancel or reveal the perturbation?
- Is deterministic redaction preferable for credentials and exact identifiers?

Do not add “differential privacy” merely because it sounds mathematically sophisticated.

---

# 9. Ultra-Lightweight Browser Contextual Classification

The blueprint reports approximately 129 MB for quantized DistilBERT, while seeking a browser footprint below ~5 MB.

This must be independently validated.

## Research candidates

Investigate:

- distilled transformer variants,
- TinyBERT,
- MobileBERT,
- MiniLM,
- ALBERT-style parameter sharing,
- TF.js / ONNX WASM,
- INT8 / UINT8 quantization,
- pruning,
- vocabulary compression,
- task-specific vocabulary,
- linear models on contextual embeddings,
- character-level classifiers,
- finite-state / automata approaches,
- Bloom filters for known-secret formats,
- hybrid local model + deterministic detector.

## Important distinction

Model file size is not the same thing as:

- JS bundle size,
- model download size,
- decompressed memory usage,
- WASM memory,
- browser cache footprint,
- runtime latency.

The benchmark must report all of these separately.

## Desired target

Investigate a realistic configuration with:

```text
Model/download target: <5 MB
Runtime additional RAM: report actual peak
Median per-message latency: report
P95 latency: report
No network request for classification: preferred
```

Do not claim “real-time” without measured latency.

---

# 10. Cryptography Audit

Audit this claim:

```text
AES-256-GCM key stored exclusively in URI fragment (#key)
```

The research must distinguish:

1. cryptographic confidentiality of ciphertext,
2. key transport behavior,
3. browser application security,
4. endpoint compromise,
5. link confidentiality,
6. forward secrecy / key rotation,
7. authentication and integrity,
8. metadata leakage.

## Questions to answer

### Q1. URI fragments

Verify using current RFC/IETF and browser standards whether URI fragments are sent in HTTP requests.

Also investigate leakage through:

- browser history,
- screenshots,
- copied URLs,
- browser extensions,
- page JavaScript,
- crash reporting,
- telemetry,
- referrer behavior,
- analytics scripts.

### Q2. WebCrypto AES-GCM

Verify:

- correct tag configuration,
- IV generation,
- key generation,
- key import/export,
- authenticated metadata / AAD,
- ciphertext encoding,
- nonce reuse risks,
- key lifetime.

### Q3. Server compromise

Determine exactly what an attacker controlling the Cloudflare Worker/D1 infrastructure can see.

The system should remain secure against server-side compromise **only to the extent the design actually permits**.

Avoid using “zero knowledge” as a blanket statement unless the threat model and implementation justify it.

---

# 11. Post-Decryption “Enclave” Audit

The current project uses the term “post-decryption enclave” for browser-side handling after decryption.

This terminology needs scrutiny.

A normal browser page is not a hardware enclave.

Research whether a more technically precise name is preferable, e.g.:

- post-decryption isolation layer,
- browser confidentiality surface,
- protected viewing context,
- controlled rendering environment.

Only call it an “enclave” if a concrete trusted execution / isolation mechanism exists.

---

# 12. Anti-Copy / Honeypot Audit

Current concept:

```text
User presses Ctrl+C
        ↓
clipboard receives decoy token
        ↓
original text is not copied
```

Research:

- bypass through DevTools,
- selection APIs,
- DOM extraction,
- accessibility APIs,
- browser extensions,
- screenshots,
- OCR,
- clipboard APIs,
- OS-level malware,
- screen recording,
- alternate browser profiles.

The CLI should explicitly classify this mechanism as:

```text
prevention
vs.
deterrence
vs.
forensic signal
vs.
security theater
```

Do not overclaim the protection level.

---

# 13. Zero-Width Unicode Forensic Watermark Audit

Current idea:

```text
FEFF / ZWSP / ZWNJ / ZWJ
    ↓
encode recipient/session/timestamp/HMAC material
    ↓
embed invisibly into rendered text
```

Research:

- whether zero-width characters survive copy/paste,
- whether browsers normalize them,
- Unicode normalization effects,
- sanitizers / Markdown renderers,
- model tokenization,
- CMS stripping,
- screenshot / OCR behavior,
- retyping attacks,
- format conversion,
- transliteration,
- Unicode-aware content security policies.

## Security properties to distinguish

A watermark can provide:

```text
provenance / attribution evidence
```

but does not necessarily provide:

```text
confidentiality
or
copy prevention
```

The CLI should identify exactly what security property is achieved.

---

# 14. F12 / DevTools Detection Audit

Current behavior proposal:

```text
F12 detected
→ remove #key
→ attempt memory wipe
→ revoke server object
```

This must be treated as an **adversarially weak control** unless experiments show otherwise.

Research:

- DevTools detection techniques,
- keyboard shortcut bypass,
- remote debugging,
- browser automation,
- JavaScript instrumentation,
- pause / breakpoint attacks,
- page source extraction,
- service-worker access,
- extension APIs.

Important question:

> Can browser JavaScript reliably know that a human opened developer tools?

Even if some detection heuristic works in one browser/version, do not treat it as a trusted security boundary.

Also verify whether “zeroing RAM” is actually enforceable from JavaScript. JavaScript cannot generally guarantee immediate physical RAM erasure or eliminate every copy held by the JS engine / browser / OS.

---

# 15. Threat Model

Define at least these attacker classes:

## T1 — Passive link observer

Knows the shared URL but does not control the recipient browser.

## T2 — Malicious recipient

Has legitimately obtained the plaintext and attempts to extract or redistribute it.

## T3 — Curious server operator

Controls relay/storage infrastructure but not the client-side key.

## T4 — Compromised browser context

Malicious extension, injected JavaScript, XSS, or equivalent.

## T5 — Endpoint malware

Can read clipboard, screenshots, process memory, or user-visible content.

## T6 — Inference attacker

Sees sanitized LLM output and uses arithmetic, semantic reasoning, external knowledge, or cross-turn aggregation to reconstruct sensitive data.

## T7 — Automated AI attacker

Uses another LLM / agent to find relationships the deterministic sanitizer missed.

## T8 — Collusion attacker

Combines multiple shared links or multiple recipients.

Every defense should state which attacker class it addresses.

---

# 16. Formal Security Model

The CLI should attempt to formalize three distinct properties:

## P1 — Direct disclosure

Sensitive source value appears explicitly in observable text.

## P2 — Deterministic reconstruction

Sensitive value can be recovered with a deterministic function from observable data and public assumptions.

## P3 — Probabilistic inference

Sensitive value cannot be uniquely solved but the posterior uncertainty is significantly reduced.

Possible research notation:

```text
S = sensitive secret
O = observable sanitized output
K = attacker auxiliary knowledge

Direct disclosure: S appears in O

Exact reconstruction: exists f such that S = f(O, K)

Inference: distribution P(S | O, K) is materially narrower than P(S | K)
```

These definitions must be compared with established privacy / information-flow literature before being used as formal claims in a paper.

---

# 17. Evaluation Dataset Design

Create a benchmark specifically for SafeShare.

## 17.1 Categories

### Identity

- name
- NIM/student number
- employee ID
- phone
- email
- address
- national ID

### Credentials

- API keys
- passwords
- tokens
- SSH material
- database connection strings

### Finance

- salary
- savings
- debt
- credit limit
- expenses
- mortgage
- installment
- tax

### Health

- age
- weight
- diagnosis
- lab values
- medication quantities

### Technical environment

- usernames
- hostnames
- local paths
- internal IPs
- repository identity

## 17.2 Input variation

Each secret should be expressed in many forms:

```text
name: Alice
Name : Alice
Nama: Alice
nama saya Alice
my name is Alice
Alice adalah nama saya
user=Alice
{"name":"Alice"}
name => Alice
```

For numeric data:

```text
Rp 3.000.000
Rp3,000,000
3000000 rupiah
3 juta
3 jt
IDR 3m
3e6 IDR
```

The benchmark must deliberately include adversarial syntax variations.

---

# 18. Algebraic Attack Corpus

Generate controlled cases where the LLM is instructed to derive information from a secret.

Examples:

```text
salary = S
saving_rate = 0.30
monthly_saving = 0.30*S
annual_saving = 12*0.30*S
five_year_saving = 60*0.30*S
```

Rendered natural-language variants:

```text
“I save 30% every month.”
“After 12 months, the savings are Rp10.8 million.”
“After 5 years, I have Rp54 million.”
```

The ground truth should store:

```text
secret value
all known relationships
whether output is sufficient to reconstruct secret
reconstruction complexity
```

---

# 19. Attack Automation

Build an attacker benchmark that tries to recover the secret using:

1. direct arithmetic,
2. symbolic algebra,
3. a generic LLM,
4. a constrained solver,
5. multi-turn aggregation,
6. external public data,
7. combinations of the above.

For every case record:

```text
recovered_exactly: true/false
recovered_within_interval: true/false
estimated_relative_error
number_of_observations
attack_time
attack_method
```

This turns “algebraic leak” from an anecdotal demo into a measurable security property.

---

# 20. Metrics

Do not evaluate SafeShare only with ordinary classifier F1.

## Detection metrics

- precision
- recall
- F1
- false positive rate
- false negative rate

## Privacy metrics

- exact secret recovery rate
- partial recovery rate
- posterior uncertainty reduction
- attack success rate
- average number of leaked constraints
- cross-turn reconstruction rate

## Utility metrics

- task success rate
- semantic similarity before/after sanitization
- answer completeness
- budget/table readability
- number of unnecessary redactions

## Performance metrics

- median latency
- P95 latency
- startup time
- model download size
- runtime RAM
- CPU usage
- battery impact if measurable

## Operational metrics

- browser compatibility
- failure recovery
- false-triggered tamper events
- watermark survival rate

---

# 21. Essential Baselines

At minimum compare:

```text
B0 = no privacy filter
B1 = regex only
B2 = contextual model only
B3 = regex + contextual model
B4 = regex + numeric heuristic
B5 = regex + contextual model + numeric heuristic
B6 = proposed provenance/constraint-aware system
```

The proposed architecture should demonstrate a measurable improvement over the simpler baselines.

Otherwise the complexity is not justified.

---

# 22. Ablation Study

Remove one component at a time:

```text
− heuristic layer
− contextual layer
− numeric parser
− provenance tracking
− constraint solver
− rewrite policy
```

Measure:

```text
privacy leakage
utility loss
latency
RAM
false positives
false negatives
```

The paper should be able to answer:

> Which component actually provides the security gain?

---

# 23. Recommended Research Direction to Investigate

The strongest candidate contribution to investigate is a **hybrid provenance-aware sanitizer** rather than a giant browser-side neural model.

Tentative structure:

```text
               INPUT / SECRET DISCOVERY
                        │
                        ▼
               Lightweight entity layer
                        │
                        ▼
               Secret registry / taint IDs
                        │
                        ▼
                 Numeric normalizer
                        │
                        ▼
            Symbolic / constraint graph
                        │
                        ▼
            Reconstructability analysis
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
         SAFE OUTPUT         REWRITE REQUIRED
                                   │
                                   ▼
                        Minimum-dependency masking
```

The model should not necessarily calculate everything.

A tiny contextual classifier can answer:

```text
Is this “3,000,000” likely personal salary data?
```

while a deterministic symbolic engine can answer:

```text
Is this “10.8 million” algebraically derived from the sensitive salary?
```

This separation of responsibilities is a key hypothesis to test.

---

# 24. Rewrite Policy Research

A major usability issue is that deleting every related number makes responses unreadable.

Investigate minimum-change transformations such as:

### Option A — Preserve ratios, hide absolute values

```text
Car savings: 30%
Monthly amount: [REDACTED]
Annual amount: [REDACTED]
```

### Option B — Preserve categories, remove all linked totals

```text
Car savings: [REDACTED]
Food: [REDACTED]
Transport: [REDACTED]
```

### Option C — Convert exact values to coarse bins

```text
Monthly salary: low income range
Savings: moderate monthly allocation
```

### Option D — Symbolic placeholders

```text
Monthly salary = S
Car savings = 0.30S
Annual savings = 3.6S
```

This may preserve utility while explicitly preventing concrete inversion.

The study must measure which strategy yields the best privacy/utility trade-off rather than assuming one is best.

---

# 25. Important Edge Cases

The engine must handle:

- rounding,
- approximate language,
- ranges,
- “about”, “roughly”, “around”,
- percentages that do not sum to 100%,
- multiple currencies,
- monthly vs annual values,
- inflation,
- compound interest,
- taxes,
- fees,
- loan principal vs balance,
- missing months,
- irregular payments,
- tables,
- charts represented as text,
- negative values,
- decimal separators,
- Indonesian and English mixed language.

Do not assume every numeric relation is exact.

The solver must support confidence / approximation where possible.

---

# 26. “Algebraic” Leak Taxonomy to Build

Propose a taxonomy and test each class:

```text
A1 — Direct linear inversion
A2 — Percentage inversion
A3 — Multi-period accumulation
A4 — Ratio inversion
A5 — Difference / residual inversion
A6 — Average / midpoint inversion
A7 — Compound-interest inversion
A8 — Loan / amortization inversion
A9 — Cross-table reconstruction
A10 — Multi-turn reconstruction
A11 — Mixed semantic + numerical inference
A12 — External-knowledge-assisted reconstruction
```

Add categories if literature suggests stronger terminology.

---

# 27. Security Claims That Need Especially Careful Verification

The AI CLI must explicitly audit these claims rather than repeating them:

1. **“Zero-knowledge”**
2. **“Post-decryption enclave”**
3. **“Active tamper guard”**
4. **“RAM is zeroed”**
5. **“F12 detection” is a security control**
6. **Invisible Unicode watermarking provides reliable tracing**
7. **URI fragment alone solves key secrecy**
8. **129 MB is a hard browser-extension practicality boundary**
9. **A <5 MB model can maintain high contextual PII accuracy**
10. **The exact algebraic attack terminology is established in academic literature**

For each claim produce one of:

```text
SUPPORTED
PARTIALLY SUPPORTED
IMPLEMENTATION-DEPENDENT
NOT SUPPORTED
NOT YET VERIFIED
```

And explain why.

---

# 28. Literature Search Requirements

Search **2024–2026 first**, while allowing older seminal papers when they establish essential foundations.

Prioritize:

- IEEE Symposium on Security and Privacy
- USENIX Security
- ACM CCS
- NDSS
- ACM / IEEE privacy venues
- PETS / PoPETs
- arXiv when peer-reviewed sources are unavailable
- IETF RFCs
- W3C specifications
- browser security documentation
- WebCrypto documentation
- official Cloudflare security / Workers / D1 documentation

Search terms should include combinations of:

```text
LLM privacy inference attack redacted text
LLM output privacy leakage
numerical inference attack language model
attribute inference language models
privacy leakage from derived values
provenance-aware data sanitization
information flow NLP
semantic taint tracking
PII detection lightweight transformer browser
browser-side NER WebAssembly
LLM privacy-preserving text transformation
constraint solving privacy leakage
symbolic reasoning privacy attack
cross-turn privacy inference LLM
shared conversation privacy links
zero knowledge client-side encrypted sharing
browser URI fragment security
Unicode invisible watermark robustness
```

Do not rely primarily on SEO articles, vendor marketing, or unsourced blogs when a primary academic/specification source exists.

---

# 29. Source Quality Rules

For every important factual statement, store:

```text
claim
source
publication date
venue / authority
URL / DOI / RFC number
exact supporting passage or section
why it is relevant
confidence
```

Separate:

```text
PROJECT CLAIM
EXTERNAL FACT
RESEARCHER INTERPRETATION
EXPERIMENTAL RESULT
HYPOTHESIS
```

Never fabricate a citation.

If a claim cannot be verified, mark it explicitly as unverified.

---

# 30. Expected Architecture Recommendation Format

The final research output should produce a table like:

| Component | Current Design | Identified Problem | Proposed Design | Security Effect | Utility Effect | Runtime Cost | Evidence |
|---|---|---|---|---|---|---|---|
| Entity detection | Regex + DistilBERT | Format bypass / large model | Hybrid lightweight detector | TBD | TBD | TBD | sources + benchmark |
| Numeric leakage | Regex algebra sweeper | brittle / substring collision | numeric AST + provenance graph | TBD | TBD | TBD | sources + benchmark |
| Encryption | AES-GCM + fragment key | endpoint/browser threats | hardened client protocol | TBD | neutral | low | standards |
| Viewer | “enclave” | browser is not hardware enclave | controlled viewing layer | TBD | TBD | TBD | browser security research |
| Anti-copy | clipboard decoy | easy bypass | deterrence + watermark | TBD | possible UX loss | low | experiment |
| Watermark | zero-width Unicode | normalization/copy stripping | robust provenance marker | TBD | low | low | experiment |
| F12 | DevTools trigger | not a reliable boundary | treat as telemetry/tamper signal | limited | UX risk | low | browser docs |

---

# 31. Required Experimental Prototype

Implement or specify a reference prototype for:

```text
Input text
  ↓
entity detection
  ↓
secret registry
  ↓
numeric extraction
  ↓
normalization
  ↓
provenance graph
  ↓
constraint graph
  ↓
reconstructability check
  ↓
minimum-change rewrite
  ↓
privacy attack benchmark
```

The implementation should prioritize determinism, explainability, and low client cost.

---

# 32. Suggested Data Structures

Example secret registry:

```ts
interface SensitiveFact {
  id: string;
  valueClass: string;
  normalizedValue?: string;
  confidence: number;
  sourceSpan: [number, number];
}
```

Example numeric node:

```ts
interface NumericNode {
  id: string;
  value: number | Interval;
  unit?: string;
  sourceSpan: [number, number];
  provenance: string[];
}
```

Example constraint:

```ts
interface Constraint {
  expression: ASTNode;
  variables: string[];
  confidence: number;
  sourceSpan: [number, number];
}
```

The CLI should adapt these structures to the actual repository rather than blindly copying them.

---

# 33. Privacy-Preserving Rewrite Objective

Investigate an optimization problem such as:

```text
minimize:
    information leaked about sensitive facts
    + utility loss
    + number of rewritten tokens
    + runtime cost

subject to:
    exact reconstruction attack success ≤ threshold
```

Potential objective form:

```text
score = λ1 * privacy_loss
      + λ2 * utility_loss
      + λ3 * edit_distance
      + λ4 * latency
```

Do not present this as a validated mathematical model until experiments and literature justify the formulation.

---

# 34. Research Deliverables

The AI CLI should ultimately return:

## Deliverable A — Literature Review

At least:

- 15 high-quality sources,
- preferably 5+ from major security/privacy venues,
- primary standards for cryptography/browser behavior,
- clear 2024–2026 focus.

## Deliverable B — Threat Model

A formal attacker/asset/trust-boundary table.

## Deliverable C — Architecture Redesign

A concrete revised SafeShare architecture.

## Deliverable D — Experimental Plan

Reproducible dataset, attacks, baselines, ablations, metrics.

## Deliverable E — Prototype Specification

File/module-level design appropriate for the existing repository.

## Deliverable F — Paper Contribution Statement

State:

```text
What is novel?
What is merely engineering?
What is reproduced from prior work?
What is the measurable contribution?
```

## Deliverable G — Conference Demo Narrative

Explain how the demo should visually demonstrate:

```text
secret input
→ naive redaction
→ algebraic reconstruction attack
→ SafeShare detection
→ rewritten safe output
→ attack fails
```

The demo should be reproducible without requiring proprietary infrastructure.

---

# 35. Black Hat / Arsenal Positioning Research

Investigate what a strong live security tool submission normally demonstrates.

Do not claim the project will be selected.

Instead determine:

- what makes the demo technically novel,
- whether it is interactive,
- whether the attack/defense story is understandable in 5–10 minutes,
- what evidence of real-world relevance is expected,
- whether the tool is installable and reproducible,
- whether the project needs an offensive companion demo.

Possible narrative:

```text
Problem:
“Redaction can fail even when the secret string is gone.”

Attack:
“LLM output preserves enough equations to recover the secret.”

Defense:
“SafeShare tracks provenance and blocks reconstructive outputs.”

Evidence:
“Measured attack success drops from X% to Y% while utility decreases only Z%.”
```

Do not use X/Y/Z until experimentally measured.

---

# 36. Paper Contribution Candidates

The CLI should evaluate whether the strongest research contribution is one or more of:

### Candidate C1 — Reconstructability-aware text sanitization

A formal framework for detecting when derived LLM output still determines a redacted secret.

### Candidate C2 — Provenance-aware algebraic privacy guard

A lightweight client-side architecture combining contextual detection with symbolic dependency analysis.

### Candidate C3 — Browser-efficient privacy defense

A hybrid model/algorithm stack under a strict client resource budget.

### Candidate C4 — Benchmark

A reproducible dataset of direct, algebraic, semantic, and cross-turn reconstruction attacks.

The final paper should ideally demonstrate that the contribution is more than combining known libraries.

---

# 37. Things NOT to Do

Do NOT:

- claim regex can solve all privacy leakage;
- claim every derived number is sensitive;
- censor every number indiscriminately;
- equate model F1=1.0 on a project test split with real-world robustness;
- use differential privacy without defining the privacy model;
- call browser JavaScript a hardware enclave;
- call F12 detection a reliable security boundary;
- claim JavaScript can guarantee RAM destruction;
- claim invisible Unicode guarantees copy prevention;
- assume URI fragments make an application immune to XSS or endpoint compromise;
- use “zero-knowledge” as marketing language without a threat-model definition;
- assume a 5 MB model is inherently more secure or more efficient without benchmark data;
- treat an individual real-world case as sufficient evidence of generality.

---

# 38. Specific Audit of Existing Evaluation Claims

The blueprint currently reports:

```text
Precision: 1.0
Recall: 1.0
F1: 1.0
Test Loss: 0.00032
ONNX INT8 size: 128.89 MB
Inference latency: 6.53 ms
Dataset: 62,000 samples
```

These are **project-reported values** and must be independently audited.

Required audit questions:

1. How was train/validation/test splitting performed?
2. Is there template leakage across splits?
3. Are near-duplicate samples present?
4. Was the test set generated using the same templates as training?
5. Are names / entities held out by identity?
6. Are formatting variants held out?
7. Are domains held out?
8. Was multilingual generalization measured cross-language?
9. Was adversarial paraphrasing tested?
10. Was prompt injection / adversarial formatting tested?
11. Is latency measured warm or cold?
12. Does 6.53 ms include tokenizer overhead?
13. Does 129 MB describe downloaded file size or memory footprint?
14. What browser/device was used?
15. What is P95/P99 latency?

The CLI should produce a **reproducibility audit checklist** for every metric.

---

# 39. Recommended Immediate Build Order

Implement in this order unless repository constraints suggest otherwise:

```text
Phase 1
───────
Create adversarial reconstruction benchmark.

Phase 2
───────
Build numeric normalization + AST.

Phase 3
───────
Attach provenance IDs to sensitive facts.

Phase 4
───────
Build constraint graph + reconstructability detector.

Phase 5
───────
Implement minimum-change rewrite strategies.

Phase 6
───────
Benchmark hybrid detector against current regex + DistilBERT pipeline.

Phase 7
───────
Harden cryptographic/viewer assumptions.

Phase 8
───────
Perform browser adversarial testing.

Phase 9
───────
Package reproducible demo + paper artifacts.
```

The order is intentional: **prove the novel security problem first**, then optimize the implementation.

---

# 40. Expected CLI Research Output

Produce the final answer in this exact high-level structure:

```text
# Executive Verdict

# 1. What the Blueprint Gets Right

# 2. Claims That Are Incorrect / Overstated / Unverified

# 3. State of the Art (2024–2026)

# 4. Algebraic Reconstruction Defense

# 5. Lightweight Browser NLP Architecture

# 6. Cryptography / URI Fragment Audit

# 7. Viewer / Post-Decryption Security Audit

# 8. Watermark / Traitor Tracing Audit

# 9. Threat Model

# 10. Proposed SafeShare v2 Architecture

# 11. Dataset

# 12. Attack Generator

# 13. Metrics

# 14. Baselines

# 15. Ablation Study

# 16. Prototype Implementation Plan

# 17. Paper Contribution

# 18. Conference Demo Plan

# 19. 30/60/90-Day Roadmap

# 20. References
```

For every major recommendation include:

```text
why
security benefit
usability cost
computational cost
implementation difficulty
evidence
```

---

# 41. Final Instruction to the AI CLI

You are acting as a **security researcher, browser security engineer, privacy engineer, and academic reviewer**.

Do not optimize for making SafeShare sound impressive.

Optimize for:

```text
technical correctness
measurable security improvement
reproducibility
minimal unsupported claims
clear threat boundaries
academic novelty
practical implementation
```

When a proposed feature is weak, say so and explain what measurable role it can still play.

When an idea is promising but unproven, label it as a hypothesis.

When literature contradicts the current design, preserve the contradiction explicitly instead of silently rewriting the project history.

When current sources are unavailable, state the limitation rather than fabricating evidence.

The final goal is not “more security layers.”

The goal is to determine whether SafeShare can provide a **measurable reduction in direct and inferential privacy leakage from AI-generated conversation content, under a clearly defined browser threat model, with acceptable utility and resource overhead.**

---

# Appendix A — Source Map From Current Blueprint

Use the supplied `BLUEPRINT_SAFESHARE_DEFENSE.md` as the primary project-source reference.

Key sections:

- Project identity and outputs: lines 1–7
- Problem statement: lines 31–41
- Six-tier architecture: lines 45–70
- Component specifications: lines 73–87
- Real-world case study: lines 91–128
- Five observed failures: lines 131–155
- Architectural bottlenecks: lines 157–170
- Research questions: lines 175–191
- Technical environment and reported metrics: lines 196–208
- AI consultation template: lines 212–224

These line references refer to the supplied project file and should be cross-checked against the actual file during any formal citation workflow.

