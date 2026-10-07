# AI Chat Privacy & Security Research — Working Brief

Compiled research notes: shared-link exposure, remediation/decay tracking, agent-to-agent leakage,
and cross-user "idea leakage." Intended as a starting brief to dig deeper with your own tools / AI CLI.

---

## 1. Core Problem Statement

Across nearly every major consumer AI chat/agent product, a "share this conversation" feature has
repeatedly produced **public, search-engine-indexable pages containing private conversation content**,
sometimes including PII, credentials, and sensitive personal disclosures. This has recurred across
independent vendors over roughly 2023–2026, including the vendor with the strongest safety branding.
No vendor has shipped a structural fix — only reactive, inconsistent patches (removing the
"discoverable" checkbox, adding `noindex` after the fact). The underlying design tension — a shareable
link is, by definition, an unauthenticated public URL — has not actually been resolved by any vendor.

**Working thesis:** this is a systemic, cross-vendor problem with no current fixed solution, driven by
a structural conflict between "convenient sharing" and "no public exposure," not by isolated bugs.

---

## 2. Two Research Threads

### Thread A — Shared-Link Exposure, Cross-Vendor Measurement & Remediation/Decay
How often do shared AI conversations leak publicly, across which vendors, how severe is the exposure,
and — critically — once a vendor claims to have fixed/removed a leaked link, does the content actually
disappear from search indexes and web archives, and how long does that take?

### Thread B — "Idea/Content Leakage" Across Users and Sessions
Separate from link-sharing: can content from one user's conversation surface to a *different* user
later? This is not one mechanism — it's at least four distinct channels, each needing a different test:
1. Backend/infrastructure bugs (proven to happen)
2. Model memorization of training data (testable, but slow/statistical)
3. Within-product conversation-history leakage (same user, different session)
4. Agent-to-agent / shared-infrastructure leakage in multi-agent systems (newest, least studied)

---

## 3. Evidence Base — Incident Timeline (Thread A)

| Date | Vendor | What happened |
|---|---|---|
| 2023 | Google Bard | Chat indexing exposed via search (earliest known case in this pattern) |
| Mar 20, 2023 | OpenAI (ChatGPT) | Redis client bug (CVE-2023-28858 / CVE-2023-28859) — some active users briefly saw other users' chat titles; ~1.2% of ChatGPT Plus subscribers had another user's name/email/partial payment info exposed for a ~9hr window. **Infra bug, not a share-link or memorization issue — but the clearest real precedent for "person B saw my stuff."** |
| Dec 2024 | WotNot (chatbot provider) | ~340,000 private chat logs exposed via an unprotected cloud storage system |
| 2025 | OpenAI (ChatGPT) | "Make conversation discoverable" checkbox led to ~4,500 (some estimates 100,000+) conversations indexed by Google — mental health disclosures, resumes, proprietary code, passport data. OpenAI called it a "short-lived experiment" and removed the feature entirely. **Deleting the original chat does NOT delete the shared URL page — must be manually revoked.** |
| Aug 2025 | xAI (Grok) | Share feature created public URLs with **no `noindex` tag and no user warning at all** — 300,000–370,000+ conversations indexed by Google/Bing/DuckDuckGo, including medical/psychological content, business details, at least one password. `noindex` added only *after* the incident. Some SEO operators deliberately exploited the indexing loophole to rank content. |
| Feb 2026 | (industry comparison snapshot) | Cross-vendor comparison shows **no consistent fix**: Meta AI's Discover feed publishes shared conversations publicly **by design, intentionally, with no plans to change**; Google Gemini explicitly creates a "public link" anyone can view/reshare/continue (blocked only for Workspace/enterprise accounts); Grok's fix was reactive `noindex` only. |
| Jul 2026 | DeepSeek | Same pattern recurs: `site:chat.deepseek.com/share` exposed conversations; no warning given that "Share link" meant search visibility. |
| Jul 2026 | Anthropic (Claude) | Shared Claude chats appeared in search results too. Anthropic's stated position (via TechCrunch): it did not submit a sitemap of shared chats to Google, and URLs are not guessable/discoverable unless a user shared them — indicating crawlers can independently discover "public but unlisted" URLs. Anthropic explicitly warned that third parties may archive public pages regardless of vendor action. |

**Key structural point:** `noindex` only stops search-engine *listing*. It does not require authentication,
so the page is still publicly reachable, copyable, screenshot-able, and independently archivable by anyone
with the URL — including web crawlers that never got the URL from the vendor. Authentication is the only
control that actually closes this, and no vendor requires it for shared links (that would defeat the
point of a "share via link" feature).

---

## 4. Related Work by Mechanism

### 4a. PII frequency in donated/leaked chat datasets (static, retrospective)
- Study of ShareGPT52K using Microsoft Presidio → subset (~tens of thousands) of conversations flagged
  with detectable PII; PII removed/anonymized before any release, out of ethical caution even though the
  source dataset was already public.
- "Trust No Bot" — PII taxonomy study on the WildChat dataset: what kinds of sensitive info people share,
  how often, in what task contexts.
- Broader literature reviews cataloguing LLM privacy threat categories (memorization, inference attacks,
  agent-specific leakage) — taxonomic, not measurement-based.

### 4b. User perception / mental models
- CHI 2026 paper: users are largely unaware of the actual attack surface (e.g., don't know few-shot
  prompting can be used for PII extraction), and underestimate risk of PII sitting on public pages.

### 4c. Model memorization / training-data extraction (Thread B, channel 2)
- Carlini et al., **"The Secret Sharer"** (2019) — canary-insertion methodology for measuring unintended
  memorization.
- Carlini et al., **"Extracting Training Data from Large Language Models"** (2021) — demonstrated
  verbatim extraction of training examples (including PII) via query access alone.
- **"Quantifying Memorization Across Neural Language Models"** (2022) — scaling-law relationship between
  model size and memorization.
- **"Position: Privacy Is Not Just Memorization!"** — position paper arguing LLM privacy failure modes
  extend beyond memorization (contextual integrity, inference attacks). *(verify current arXiv link
  yourself — not fully confirmed in this session.)*

### 4d. Within-product conversation history leakage (Thread B, channel 3)
- **"Reconstruct Your Previous Conversations!"** (arXiv 2402.02987) — tests whether GPT-style models can
  be prompted to leak fragments of a user's own earlier conversations.

### 4e. Multi-agent / agent-to-agent leakage (Thread B, channel 4 — newest, least covered)
- **"AgentLeak"** (~Feb 2026) — full-stack benchmark for privacy leakage in multi-agent LLM systems.
  Key finding: inter-agent messages leaked sensitive data in **68.8%** of cases vs. **27.2%** for final
  user-facing outputs — meaning output-only privacy audits miss roughly **42%** of actual violations,
  because sensitive content flows unfiltered through shared memory / inter-agent channels nobody audits.
  *(verify exact arXiv ID yourself — not fully confirmed in this session.)*
  **Important scope note:** AgentLeak measures leakage *within one task*, across agents working for the
  *same* user. It does NOT test cross-user, cross-session leakage — that gap is still open (see §5).

---

## 5. Identified Gaps (what nobody has published yet)

1. **No continuous, cross-vendor exposure instrument.** Every incident above was a one-time discovery by
   a journalist or independent researcher, not a repeatable, ongoing measurement across vendors.
2. **No remediation/decay latency research.** When a vendor "fixes" this, does content really disappear —
   from live search indexes, from Bing/DuckDuckGo, from the Wayback Machine, from third-party mirrors?
   Nobody has measured time-to-deindex or completeness of removal.
3. **No agent-specific exposure study for cross-user leakage.** All current PII-frequency work is about
   plain-text conversation content. Agentic sessions can leak far more dangerous artifacts — API keys,
   tool outputs, code with secrets, credentials embedded in agent traces — and this is barely studied.
4. **AgentLeak-style leakage has not been extended to the cross-user axis.** Shared team/org
   infrastructure (shared MCP servers, vector-store memory, custom GPTs/"Projects," tool caches) could
   plausibly leak content from one user's session into another user's session — analogous to the 2023
   OpenAI Redis bug, but at the agent-memory layer instead of the caching layer. This appears to be
   unclaimed research territory as of this brief.
5. **No standardized severity/risk scoring** comparable across platforms (some vendors treat this as
   intentional-by-design, e.g. Meta AI; others treat it as an incident to patch).

---

## 6. Proposed Tool / Methodology Architecture

### 6a. Cross-vendor exposure crawler (Thread A)
- Fingerprint each vendor's share-URL pattern (e.g. `chatgpt.com/share/...`, Grok/Gemini/Claude/DeepSeek
  equivalents); note default indexability, opt-in/opt-out UX, and whether a warning is shown to users.
- Periodic `site:` search-engine queries per pattern → indexed-count time series per vendor.
- Use the **Wayback Machine CDX API** (public, documented) to query archive capture history per URL
  pattern without bulk scraping — gives a clean way to measure "how long did this stay archived after
  removal."
- On finding exposed content: log **metadata only** (URL, timestamp, index status, rough PII category) —
  do not bulk-download conversation content. File a real takedown request (Google URL removal tool,
  Bing's equivalent, Internet Archive's manual exclusion process) and track resolution time. This turns
  the tool into a genuine **remediation-latency study**, not just a leak-finder.
- Precedent for this kind of design: takedown-time measurement methodology from phishing/malware URL
  research — adapt that framework rather than inventing one from scratch.

### 6b. "Time-bomb" / ephemeral share-link reference design
- Only fully enforceable on infrastructure you control (i.e., as a proposed spec/prototype for vendors,
  not as something you can retroactively apply to their live links).
- Components: signed URLs with short TTL, `Cache-Control: no-store`, `X-Robots-Tag: noindex, noarchive`,
  hard server-side deletion at expiry.
- Hard limit to document explicitly in the paper: once a page has been crawled, cached, screenshotted,
  or scraped by a third party, no mechanism guarantees full removal. Frame the contribution as
  **minimizing the exposure window**, not guaranteeing erasure — same caveat GDPR "right to erasure"
  research runs into.
- Wayback-specific note: retroactive removal from the Wayback Machine is triggered via `robots.txt` set
  by the **domain owner** — a third party cannot invoke this for someone else's domain.

### 6c. Cross-user idea-leakage test battery (Thread B)
- **Channel 1 (infra bugs):** retrospective incident analysis using the 2023 OpenAI Redis case as the
  template; build a taxonomy of what classes of bugs cause cross-user bleed.
- **Channel 2 (training memorization):** canary-insertion methodology adapted from Carlini's "Secret
  Sharer," run at black-box query level against opted-in training pipelines where feasible.
- **Channel 3 (within-product history leakage):** replicate/extend the "Reconstruct Your Previous
  Conversations!" methodology.
- **Channel 4 (agent-to-agent, cross-user):** extend AgentLeak's channel taxonomy (inter-agent messages,
  shared memory, tool arguments) from *intra-task* to *cross-user, same-org, shared-agent-backend*
  scenarios — this is likely your strongest single novel contribution.

---

## 7. Threat-Model Notes (from side discussion — keep for completeness, low priority)

- **"Live tracking" of new shared links:** not exotic — search-engine indexing itself is already a live
  discovery mechanism (`site:` queries, alerts). This should be treated as the *measurement method*
  (§6a), not framed as an attack.
- **Brute-forcing share-link IDs:** depends entirely on ID entropy.
  - Short/sequential IDs → classic IDOR vulnerability, trivially enumerable, no special compute needed.
    Worth checking each vendor's ID scheme as part of the audit.
  - Proper random tokens (e.g. UUIDv4, ~122 bits) → classically infeasible.
  - "Quantum brute force" is not a credible near-term threat here: Grover's algorithm gives only a
    *quadratic* speedup (roughly halves effective bit-strength, e.g. 122-bit → ~61-bit equivalent
    effort), not exponential — and no existing or near-term hardware has anywhere near the
    error-corrected logical qubits needed to run it over a space that size. Not worth including as a
    real threat vector; ID-entropy auditing is the grounded version of this concern.
- **"Scrape credentials":** what actually gets exposed is not platform login credentials, but secrets a
  *user* pasted into a chat (API keys, passwords) — an incidental-exposure category, distinct from a
  platform breach. Worth its own line in the severity taxonomy.

---

## 8. Ethical / Legal Guardrails (do not skip in the paper's methodology section)

- Do not bulk-download or store raw conversation content beyond what's needed to demonstrate a pattern —
  aggregate stats and hashed/redacted examples only.
- Disclose findings to vendors before publication; follow responsible/coordinated disclosure norms, not
  an adversarial "blackhat" framing — both for credibility and because the underlying data is still real
  people's private information even when technically public.
- Any ID-entropy/enumeration testing should be done against your own throwaway test accounts/links, never
  by iterating against real strangers' shared chats.
- If academic, consider IRB / ethics review given the human-subjects-adjacent nature of the data.

---

## 9. Suggested Paper Framing

Two tightly linked contributions rather than one sprawling scope:
1. **A cross-vendor exposure + remediation-latency measurement tool** (Thread A, §6a/§6b).
2. **A cross-user leakage channel taxonomy + canary-based memorization test for agentic systems**
   (Thread B, §6c), explicitly positioned as extending AgentLeak from intra-task to cross-user scope.

Working title idea: *"From Link Leaks to Weight Leaks: Measuring the Confidentiality Surface of
Conversational AI Agents."*

---

## 10. Open Next Steps (for you, with your own tools / AI CLI)

- [ ] Verify exact arXiv IDs for AgentLeak and the "Position: Privacy Is Not Just Memorization!" paper.
- [ ] Pull each target vendor's current share-URL pattern and check ID entropy (§7).
- [ ] Prototype the CDX API query script for one vendor as a proof of concept before scaling to all.
- [ ] Draft the takedown-request tracking log schema (URL, first-seen, report-filed, resolved timestamp).
- [ ] Decide scope: full paper covering both threads, or split into two publications.
