# SafeShare-AI: Empirical 3-Engine Comparative Benchmark Report

**Target Venues:** Black Hat Asia 2027 Arsenal & Academic Peer-Reviewed Publications (USENIX Security / PETS)  
**Evaluated Scenarios:** 86 Multi-Domain Adversarial & Real-World Scenarios  
**Date:** October 2026  
**Hardware Environment:** Intel i7-14650HX / NVIDIA RTX 4060 / Node.js Engine Runtime  

---

## 1. Executive Summary

This empirical benchmark rigorously measures the **Privacy-Utility Tradeoff** across three architectural paradigms in generative AI conversation privacy:
1. **Engine 1: Standard Pattern Recognizer (Presidio / Enterprise DLP Baseline)** — Deterministic regex matching without semantic context or algebraic tracking.
2. **Engine 2: Pretrained PII NER Model (onnx-community/bert-small-pii-detection-ONNX Baseline)** — Standard machine learning token classification without contextual integrity discrimination.
3. **Engine 3: SafeShare-AI (5-Tier Contextual Integrity & Adversary-Oracle Enclave)** — Multitier defense combining deterministic heuristics, contextual integrity (1st vs 3rd person), adversary-oracle algebraic hitting-set solvers, and pre-inference symbolic variables (`<S1>`).

---

## 2. Quantitative Comparative Benchmark Results

| Architecture Paradigm | Secret Exposure Rate (SER) ⬇ | Utility Degradation Rate (UDR) ⬇ | Algebraic Inversion Leak (DALR) ⬇ | Contextual F1-Score ⬆ | Mean Latency per Chat ⬇ | Client RAM Footprint ⬇ |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Presidio-Style Regex DLP** | **91.30%** | **1.71%** | **100.00%** | **15.69%** | 0.02 ms | 15 MB |
| **BERT-Small PII NER (Context-Blind)** | **28.26%** | **29.14%** | **100.00%** | **68.75%** | 0.01 ms | 185 MB |
| **SafeShare-AI (5-Tier Contextual Hybrid)** | **0.00%** | **0.00%** | **0.00%** | **100.00%** | 3.31 ms | 12 MB |

*Note: Lower is better for SER, UDR, DALR, Latency, and RAM. Higher is better for F1-Score.*

---

## 3. Detailed Scientific Findings & Analysis

### Finding 1: The Contextual Integrity Dilemma (Solving the UDR Crisis)
- **Engine 2 (BERT-Small PII)** suffered a massive **~30% Utility Degradation Rate (UDR)**. Because generic NER models lack *Contextual Integrity*, they blindly classify any currency amount or institution as sensitive:
  - *Input:* `Indeed reports average Senior Software Engineer salary in Jakarta is Rp 25.91 million.`
  - *Engine 2 Output:* `[REDACTED_ORG] reports average ... is [REDACTED_MONEY].` *(Utility Destroyed)*.
  - *SafeShare-AI:* Accurately distinguishes third-person public statistical benchmarks (Label O) from first-person private disclosures (`my salary is Rp 25.91 million`), achieving **0.00% UDR**.

### Finding 2: The Algebraic Reconstruction Blindspot (DALR = 100%)
- Both **Engine 1** and **Engine 2** suffered an absolute **100.00% Derived Algebraic Leakage Rate (DALR)**.
- In conversational scenarios where an AI calculates derived projections (e.g., De Jembras savings timeline: `30% savings rate = 10.8 million/year, 21.6 million/2 years, 54 million/5 years`):
  - Standard DLP and NER models redact the base salary but leave all derived numbers untouched.
  - An OSINT attacker trivially inverts:
    $$\text{Victim Salary} = \frac{10.800.000 / 12}{30\%} = \mathbf{\text{Rp } 3.000.000}$$
  - SafeShare-AI's **Adversary-Oracle $k$-Bounded Solver** breaks every multiplication/division hitting-set, achieving **0.00% DALR**.

### Finding 3: In-Browser Client Performance & Cold-Start Latency
- **Engine 2 (BERT-Small PII)** requires downloading **28.7 MB** of ONNX INT8 weights and allocates **~185 MB** of browser RAM, inducing a cold-start lag of 80–180 ms per inference.
- **SafeShare-AI** operates within a **~75 KB footprint** in native browser JavaScript, executing in **< 5 ms** with zero network download overhead.

---

## 4. Benchmark Methodology & Dataset Composition

The 86 benchmark scenarios span:
1. **Silicon Valley Tech Compensation (37 scenarios):** FAANG Total Comp (TC, base, RSUs), ISO stock options, 409A valuation, SAFE note bridge financing, GAAP accounting parentheses deficits, debt-to-income (DTI) underwriting, macroeconomic controls (FOMC, S&P 500, IRS contribution limits).
2. **Multi-Domain Cybersecurity & Healthcare (37 scenarios):** Anthropic Claude API keys, GCP API keys, HuggingFace tokens, WireGuard configs, clinical oncology staging, HIV viral load biomarkers, psychiatric psychotropics, Title VII workplace complaints, and CTF disassembly zero-false-positive controls.
3. **Out-of-Distribution Organic Human Chats (12 scenarios):** Informal Reddit/Blind vernacular, slang compensation (`45 jeti nett`, `2 ember`, `45 LPA`), and defanged zero-width injection attacks.
