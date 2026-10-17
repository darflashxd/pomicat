/**
 * SafeShare-AI — Modal Controller (Calm Security with User-Controlled Redaction)
 * Coordinates the 3-Tier Redaction Pipeline, Granular Customization Engine,
 * and end-to-end encrypted sharing flow.
 */

const SS_CATEGORIES = {
  CREDENTIALS: { id: "CREDENTIALS", label: "Credentials", icon: "🔑", color: "#f43f5e" },
  FINANCIAL: { id: "FINANCIAL", label: "Financial & Salary", icon: "💳", color: "#10b981" },
  GOV_ID: { id: "GOV_ID", label: "Gov & Academic IDs", icon: "🆔", color: "#3b82f6" },
  PROFILE: { id: "PROFILE", label: "Contact & Profile", icon: "👤", color: "#8b5cf6" },
  HEALTH: { id: "HEALTH", label: "Health & Medical", icon: "🏥", color: "#ec4899" },
  SYSTEM: { id: "SYSTEM", label: "System & Shell", icon: "💻", color: "#eab308" },
  CUSTOM: { id: "CUSTOM", label: "User Added", icon: "✏️", color: "#6366f1" }
};

class SafeShareModal {
  constructor() {
    this.heuristics = new HeuristicsRedactor();
    this.contextual = new ContextualClassifier();
    this.pseudonymizer = new ConsistentPseudonymizer();
    this.crypto = new SafeShareCrypto();
    this.maybe = typeof SafeShareMaybe !== "undefined" ? SafeShareMaybe : require("../engine/maybe.js");
    this.transcript = typeof SafeShareTranscript !== "undefined" ? SafeShareTranscript : require("../engine/transcript.js");
    this.maybeChoices = new Map();
    this.maybeCandidates = [];
    this.customSelections = new Map();
    this.customCounter = 0;
    this.publishing = false;
    this.hardEntities = new Map();
    this.modelReview = new Map();
    this.modelState = "Not checked — credential rules only";
    this.modelBusy = false;
    this.reviewGeneration = 0;

    this.currentTurns = [];
    this.candidates = [];
    this.activeCategories = new Set(Object.keys(SS_CATEGORIES));
    this.isInspectorOpen = false;

    this.sanitizedTurns = [];
    // Who will read the link: "public" removes your own numbers and names too; "trusted" keeps
    // them and removes only IDs, keys, cards and contacts. Numbers: "remove" or "range".
    this.profile = "public";
    this.numbersMode = "remove";
    this.loadPreferences();
  }

  loadPreferences() {
    try {
      if (localStorage.getItem("safeshare_profile") === "trusted") this.profile = "trusted";
      if (localStorage.getItem("safeshare_numbers") === "range") this.numbersMode = "range";
    } catch (_) {}
    try {
      const saved = localStorage.getItem("safeshare_active_categories");
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length > 0) {
          this.activeCategories = new Set(arr);
        }
      }
    } catch (_) {}
  }

  savePreferences() {
    try {
      localStorage.setItem("safeshare_active_categories", JSON.stringify(Array.from(this.activeCategories)));
    } catch (_) {}
  }

  extractTag(replacement) {
    if (!replacement) return "";
    const m = String(replacement).match(/\[(?:REDACTED|CONFIDENTIAL|INTERNAL|HR|User|ANONYMIZED)_[A-Z0-9_]+\]/);
    return m ? m[0] : replacement;
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Initializes and opens the SafeShare modal with extracted conversation turns.
   */
  financialLeakLabel(raw) {
    const value = this.pseudonymizer.parseFinancialValue(raw);
    let candidate = this.candidates.find(c => c.isAmount &&
      !c.raw.startsWith("[") && this.pseudonymizer.parseFinancialValue(c.raw) === value);
    if (!candidate) {
      candidate = { id: `c_${this.candidates.length}`, raw, fullRaw: raw, role: "assistant", turnIndex: -1,
        category: "FINANCIAL", categoryLabel: "Financial & Salary", ruleName: "Derived Math Calculation",
        enabled: true, isAlgebraic: true, isAmount: true, occurrences: 1 };
      this.candidates.push(candidate);
    }
    // One stable tag per value; shared BUDGET tags cannot identify a click target.
    if (candidate.isAlgebraic || !candidate.tag) candidate.tag = `[REDACTED_DERIVED_${candidate.id.slice(2)}]`;
    candidate.replacement = candidate.tag;
    return candidate.tag;
  }

  hardLabel(det) {
    const raw = this.heuristics.normalizeHomoglyphs(det.secretToken || det.raw).trim().toLowerCase();
    const base = this.extractTag(det.replacement);
    if (!/^\[REDACTED_/.test(base)) return null;
    const family = /RECORD|ACCOUNT/.test(base) ? "ACCOUNT" : base.slice(10, -1);
    let identity = raw;
    if (family === "CARD_EXPIRY") {
      const numeric = /^(\d{2})[/-](\d{2}|\d{4})$/.exec(raw);
      const words = /^([a-z]+)\s+(20\d{2})$/.exec(raw);
      const months = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
      if (numeric) identity = `${numeric[1]}/${numeric[2].slice(-2)}`;
      else if (words) identity = `${String(months.indexOf(words[1].slice(0, 3)) + 1).padStart(2, "0")}/${words[2].slice(-2)}`;
    }
    const key = `${family}::${identity}`;
    if (!this.hardEntities.has(key)) this.hardEntities.set(key, `[REDACTED_${family}_${this.hardEntities.size + 1}]`);
    return this.hardEntities.get(key);
  }

  open(turns) {
    this.removeExisting();
    this.customSelections.clear();
    this.customCounter = 0;
    this.currentTurns = turns.map(({ role, content }) => ({ role, content: this.transcript.normalize(content) }));

    const backdrop = document.createElement("div");
    backdrop.id = "safeshare-modal-backdrop";
    backdrop.innerHTML = `
      <div id="safeshare-modal-card">
        <div class="safeshare-header">
          <div class="safeshare-brand">
            <div class="safeshare-logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div class="safeshare-title">Share Privately</div>
              <div class="safeshare-version-tag">End-to-end encrypted</div>
            </div>
          </div>
          <button class="safeshare-close-btn" id="safeshare-close-btn" aria-label="Close modal">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Protection Summary Card -->
        <div class="safeshare-summary-card">
          <div class="summary-left">
            <div class="summary-icon-wrap" id="summary-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <div class="summary-title" id="summary-title">Scanning conversation...</div>
              <div class="summary-subtitle" id="summary-subtitle">${turns.length} messages ready</div>
            </div>
          </div>
          <div class="summary-chips" id="summary-chips"></div>
          <!-- Hidden compatibility elements for automated audit scripts -->
          <span id="stat-turns" style="display:none;">${turns.length}</span>
          <span id="stat-hard-secrets" style="display:none;">0</span>
          <span id="stat-contextual" style="display:none;">0</span>
        </div>

        <!-- Customizable Policy & Category Control Bar -->
        <div class="safeshare-policy-bar">
          <div class="policy-bar-left">
            <span class="policy-label">Policy Categories:</span>
            <div class="policy-pills-list" id="policy-pills-list"></div>
          </div>
          <div class="policy-mode-group">
            <label class="policy-label" for="safeshare-profile">Reader</label>
            <select id="safeshare-profile" class="policy-select" title="Public: also removes your own numbers and names. Trusted: keeps them, removes only IDs, keys, cards and contacts.">
              <option value="public">Anyone with the link</option>
              <option value="trusted">Someone I trust</option>
            </select>
            <label class="policy-label" for="safeshare-numbers">Amounts</label>
            <select id="safeshare-numbers" class="policy-select" title="Range shows your amounts as a band like Rp 2–5 juta; derived figures stay removed.">
              <option value="remove">Remove</option>
              <option value="range">Show as range</option>
            </select>
          </div>
          <button class="btn-toggle-inspector" id="btn-toggle-inspector" title="Customize detected items individually">
            <span class="inspector-gear-icon">⚙️</span>
            <span id="inspector-btn-text">Customize Items</span>
            <span class="inspector-arrow-icon" id="inspector-arrow-icon">▼</span>
          </button>
        </div>

        <!-- Collapsible Entity Inspector Drawer -->
        <div class="safeshare-inspector-drawer" id="safeshare-inspector-drawer" style="display: none;">
          <div class="inspector-drawer-header">
            <div class="drawer-header-left">
              <span class="drawer-title">Detected Sensitive Items</span>
              <span class="drawer-counter" id="drawer-counter">0 items</span>
            </div>
            <div class="drawer-header-actions">
              <button class="btn-drawer-action" id="btn-select-all-cands">Protect All</button>
              <button class="btn-drawer-action" id="btn-deselect-all-cands">Unprotect All</button>
            </div>
          </div>
          <div class="inspector-items-container" id="inspector-items-container"></div>
        </div>

        <div class="safeshare-body" id="safeshare-review-view">
          <!-- Direct Side-by-Side Comparison Grid -->
          <div class="direct-comparison-grid">
            <div class="comparison-col">
              <div class="comparison-col-header">
                <div class="col-title">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>Original (Raw Input)</span>
                </div>
              </div>
              <div class="diff-box" id="diff-box-orig"></div>
            </div>

            <div class="comparison-col">
              <div class="comparison-col-header">
                <div class="col-title col-title-sanitized">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>Share preview — review before publishing</span>
                </div>
                <span class="hint-badge">💡 Click any badge to toggle</span>
              </div>
              <div class="diff-box diff-box-interactive" id="diff-box-sanitized"></div>
              <p class="ss-review-warning">Ranges are approximate, not exact equations. Revealing amounts can expose other hidden values through arithmetic. Review before sharing.</p>
            </div>
          </div>

          <details id="safeshare-maybe-review" open>
            <summary>Maybe sensitive — review before sharing</summary>
            <p>These are unverified suggestions, not a guarantee that every secret was found. Checked values are hidden in every occurrence.</p>
            <div id="safeshare-maybe-items"></div>
          </details>

          <!-- Link Settings -->
          <div class="safeshare-options-row">
            <div class="options-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>Expires after:</span>
            </div>
            <select class="select-dropdown" id="safeshare-ttl">
              <option value="86400">24 Hours</option>
              <option value="259200">3 Days</option>
              <option value="604800">7 Days</option>
              <option value="burn">Burn after 1 view</option>
            </select>
          </div>
        </div>

        <!-- Success Result View -->
        <div class="safeshare-body result-view" id="safeshare-result-view" style="display: none;">
          <div class="result-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3 class="result-title">Private link ready</h3>
          <p class="result-desc">
            Encrypted with AES-256-GCM in your browser. The key is in the URL fragment, which browsers never send to the server.
          </p>

          <div class="result-url-box">
            <div class="result-url-text" id="result-url-display">https://...</div>
            <button class="btn-copy-url" id="btn-copy-url">Copy Link</button>
            <button class="btn-copy-url" id="btn-revoke-url" style="display: none;">Revoke</button>
          </div>

          <div class="result-meta-notice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Server and search engines only see ciphertext. Anyone with the full link can read it.</span>
          </div>
        </div>

        <div class="safeshare-footer" id="safeshare-modal-footer">
          <div class="footer-left">
            <button class="btn-text-subtle" id="btn-reset-default" title="Revert all custom toggles back to maximum protection">Reset to All Protected</button>
          </div>
          <div class="footer-right">
            <button class="btn-secondary" id="btn-cancel">Cancel</button>
            <button class="btn-primary" id="btn-encrypt-publish">
              <span>Create Private Link</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    this.bindEvents(backdrop);
    this.runPipeline();

    // Automatically trigger local AI model check in background if extension runtime is present
    if (typeof browser !== "undefined" || (typeof chrome !== "undefined" && chrome?.runtime?.sendMessage)) {
      setTimeout(() => this.checkLocalModel(true), 50);
    }
  }

  removeExisting() {
    this.reviewGeneration++;
    const existing = document.getElementById("safeshare-modal-backdrop");
    if (existing) existing.remove();
    this.maybeChoices.clear();
    this.maybeCandidates = [];
    this.currentTurns = [];
    this.sanitizedTurns = [];
    this.candidates = [];
    this.cachedTurnDetections = [];
    this.rawContextualEntities = [];
    this.reviewBaseTurns = [];
    this.masterEntityMap = null;
    this.previewLeaks = [];
    this.modelReview.clear();
    this.hardEntities.clear();
    this.modelState = "Not checked — credential rules only";
    this.pseudonymizer.reset();
  }

  setCandidateEnabled(cand, enabled) {
    if (!cand) return;
    cand.enabled = enabled;
    if (enabled) {
      this.activeCategories.add(cand.category);
    }
    if (cand.category === "CUSTOM") {
      const meta = this.customSelections.get(cand.raw);
      if (meta) meta.enabled = enabled;
    }
    if (cand.id.startsWith("maybe_") || this.maybeChoices.has(cand.raw)) {
      this.maybeChoices.set(cand.raw, enabled);
    }
    const candVal = this.pseudonymizer.parseFinancialValue(cand.raw);
    this.candidates.forEach(other => {
      const isSameRaw = other.raw.toLowerCase() === cand.raw.toLowerCase();
      const otherVal = this.pseudonymizer.parseFinancialValue(other.raw);
      const isSameFinVal = (cand.isAmount && other.isAmount && candVal > 0 && otherVal === candVal);
      if (isSameRaw || isSameFinVal) {
        other.enabled = enabled;
        if (other.id.startsWith("maybe_") || this.maybeChoices.has(other.raw)) {
          this.maybeChoices.set(other.raw, enabled);
        }
      }
    });
  }

  syncCustomCandidates() {
    for (const [raw, meta] of this.customSelections.entries()) {
      let cand = this.candidates.find(c => c.category === "CUSTOM" && c.raw.toLowerCase() === raw.toLowerCase());
      if (!cand) {
        this.candidates.push({ ...meta });
      } else {
        cand.enabled = meta.enabled;
      }
    }
  }

  syncMaybeCandidates() {
    for (const m of this.maybeCandidates) {
      let mCat = "CREDENTIALS";
      if (m.reason.includes("Local model: PERSON") || m.reason.includes("Local model: GIVEN_NAME") || m.reason.includes("Local model: SURNAME") || m.reason.includes("Local model: LOCATION") || m.reason.includes("Local model: CITY") || m.reason.includes("Local model: STREET")) {
        mCat = "PROFILE";
      } else if (!m.risky && (m.reason.includes("Random") || m.reason.includes("Entropy"))) {
        mCat = "SYSTEM";
      }
      const isEnabled = this.maybeChoices.get(m.raw) ?? m.risky;
      let cand = this.candidates.find(c => c.id === m.id || c.raw.toLowerCase() === m.raw.toLowerCase());
      if (!cand) {
        this.candidates.push({
          id: m.id,
          role: "user",
          turnIndex: m.occurrences && m.occurrences[0] ? m.occurrences[0].turnIndex : 0,
          category: mCat,
          categoryLabel: SS_CATEGORIES[mCat]?.label || "General",
          ruleName: m.reason.includes("Local model") ? "Local AI Model" : (m.risky ? "Possible Credential" : "High Entropy Token"),
          raw: m.raw,
          fullRaw: m.raw,
          tag: m.replacement,
          replacement: m.replacement,
          enabled: isEnabled,
          isAmount: false,
          isAlgebraic: false,
          occurrences: m.occurrences ? m.occurrences.length : 1
        });
      } else {
        cand.enabled = isEnabled;
        cand.tag = m.replacement;
        cand.replacement = m.replacement;
        if (m.occurrences) cand.occurrences = m.occurrences.length;
      }
    }
  }

  addCustomSelection(selectedText) {
    if (!selectedText || typeof selectedText !== "string") return;
    const clean = selectedText.trim();
    if (clean.length < 2) return;
    if (/^\[(?:REDACTED|CONFIDENTIAL|INTERNAL|HR|User|ANONYMIZED)_[A-Z0-9_]+\]$/.test(clean)) return;

    let existing = null;
    const lower = clean.toLowerCase();
    for (const [k, v] of this.customSelections.entries()) {
      if (k.toLowerCase() === lower) {
        existing = v;
        break;
      }
    }

    if (existing) {
      existing.enabled = true;
    } else {
      this.customCounter++;
      const tag = `[REDACTED_CUSTOM_${this.customCounter}]`;
      const meta = {
        id: `c_custom_${this.customCounter}_${Date.now()}`,
        role: "user",
        turnIndex: 0,
        category: "CUSTOM",
        categoryLabel: SS_CATEGORIES.CUSTOM.label,
        ruleName: "Manual Selection",
        raw: clean,
        fullRaw: clean,
        tag: tag,
        replacement: tag,
        enabled: true,
        isAmount: false,
        isAlgebraic: false,
        occurrences: 1
      };
      this.customSelections.set(clean, meta);
    }

    this.activeCategories.add("CUSTOM");
    this.syncCustomCandidates();
    this.rebuildViews();
  }

  /**
   * Runs the 3-Tier scan pass and populates candidate registry.
   */
  runPipeline() {
    this.pseudonymizer.reset();
    this.hardEntities.clear();
    this.candidates = [];
    this.cachedTurnDetections = [];
    this.rawContextualEntities = [];

    const intermediateTurns = [];
    let candIdCounter = 0;

    // 1. Scan Tier 1 (Heuristics)
    for (let turnIdx = 0; turnIdx < this.currentTurns.length; turnIdx++) {
      const turn = this.currentTurns[turnIdx];
      const hResult = this.heuristics.scan(turn.content, { labelDetection: det => this.hardLabel(det) });

      for (const det of hResult.detections) {
        let cat = det.category || "CREDENTIALS";
        if (["CREDIT_CARD", "CARD_SECURITY_CODE", "CARD_EXPIRY_DATE", "CARD_LAST_FOUR", "PREFIXED_BANK_LOAN_ID", "UNIVERSAL_RECORD_IDENTIFIER", "IBAN_ACCOUNT", "UK_SORT_CODE", "IN_IFSC", "AU_BSB"].includes(det.type)) cat = "FINANCIAL";
        else if (["ID_NIK", "ID_NPWP", "PASSPORT_RI", "ID_BPJS", "ID_SIM", "STUDENT_ID", "US_SSN", "US_SSN_RAW", "US_EIN", "UK_NINO", "CA_SIN", "IN_AADHAAR", "IN_PAN", "SG_NRIC", "BR_CPF", "ES_DNI", "IT_CODICE_FISCALE", "CN_CITIZEN_ID", "KR_RRN", "JP_MY_NUMBER", "AU_TFN", "MX_CURP", "MX_RFC"].includes(det.type)) cat = "GOV_ID";
        else if (["UK_NHS", "US_MRN", "AU_MEDICARE"].includes(det.type)) cat = "HEALTH";
        else if (["EMAIL", "PHONE", "ADDRESS_ID", "ENGLISH_PHYSICAL_ADDRESS", "ID_DOB", "ID_MOTHER_MAIDEN", "ID_PLATE_RI", "US_PLATE", "VEHICLE_VIN", "DEVICE_IMEI", "GPS_COORDINATES"].includes(det.type)) cat = "PROFILE";
        else if (["NETWORK_IPV6", "HARDWARE_MAC"].includes(det.type) || det.type.includes("PROMPT") || det.type.includes("OUTPUT") || det.type.includes("USER_") || det.type.includes("SSH_") || det.type.includes("GIT_")) cat = "SYSTEM";

        const secretVal = det.secretToken || det.raw;
        const tag = this.extractTag(det.replacement);

        const exists = this.candidates.some(c => c.tag === tag || c.raw.toLowerCase() === secretVal.toLowerCase() || c.fullRaw?.toLowerCase() === det.raw.toLowerCase());
        if (!exists) {
          this.candidates.push({
            id: `c_${candIdCounter++}`,
            role: turn.role,
            turnIndex: turnIdx,
            category: cat,
            categoryLabel: SS_CATEGORIES[cat]?.label || "General",
            ruleName: det.name,
            raw: secretVal,
            fullRaw: det.raw,
            tag: tag,
            replacement: det.replacement,
            enabled: true,
            isAlgebraic: false
          });
        }
      }

      // Tier 2 (Contextual) pass
      const cDetections = this.contextual.classifyTurn(hResult.sanitizedText, turnIdx);
      this.rawContextualEntities.push(...cDetections);

      this.cachedTurnDetections.push({
        hDetections: hResult.detections,
        cDetections: cDetections
      });

      intermediateTurns.push({
        role: turn.role,
        content: hResult.sanitizedText
      });
    }
    // Related month-name echoes: only sweep the same known card expiration, not arbitrary dates.
    const months = "January February March April May June July August September October November December".split(" ");
    for (const [key, tag] of this.hardEntities) {
      const match = /^CARD_EXPIRY::(\d{2})\/(\d{2})$/.exec(key);
      if (!match) continue;
      const month = months[+match[1] - 1];
      if (!month) continue;
      const rx = new RegExp(`\\b(?:${month}|${month.slice(0, 3)})\\s+20${match[2]}\\b`, "gi");
      for (let i = 0; i < intermediateTurns.length; i++) {
        // Card discussion must occur in the same paragraph; don't sweep dates throughout an essay.
        intermediateTurns[i].content = intermediateTurns[i].content.split(/(\n\s*\n)/).map(part => {
          if (!/card|expir|expiration|expiry|exp\b/i.test(part)) return part;
          return part.replace(rx, (raw, offset) => {
            const before = part.slice(Math.max(0, offset - 90), offset);
            if (!/\b(?:card|expir\w*|exp)\b[^.!?\n]{0,70}$/i.test(before)) return raw;
            const det = { type: "CARD_EXPIRY_WORDS", name: "Card Expiration (month name)", category: "FINANCIAL", raw, secretToken: raw, replacement: tag, tag };
            this.cachedTurnDetections[i].hDetections.push(det);
            return tag;
          });
        }).join("");
      }
    }

    // 2. Scan Tier 3 (Pseudonymizer & Algebraic Solver)
    const allHeuristics = (this.cachedTurnDetections || []).flatMap(t => t.hDetections);
    const { anonymizedTurns, mappings, solverLeaks } = this.pseudonymizer.anonymizeConversation(
      intermediateTurns,
      this.rawContextualEntities,
      allHeuristics
    );

    // Save master entity map so tags and numbers remain 100% immutable throughout the session
    this.masterEntityMap = new Map(this.pseudonymizer.entityMap);

    // Contextual mappings into candidates with canonical deduplication
    if (mappings && Array.isArray(mappings)) {
      for (const m of mappings) {
        let cat = "PROFILE";
        if (m.category === "SENSITIVE_FINANCIAL") cat = "FINANCIAL";
        else if (m.category === "SENSITIVE_HEALTH") cat = "HEALTH";
        else if (m.category === "SENSITIVE_CORP") cat = "CREDENTIALS";
        else if (m.category === "SENSITIVE_LEGAL_HR") cat = "PROFILE";

        const cleanRaw = (m.original || "").replace(/[.,;:]+$/, "").trim();
        const existing = this.candidates.find(c =>
          c.raw.toLowerCase() === cleanRaw.toLowerCase() ||
          (c.isAmount && m.category === "SENSITIVE_FINANCIAL" && this.pseudonymizer.parseFinancialValue(c.raw) === this.pseudonymizer.parseFinancialValue(cleanRaw) && this.pseudonymizer.parseFinancialValue(cleanRaw) > 0)
        );

        if (!existing) {
          this.candidates.push({
            id: `c_${candIdCounter++}`,
            role: "user",
            turnIndex: 0,
            category: cat,
            categoryLabel: SS_CATEGORIES[cat]?.label || "General",
            ruleName: cat === "FINANCIAL" ? "Financial Amount" : `Contextual ${m.category.replace("SENSITIVE_", "")}`,
            raw: cleanRaw,
            fullRaw: cleanRaw,
            tag: m.pseudonym,
            replacement: m.pseudonym,
            enabled: true,
            occurrences: 1,
            isAlgebraic: false,
            isAmount: m.category === "SENSITIVE_FINANCIAL"
          });
        } else {
          existing.occurrences = (existing.occurrences || 1) + 1;
          if (!existing.tag || existing.tag === "c_tag") {
            existing.tag = m.pseudonym;
          }
        }
      }
    }

    // Solver algebraic leaks and derived calculations into candidates (filter out calendar years)
    if (solverLeaks && Array.isArray(solverLeaks)) {
      const orderedLeaks = [...solverLeaks].sort((a, b) => (a.start || 0) - (b.start || 0));
      for (const leak of orderedLeaks) {
        if (!leak.raw) continue;
        const isYear = /^(?:19[5-9]\d|20[0-4]\d)$/.test(leak.raw.trim());
        if (isYear) continue;

        const cleanRaw = leak.raw.replace(/[.,;:]+$/, "").trim();
        const existing = this.candidates.find(c => c.raw.toLowerCase() === cleanRaw.toLowerCase());
        if (!existing) {
          let ruleName = "Derived Math Calculation";
          if (leak.replacement === "[REDACTED_PROJECTED_SALARY]") ruleName = "Projected Salary / Raise";
          else if (leak.replacement === "[REDACTED_SALARY_INCREMENT]") ruleName = "Salary Increment";
          else if (leak.replacement === "[REDACTED_REMAINDER_CASHFLOW]") ruleName = "Cashflow Remainder";
          else if (leak.replacement === "[REDACTED_DEBT_RATIO]") ruleName = "Debt Ratio";
          else if (leak.replacement === "[REDACTED_SAVINGS_ACCUMULATION]") ruleName = "Savings Accumulation";

          this.candidates.push({
            id: `c_${candIdCounter++}`,
            role: leak.role || "assistant",
            turnIndex: -1,
            category: leak.category || "FINANCIAL",
            categoryLabel: SS_CATEGORIES[leak.category || "FINANCIAL"]?.label || "Financial & Salary",
            ruleName: ruleName,
            raw: cleanRaw,
            fullRaw: cleanRaw,
            tag: leak.replacement,
            replacement: leak.replacement,
            enabled: true,
            occurrences: 1,
            isAlgebraic: true,
            isAmount: true
          });
        } else {
          existing.occurrences = (existing.occurrences || 1) + 1;
        }
      }
    }

    // Safety-Net Reconciliation Sweep: Ensure EVERY [REDACTED_...] tag appearing in anonymizedTurns has an interactive candidate!
    if (anonymizedTurns && Array.isArray(anonymizedTurns)) {
      for (const turn of anonymizedTurns) {
        const matches = (turn.content || "").match(/\[(?:REDACTED|CONFIDENTIAL|INTERNAL|HR|User|ANONYMIZED)_[A-Z0-9_]+\]/g);
        if (matches) {
          for (const tag of matches) {
            const hasCand = this.candidates.some(c => c.tag === tag || c.replacement === tag);
            if (!hasCand) {
              let cat = "FINANCIAL";
              if (tag.includes("HEALTH")) cat = "HEALTH";
              else if (tag.includes("CORP") || tag.includes("INTERNAL") || tag.includes("SECRET") || tag.includes("TOKEN") || tag.includes("KEY")) cat = "CREDENTIALS";
              else if (tag.includes("NIK") || tag.includes("SSN") || tag.includes("PASSPORT") || tag.includes("NIM") || tag.includes("ID") || tag.includes("GOV")) cat = "GOV_ID";
              else if (tag.includes("ADDRESS") || tag.includes("PHONE") || tag.includes("EMAIL") || tag.includes("User")) cat = "PROFILE";

              let ruleName = "Derived Math Calculation";
              if (tag.includes("PROJECTED_SALARY")) ruleName = "Projected Salary / Raise";
              else if (tag.includes("SALARY_INCREMENT")) ruleName = "Salary Increment";
              else if (tag.includes("REMAINDER")) ruleName = "Cashflow Remainder";
              else if (tag.includes("DEBT_RATIO")) ruleName = "Debt Ratio";
              else if (tag.includes("SAVINGS_ACCUMULATION")) ruleName = "Savings Accumulation";
              else if (tag.includes("BUDGET")) ruleName = "Budget Allocation";

              this.candidates.push({
                id: `c_${candIdCounter++}`,
                role: turn.role || "assistant",
                turnIndex: -1,
                category: cat,
                categoryLabel: SS_CATEGORIES[cat]?.label || "General",
                ruleName: ruleName,
                raw: tag,
                fullRaw: tag,
                tag: tag,
                replacement: tag,
                enabled: true,
                occurrences: 1,
                isAlgebraic: true
              });
            }
          }
        }
      }
    }

    // Compute total occurrences across turns for each candidate
    for (const cand of this.candidates) {
      let count = 0;
      const clean = cand.raw.toLowerCase().trim();
      for (const ctx of this.rawContextualEntities) {
        const ctxClean = ctx.raw.replace(/[.,;:]+$/, "").toLowerCase().trim();
        if (ctxClean === clean || (cand.category === "FINANCIAL" && this.pseudonymizer.parseFinancialValue(ctx.raw) === this.pseudonymizer.parseFinancialValue(cand.raw) && this.pseudonymizer.parseFinancialValue(cand.raw) > 0)) {
          count++;
        }
      }
      for (const turnDet of this.cachedTurnDetections) {
        for (const h of turnDet.hDetections) {
          const hClean = (h.secretToken || h.raw).toLowerCase().trim();
          if (hClean === clean || h.raw.toLowerCase().trim() === clean) {
            count++;
          }
        }
      }
      cand.occurrences = Math.max(1, count);
    }

    this.syncCustomCandidates();

    // Rebuild UI views and assemble output
    this.rebuildViews();
  }

  /**
   * Reassembles the conversation based on user's active customization settings.
   */
  rebuildViews() {
    if (this.publishing) return;
    let origTextDisplay = "";
    let sanitizedTextPlain = "";
    let sanitizedHtmlDisplay = "";

    // 1. Prepare intermediate turns based on active candidate toggles
    const activeIntermediateTurns = [];
    for (let tIdx = 0; tIdx < this.currentTurns.length; tIdx++) {
      const turn = this.currentTurns[tIdx];
      origTextDisplay += `[${turn.role.toUpperCase()}]:\n${turn.content}\n\n`;

      // Detections were found on the homoglyph-normalised text (heuristics.scan normalises
      // look-alike letters), so rebuild from the same normalised text: replacing on the original
      // would miss "аlice@example.com" with a Cyrillic "а" and leak it into the share.
      let turnText = this.heuristics.normalizeHomoglyphs(turn.content);
      const hDets = (this.cachedTurnDetections && this.cachedTurnDetections[tIdx]?.hDetections) || [];
      for (const det of hDets) {
        const secretVal = det.secretToken || det.raw;
        const cand = this.candidates.find(c => c.raw.toLowerCase() === secretVal.toLowerCase() || c.fullRaw?.toLowerCase() === det.raw.toLowerCase());
        const linked = det.tag && this.candidates.find(c => c.tag === det.tag);
        const target = linked || cand;
        const isProtected = !target || (this.activeCategories.has(target.category) && target.enabled);
        if (isProtected) {
          turnText = turnText.replace(new RegExp(this.escapeRegExp(det.raw), "gi"), det.replacement);
        }
      }
      activeIntermediateTurns.push({
        role: turn.role,
        content: turnText
      });
    }

    // 2. Filter active contextual entities based on user toggles (none for a trusted reader)
    const trusted = this.profile === "trusted";
    const activeContextual = trusted ? [] : (this.rawContextualEntities || []).filter(e => {
      const cleanE = e.raw.replace(/[.,;:]+$/, "").trim();
      const eVal = this.pseudonymizer.parseFinancialValue(cleanE);
      const cand = this.candidates.find(c =>
        c.raw.toLowerCase() === cleanE.toLowerCase() ||
        c.raw.toLowerCase() === e.raw.toLowerCase() ||
        (c.isAmount && eVal > 0 && this.pseudonymizer.parseFinancialValue(c.raw) === eVal)
      );
      return !cand || (this.activeCategories.has(cand.category) && cand.enabled);
    });

    // 3. Filter active heuristics and collect disabled algebraic leaks
    this.pseudonymizer.reset();
    const activeHeuristics = (this.cachedTurnDetections || []).flatMap(t => t.hDetections).filter(h => {
      const secretVal = (h.secretToken || h.raw).replace(/[.,;:]+$/, "").trim();
      const hVal = this.pseudonymizer.parseFinancialValue(secretVal);
      const cand = this.candidates.find(c =>
        c.raw.toLowerCase() === secretVal.toLowerCase() ||
        c.fullRaw?.toLowerCase() === h.raw.toLowerCase() ||
        (c.category === "FINANCIAL" && hVal > 0 && this.pseudonymizer.parseFinancialValue(c.raw) === hVal)
      );
      const linked = h.tag && this.candidates.find(c => c.tag === h.tag);
      const target = linked || cand;
      return !target || (this.activeCategories.has(target.category) && target.enabled);
    });

    const disabledFinancialVals = this.candidates
      .filter(c => c.isAmount && (!this.activeCategories.has(c.category) || !c.enabled))
      .map(c => this.pseudonymizer.parseFinancialValue(c.raw))
      .filter(v => !isNaN(v) && v > 0);

    const disabledLeaks = this.candidates
      .filter(c => !this.activeCategories.has(c.category) || !c.enabled)
      .flatMap(c => [c.raw, c.fullRaw])
      .filter(r => r && !r.startsWith("[REDACTED_"));

    const { anonymizedTurns } = this.pseudonymizer.anonymizeConversation(
      activeIntermediateTurns,
      activeContextual,
      activeHeuristics,
      {
        masterEntityMap: this.masterEntityMap,
        disabledLeaks,
        disabledFinancialVals,
        keepNames: trusted,
        labelLeak: raw => this.financialLeakLabel(raw)
      }
    );

    this.sanitizedTurns = anonymizedTurns;
    if (this.numbersMode === "range" && !trusted) {
      // Only amounts the user stated become ranges; the assistant's derived figures stay removed
      const userAmounts = new Set(activeContextual
        .filter(e => e.category === "SENSITIVE_FINANCIAL" && this.currentTurns[e.turnIndex]?.role === "user")
        .map(e => e.raw.trim().toLowerCase()));
      this.sanitizedTurns = SafeSharePolicy.generalizeNumbers(anonymizedTurns, this.pseudonymizer, userAmounts);
    }
    // Review the final safety scan, not an earlier text that changes during publication.
    this.previewLeaks = this.sanitizedTurns.map(t => t.solverLeaks || []);
    this.reviewBaseTurns = this.finalSafetyScan(this.sanitizedTurns).map(({ role, content }) => ({ role, content }));
    const modelSpans = this.reviewBaseTurns.flatMap((t, turnIndex) => (this.modelReview.get(t.content) || []).map(s => ({ ...s, turnIndex })));
    this.maybeCandidates = this.maybe.scan(this.reviewBaseTurns, modelSpans).filter(m => !this.candidates.some(c =>
      !c.id.startsWith("maybe_") && [c.raw, c.fullRaw].some(raw => raw && this.heuristics.normalizeHomoglyphs(raw) === m.raw)));
    this.sanitizedTurns = this.maybe.apply(this.reviewBaseTurns, this.maybeCandidates, this.maybeChoices);
    this.syncMaybeCandidates();

    // Apply custom user-selected redactions across all turns
    for (const cand of this.candidates.filter(c => c.category === "CUSTOM" && c.enabled)) {
      const escapedRaw = this.escapeRegExp(cand.raw);
      const isWordBoundaryStart = /^\w/.test(cand.raw) ? "(?<![\\w])" : "";
      const isWordBoundaryEnd = /\w$/.test(cand.raw) ? "(?![\\w])" : "";
      const reg = new RegExp(`${isWordBoundaryStart}${escapedRaw}${isWordBoundaryEnd}`, "gi");
      this.sanitizedTurns = this.sanitizedTurns.map(turn => ({
        role: turn.role,
        content: turn.content.replace(reg, cand.tag)
      }));
    }

    // Helper to replace text without penetrating existing <span ...>...</span> badges
    const replaceOutsideSpans = (html, regex, replacer) => {
      return html.replace(new RegExp(`(<span[^>]*>[\\s\\S]*?<\\/span>)|(${regex.source})`, regex.flags), (match, span, target, ...args) => {
        if (span) return span;
        return replacer(target, ...args);
      });
    };

    // 4. Build output displays and interactive badges
    for (let tIdx = 0; tIdx < this.sanitizedTurns.length; tIdx++) {
      const turn = this.sanitizedTurns[tIdx];
      sanitizedTextPlain += `[${turn.role.toUpperCase()}]:\n${turn.content}\n\n`;

      let htmlContent = this.escapeHtml(turn.content);

      // A. Wrap unmasked items (if user toggled protection off)
      const unmaskedCandidates = this.candidates
        .filter(cand => {
          const isCatActive = this.activeCategories.has(cand.category);
          return !(isCatActive && cand.enabled) && cand.raw && !cand.raw.startsWith("[REDACTED_");
        })
        .sort((a, b) => b.raw.length - a.raw.length);

      for (const cand of unmaskedCandidates) {
        const rawEscaped = this.escapeHtml(cand.raw);
        const regRaw = new RegExp(`(?<![\\w])${this.escapeRegExp(rawEscaped)}(?![\\w])`, "gi");
        htmlContent = replaceOutsideSpans(htmlContent, regRaw, (m) => `<span class="ss-badge ss-badge-unmasked" data-cand-id="${cand.id}" data-tag="${cand.tag}" title="Click to re-redact">${m}<span class="ss-badge-icon">👁️</span></span>`);
      }

      // Ranges retain the amount's click target instead of becoming inert plain text.
      if (this.numbersMode === "range" && !trusted) {
        for (const candidate of this.candidates.filter(c => c.isAmount && c.enabled && this.activeCategories.has(c.category))) {
          const value = this.pseudonymizer.parseFinancialValue(candidate.raw);
          if (!(value >= 10)) continue;
          if (!this.currentTurns.some((t, i) => t.role === "user" && (this.cachedTurnDetections[i]?.cDetections || []).some(e => e.raw.trim().toLowerCase() === candidate.raw.toLowerCase()))) continue;
          const range = SafeSharePolicy.formatRange(...SafeSharePolicy.bucket(value), SafeSharePolicy.currencyOf(candidate.raw));
          htmlContent = replaceOutsideSpans(htmlContent, new RegExp(this.escapeRegExp(this.escapeHtml(range)), "g"), m =>
            `<span class="ss-badge ss-badge-redacted" data-cand-id="${candidate.id}" data-tag="${candidate.tag}" title="Click to show exact amount">${m}</span>`);
        }
      }

      // B. Single-pass regex replacing all redacted tags outside existing spans
      const turnDets = (this.cachedTurnDetections && this.cachedTurnDetections[tIdx]?.hDetections) || [];
      const turnLeaks = this.previewLeaks[tIdx] || [];
      let solverLeakIdx = 0;

      const ALL_REDACTED_TAGS_PATTERN = /\[(?:REDACTED|CONFIDENTIAL|INTERNAL|HR|User|ANONYMIZED|LOCATION|NIK|NAME|DATE)_[A-Z0-9_]+\]|\[REDACTED_[A-Z0-9]+\]|\[user_\d+@protected\.local\]|sk-dummy[\w-]*|sk-ant-api03-dummy[\w-]*|AIzaSyDummy[\w-]*|hf_dummy[\w-]*|glpat-dummy[\w-]*|postgresql:\/\/postgres:placeholder_password[^\s"'>]*/g;

      htmlContent = replaceOutsideSpans(htmlContent, ALL_REDACTED_TAGS_PATTERN, (tag) => {
        let cand = null;
        // 1. If this is a solver leak in an assistant turn, match in exact occurrence order
        if (solverLeakIdx < turnLeaks.length) {
          const leak = turnLeaks[solverLeakIdx];
          if (leak && (leak.replacement === tag || leak.tag === tag)) {
            solverLeakIdx++;
            cand = this.candidates.find(c => c.raw.toLowerCase() === leak.raw.toLowerCase());
          }
        }
        // 2. Prefer one belonging to this turn or detections
        if (!cand) {
          cand = this.candidates.find(c => (c.tag === tag || c.replacement === tag) && turnDets.some(d => (d.secretToken || d.raw).toLowerCase() === c.raw.toLowerCase()));
        }
        // 3. Fallback to candidate matching tag or replacement
        if (!cand) {
          cand = this.candidates.find(c => c.tag === tag || c.replacement === tag);
        }
        // 4. Fallback matching placeholder prefix (dummy keys, emails)
        if (!cand) {
          cand = this.candidates.find(c => (c.replacement && c.replacement.includes(tag)) || (c.tag && c.tag.includes(tag)));
        }
        // 5. Fallback for maybe candidates
        if (!cand) {
          const m = this.maybeCandidates.find(mc => mc.replacement === tag);
          if (m) cand = this.candidates.find(c => c.id === m.id || c.raw.toLowerCase() === m.raw.toLowerCase());
        }
        if (!cand || cand.raw === tag) return `<span class="ss-placeholder" title="Original value unavailable; cannot unmask">${tag}</span>`;
        const candId = cand.id;
        const rawText = (cand && cand.raw !== cand.tag) ? this.escapeHtml(cand.raw) : tag;
        return `<span class="ss-badge ss-badge-redacted" data-cand-id="${candId}" data-tag="${tag}" title="Click to unmask (Original: ${rawText})">${tag}<span class="ss-badge-icon">✕</span></span>`;
      });

      sanitizedHtmlDisplay += `<div class="turn-block"><div class="turn-header">[${this.escapeHtml(turn.role.toUpperCase())}]:</div><div class="turn-body">${this.transcript.renderEscaped(htmlContent)}</div></div>`;
    }

    // 1. Update Diff Boxes
    const diffOrigEl = document.getElementById("diff-box-orig");
    if (diffOrigEl) diffOrigEl.innerHTML = this.currentTurns.map(t => `<div class="turn-block"><div class="turn-header">[${this.escapeHtml(t.role.toUpperCase())}]:</div><div class="turn-body">${this.transcript.renderEscaped(this.escapeHtml(t.content))}</div></div>`).join("");

    const diffSanEl = document.getElementById("diff-box-sanitized");
    if (diffSanEl) {
      diffSanEl.innerHTML = sanitizedHtmlDisplay;
      // Attach click events on inline badges
      diffSanEl.querySelectorAll(".ss-badge").forEach(badge => {
        badge.addEventListener("click", (e) => {
          if (this.publishing) return;
          e.stopPropagation();
          let candId = badge.getAttribute("data-cand-id");
          let cand = this.candidates.find(c => c.id === candId);
          if (!cand) {
            const badgeTag = badge.getAttribute("data-tag") || (badge.innerText || badge.textContent || "").replace(/[✕👁️⚡ local]/g, "").trim();
            cand = this.candidates.find(c => c.tag === badgeTag || c.replacement === badgeTag);
          }
          if (cand) {
            this.setCandidateEnabled(cand, !cand.enabled);
            this.rebuildViews();
          }
        });
      });
    }

    // 2. Tally candidate counts and active protected counts per category
    const catStats = {};
    for (const catKey of Object.keys(SS_CATEGORIES)) {
      catStats[catKey] = { total: 0, active: 0 };
    }
    for (const c of this.candidates) {
      if (catStats[c.category]) {
        catStats[c.category].total++;
        if (this.activeCategories.has(c.category) && c.enabled) {
          catStats[c.category].active++;
        }
      }
    }

    // 3. Update Category Filter Pills
    this.renderCategoryPills(catStats);

    // 3. Update Entity Inspector Drawer
    this.renderInspectorList();
    this.renderMaybeItems();

    // 4. Update Stats & Compatibility Counters
    const activeProtectedCount = this.candidates.filter(c => this.activeCategories.has(c.category) && c.enabled).length;
    const totalDetectedCount = this.candidates.length;

    const summaryTitleEl = document.getElementById("summary-title");
    const summarySubEl = document.getElementById("summary-subtitle");
    const chipsEl = document.getElementById("summary-chips");

    if (summaryTitleEl) {
      if (activeProtectedCount === totalDetectedCount && totalDetectedCount > 0) {
        summaryTitleEl.innerText = `${totalDetectedCount} detected items masked · review suggestions below`;
      } else if (activeProtectedCount > 0) {
        summaryTitleEl.innerText = `Custom Protected · ${activeProtectedCount} of ${totalDetectedCount} items masked`;
      } else if (totalDetectedCount === 0) {
        // Nothing detected: either nothing sensitive, or it was already replaced before sending
        summaryTitleEl.innerText = `No automatic detections · review the text and suggestions below`;
      } else {
        summaryTitleEl.innerText = `All Unmasked · Original content shared`;
      }
    }

    if (summarySubEl) {
      summarySubEl.innerText = `${this.currentTurns.length} turns prepared · ${this.maybeCandidates.length} unverified suggestion(s)`;
    }

    if (chipsEl) {
      chipsEl.innerHTML = "";
      const chipProtected = document.createElement("span");
      chipProtected.className = "summary-chip chip-secret";
      chipProtected.innerText = `${activeProtectedCount} protected`;
      chipsEl.appendChild(chipProtected);

      if (totalDetectedCount - activeProtectedCount > 0) {
        const chipUnmasked = document.createElement("span");
        chipUnmasked.className = "summary-chip chip-entity";
        chipUnmasked.innerText = `${totalDetectedCount - activeProtectedCount} unmasked`;
        chipsEl.appendChild(chipUnmasked);
      }
    }

    const drawerCounter = document.getElementById("drawer-counter");
    if (drawerCounter) drawerCounter.innerText = `${activeProtectedCount} of ${totalDetectedCount} protected`;

    const inspectorBtnText = document.getElementById("inspector-btn-text");
    if (inspectorBtnText) inspectorBtnText.innerText = `Customize (${totalDetectedCount})`;

    const statHardEl = document.getElementById("stat-hard-secrets");
    if (statHardEl) statHardEl.innerText = activeProtectedCount;

    const statContextualEl = document.getElementById("stat-contextual");
    if (statContextualEl) statContextualEl.innerText = 0;
  }

  renderMaybeItems() {
    const list = document.getElementById("safeshare-maybe-items");
    if (!list) return;
    const status = document.getElementById("safeshare-model-status");
    const missing = this.reviewBaseTurns?.some(t => !this.modelReview.has(t.content));
    if (status) status.textContent = this.modelState.startsWith("Local model checked") && missing
      ? "Review text changed — run the local model again for the current preview" : this.modelState;
    list.innerHTML = "";
    if (!this.maybeCandidates.length) {
      list.textContent = "No additional candidates found. This does not mean the conversation is free of sensitive data.";
      return;
    }

    const toolbar = document.createElement("div");
    toolbar.className = "maybe-quick-toolbar";

    const btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.id = "btn-maybe-protect-all";
    btnAll.className = "btn-drawer-action btn-maybe-bulk";
    btnAll.textContent = "🛡️ Redact All Suggestions";
    btnAll.addEventListener("click", (e) => {
      if (this.publishing) return;
      if (e?.preventDefault) e.preventDefault();
      for (const c of this.maybeCandidates) this.maybeChoices.set(c.raw, true);
      this.rebuildViews();
    });

    const btnNone = document.createElement("button");
    btnNone.type = "button";
    btnNone.id = "btn-maybe-unprotect-all";
    btnNone.className = "btn-drawer-action btn-maybe-bulk";
    btnNone.textContent = "Keep All Unmasked";
    btnNone.addEventListener("click", (e) => {
      if (this.publishing) return;
      if (e?.preventDefault) e.preventDefault();
      for (const c of this.maybeCandidates) this.maybeChoices.set(c.raw, false);
      this.rebuildViews();
    });

    toolbar.appendChild(btnAll);
    toolbar.appendChild(btnNone);
    list.appendChild(toolbar);

    for (const candidate of this.maybeCandidates) {
      const isRedacted = this.maybeChoices.get(candidate.raw) ?? candidate.risky;

      const label = document.createElement("label");
      label.className = "maybe-item-card" + (isRedacted ? " is-redacted" : "");

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = isRedacted;
      check.addEventListener("change", () => {
        if (this.publishing) return;
        this.maybeChoices.set(candidate.raw, check.checked);
        this.rebuildViews();
        document.getElementById(candidate.id)?.focus();
      });
      check.id = candidate.id;

      const shown = candidate.raw.length > 36 ? candidate.raw.slice(0, 20) + "…" + candidate.raw.slice(-8) : candidate.raw;
      const first = candidate.occurrences[0];
      const content = this.reviewBaseTurns[first.turnIndex].content;
      const context = (start, end) => {
        let value = content.slice(start, end);
        const spans = this.maybeCandidates.flatMap(c => c.occurrences)
          .filter(o => o.turnIndex === first.turnIndex && o.start < end && o.end > start)
          .sort((a, b) => b.start - a.start);
        for (const o of spans) {
          const from = Math.max(start, o.start) - start;
          const to = Math.min(end, o.end) - start;
          value = value.slice(0, from) + "[POSSIBLE_SECRET]" + value.slice(to);
        }
        return value;
      };
      const snippet = context(Math.max(0, first.start - 35), first.start) + shown + context(first.end, first.end + 35);

      const text = document.createElement("span");
      text.className = "maybe-item-text";
      text.textContent = `${shown} — ${candidate.reason} (${candidate.occurrences.length} occurrence(s)). Context: ${snippet}`;

      const actBtn = document.createElement("button");
      actBtn.type = "button";
      actBtn.className = "btn-maybe-quick " + (isRedacted ? "btn-maybe-redacted" : "btn-maybe-unmasked");
      actBtn.textContent = isRedacted ? "✓ Redacted" : "🛡️ Redact this";
      actBtn.title = isRedacted ? "Click to keep visible in share" : "Click to redact across all occurrences";
      actBtn.addEventListener("click", (e) => {
        if (this.publishing) return;
        if (e?.preventDefault) e.preventDefault();
        check.click();
      });

      label.appendChild(check);
      label.appendChild(text);
      label.appendChild(actBtn);
      list.appendChild(label);
    }
  }

  /**
   * Last check before encrypting: scan the exact text that will be shared for hard identifiers
   * (keys, IDs, cards, contacts) and redact any the user did not deliberately untick. Catches
   * anything an earlier step missed (e.g. a rebuild that drifted from the detected text).
   */
  finalSafetyScan(turns) {
    const kept = new Set(
      this.candidates
        .filter(c => !this.activeCategories.has(c.category) || !c.enabled)
        .flatMap(c => [c.raw, c.fullRaw])
        .filter(Boolean)
        .map(v => this.heuristics.normalizeHomoglyphs(v).toLowerCase())
    );
    return turns.map(t => {
      const text = this.heuristics.normalizeHomoglyphs(t.content);
      const scan = this.heuristics.scan(text, { labelDetection: det => this.hardLabel(det) });
      let out = text;
      for (const det of [...scan.detections].sort((a, b) => b.index - a.index)) {
        const raw = det.raw.toLowerCase();
        const secret = (det.secretToken || "").toLowerCase();
        const candidate = this.candidates.find(c => c.tag === det.tag);
        if (candidate && (!candidate.enabled || !this.activeCategories.has(candidate.category))) continue;
        if (kept.has(raw) || (secret && kept.has(secret))) continue;
        out = out.slice(0, det.index) + det.replacement + out.slice(det.index + det.length);
      }
      return { ...t, content: out };
    });
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  renderCategoryPills(catStats) {
    const listEl = document.getElementById("policy-pills-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    for (const [key, meta] of Object.entries(SS_CATEGORIES)) {
      const stat = catStats[key] || { total: 0, active: 0 };
      if (stat.total === 0) continue; // Only show relevant categories detected in conversation

      const isActive = this.activeCategories.has(key) && stat.active > 0;
      const pill = document.createElement("button");
      pill.className = `cat-pill ${isActive ? "active" : "inactive"}`;
      pill.setAttribute("data-cat", key);
      pill.setAttribute("title", `${stat.active} of ${stat.total} items protected. Click to toggle category.`);
      pill.innerHTML = `
        <span class="cat-pill-icon">${meta.icon}</span>
        <span class="cat-pill-label">${meta.label}</span>
        <span class="cat-pill-count">${stat.active}</span>
      `;

      pill.addEventListener("click", () => {
        if (isActive) {
          // If category currently has active protections, turn it off completely
          this.activeCategories.delete(key);
          this.candidates.forEach(c => {
            if (c.category === key) c.enabled = false;
          });
        } else {
          // Turn category on and enable all items in it
          this.activeCategories.add(key);
          this.candidates.forEach(c => {
            if (c.category === key) c.enabled = true;
          });
        }
        this.savePreferences();
        this.rebuildViews();
      });

      listEl.appendChild(pill);
    }
  }

  renderInspectorList() {
    const container = document.getElementById("inspector-items-container");
    if (!container) return;
    const drawerEl = document.getElementById("safeshare-inspector-drawer");
    const savedScrollTop = drawerEl ? drawerEl.scrollTop : 0;
    container.innerHTML = "";

    if (this.candidates.length === 0) {
      container.innerHTML = `<div class="inspector-empty">No sensitive entities detected in this chat.</div>`;
      return;
    }

    // Group candidates by category for clean user-friendly presentation
    const grouped = {};
    for (const cand of this.candidates) {
      if (!grouped[cand.category]) grouped[cand.category] = [];
      grouped[cand.category].push(cand);
    }

    for (const [catKey, cands] of Object.entries(grouped)) {
      const meta = SS_CATEGORIES[catKey] || { icon: "🛡️", label: "General" };
      const groupHeader = document.createElement("div");
      groupHeader.className = "inspector-group-header";
      groupHeader.innerHTML = `
        <span class="group-header-icon">${meta.icon}</span>
        <span class="group-header-title">${meta.label}</span>
        <span class="group-header-badge">${cands.length} ${cands.length === 1 ? 'item' : 'items'}</span>
      `;
      container.appendChild(groupHeader);

      for (const cand of cands) {
        const isCatActive = this.activeCategories.has(cand.category);
        const isItemActive = isCatActive && cand.enabled;

        const card = document.createElement("div");
        card.className = `inspector-item-card ${isItemActive ? "item-active" : "item-inactive"}`;
        card.style.cursor = "pointer";
        card.innerHTML = `
          <div class="item-card-left">
            <div class="item-icon">${meta.icon}</div>
            <div class="item-details">
              <div class="item-name-row">
                <span class="item-rule-name">${this.escapeHtml(cand.ruleName)}</span>
                <span class="item-turn-tag">${cand.occurrences && cand.occurrences > 1 ? `${cand.occurrences}x in chat` : (cand.role === "assistant" ? "AI Reply" : "User Prompt")}</span>
                ${cand.isAlgebraic ? `<span class="item-algebraic-tag" title="Inversion protection against mathematical reconstruction">🔗 Derived Math</span>` : ""}
              </div>
              <div class="item-values-row">
                <code class="val-raw" title="${this.escapeHtml(cand.raw)}">${this.escapeHtml(cand.raw)}</code>
                <span class="val-arrow">→</span>
                <code class="val-masked">${this.escapeHtml(cand.tag || cand.replacement)}</code>
              </div>
            </div>
          </div>
          <div class="item-card-right">
            <label class="ss-switch" title="Toggle redaction for this item">
              <input type="checkbox" class="cand-toggle-input" data-cand-id="${cand.id}" ${isItemActive ? "checked" : ""}>
              <span class="ss-slider"></span>
            </label>
          </div>
        `;

        const inputEl = card.querySelector(".cand-toggle-input");
        const toggleHandler = (e) => {
          const nextState = inputEl.checked;
          cand.enabled = nextState;
          const candVal = this.pseudonymizer.parseFinancialValue(cand.raw);
          this.candidates.forEach(other => {
            const isSameRaw = other.raw.toLowerCase() === cand.raw.toLowerCase();
            const otherVal = this.pseudonymizer.parseFinancialValue(other.raw);
            const isSameFinVal = (cand.isAmount && other.isAmount && candVal > 0 && otherVal === candVal);
            if (isSameRaw || isSameFinVal) {
              other.enabled = nextState;
            }
          });
          if (nextState && !this.activeCategories.has(cand.category)) {
            this.activeCategories.add(cand.category);
            this.savePreferences();
          }
          this.rebuildViews();
        };

        inputEl.addEventListener("change", toggleHandler);

        // Entire row clickable for intuitive toggling
        card.addEventListener("click", (e) => {
          if (e.target.closest(".ss-switch")) return;
          inputEl.checked = !inputEl.checked;
          toggleHandler(e);
        });

        container.appendChild(card);
      }
    }

    if (drawerEl && savedScrollTop > 0) {
      drawerEl.scrollTop = savedScrollTop;
    }
  }

  async checkLocalModel(background = false) {
    if (this.publishing || this.modelBusy) return;
    this.modelBusy = true;
    const generation = this.reviewGeneration;
    const button = document.getElementById("safeshare-model-check");
    const publish = document.getElementById("btn-encrypt-publish");
    if (!background) {
      if (button) button.disabled = true;
      if (publish) publish.disabled = true;
    }
    if (button) button.textContent = "⏳ Scanning with local model…";
    this.modelState = "Scanning names & PII with local AI model…";
    this.renderMaybeItems();
    const snapshot = this.reviewBaseTurns.map(t => ({ ...t }));
    try {
      const api = typeof SafeShareNer !== "undefined" ? SafeShareNer : require("../engine/ner_client.js");
      const arbiter = typeof PrioritySpanArbiter !== "undefined" ? new PrioritySpanArbiter() : null;
      for (const turn of snapshot) {
        if (this.modelReview.has(turn.content)) continue;
        const result = await api.analyze(turn.content, 60000, true);
        if (!result.success || !Array.isArray(result.spans)) throw new Error(result.error || "Invalid local model response");
        const protectedSpans = arbiter ? arbiter.extractProtectedSpans(turn.content) : [];
        const spans = result.spans.filter(s => !protectedSpans.some(p => s.start < p.end && s.end > p.start));
        if (generation !== this.reviewGeneration || !this.currentTurns.length) return;
        this.modelReview.set(turn.content, spans);
      }
      if (generation === this.reviewGeneration) {
        this.modelState = "✓ Local AI model checked";
        if (button) button.textContent = "✓ Local model checked (Click to re-scan)";
      }
    } catch (_) {
      if (generation === this.reviewGeneration) {
        this.modelState = "Rules active (local model skipped or unavailable)";
        if (button) button.textContent = "Check names and other PII with local model";
      }
    } finally {
      this.modelBusy = false;
      if (button) button.disabled = false;
      if (publish) publish.disabled = false;
      if (generation === this.reviewGeneration && this.currentTurns.length) this.rebuildViews();
    }
  }

  bindEvents(backdrop) {
    backdrop.querySelector("#safeshare-model-check")?.addEventListener("click", () => {
      this.checkLocalModel(false);
    });
    backdrop.querySelector("#safeshare-close-btn").addEventListener("click", () => this.removeExisting());
    backdrop.querySelector("#btn-cancel").addEventListener("click", () => this.removeExisting());

    // Reader profile and amount display
    for (const [id, key, storageKey] of [["#safeshare-profile", "profile", "safeshare_profile"], ["#safeshare-numbers", "numbersMode", "safeshare_numbers"]]) {
      const sel = backdrop.querySelector(id);
      sel.value = this[key];
      sel.addEventListener("change", () => {
        this[key] = sel.value;
        try { localStorage.setItem(storageKey, sel.value); } catch (_) {}
        this.rebuildViews();
      });
    }

    // Toggle Inspector Drawer
    const toggleInspectorBtn = backdrop.querySelector("#btn-toggle-inspector");
    const drawerEl = backdrop.querySelector("#safeshare-inspector-drawer");
    const arrowEl = backdrop.querySelector("#inspector-arrow-icon");

    toggleInspectorBtn.addEventListener("click", () => {
      this.isInspectorOpen = !this.isInspectorOpen;
      drawerEl.style.display = this.isInspectorOpen ? "block" : "none";
      if (arrowEl) arrowEl.innerText = this.isInspectorOpen ? "▲" : "▼";
      toggleInspectorBtn.classList.toggle("active", this.isInspectorOpen);
    });

    // Inspector Select All / Deselect All
    backdrop.querySelector("#btn-select-all-cands")?.addEventListener("click", () => {
      this.activeCategories = new Set(Object.keys(SS_CATEGORIES));
      for (const c of this.candidates) c.enabled = true;
      for (const c of this.maybeCandidates) this.maybeChoices.set(c.raw, true);
      for (const meta of this.customSelections.values()) meta.enabled = true;
      this.savePreferences();
      this.rebuildViews();
    });

    backdrop.querySelector("#btn-deselect-all-cands")?.addEventListener("click", () => {
      for (const c of this.candidates) c.enabled = false;
      for (const c of this.maybeCandidates) this.maybeChoices.set(c.raw, false);
      for (const meta of this.customSelections.values()) meta.enabled = false;
      this.rebuildViews();
    });

    // Footer Reset button
    backdrop.querySelector("#btn-reset-default")?.addEventListener("click", () => {
      this.activeCategories = new Set(Object.keys(SS_CATEGORIES));
      for (const c of this.candidates) c.enabled = true;
      for (const c of this.maybeCandidates) this.maybeChoices.set(c.raw, true);
      for (const meta of this.customSelections.values()) meta.enabled = true;
      this.savePreferences();
      this.rebuildViews();
    });

    // Publish & Encrypt Event
    backdrop.querySelector("#btn-encrypt-publish").addEventListener("click", async () => {
      if (this.publishing || this.modelBusy) return;
      const riskyLeft = this.maybeCandidates.filter(c => c.risky && !(this.maybeChoices.get(c.raw) ?? c.risky)).length;
      if (riskyLeft && !window.confirm(`${riskyLeft} possible credential(s) remain visible to link readers and any AI they continue with. Create the link anyway?`)) return;
      // Snapshot only public fields; never share solverLeaks, original values or detector metadata.
      const turns = this.sanitizedTurns.map(({ role, content }) => ({ role, content }));
      const btn = backdrop.querySelector("#btn-encrypt-publish");
      this.publishing = true;
      const controls = [...backdrop.querySelectorAll("button, input, select")].map(el => [el, el.disabled]);
      controls.forEach(([el]) => { el.disabled = true; });
      btn.innerText = "Encrypting...";
      btn.disabled = true;

      try {
        const ttl = document.getElementById("safeshare-ttl").value;
        const payload = {
          turns,
          timestamp: new Date().toISOString(),
          ttl: ttl
        };

        // Optional relay override for local testing:
        //   chrome.storage.local.set({ safeshare_relay: "http://127.0.0.1:8787" })
        try {
          const api = typeof browser !== "undefined" ? browser : chrome;
          const { safeshare_relay } = await api.storage.local.get("safeshare_relay");
          if (safeshare_relay) this.crypto.relayBaseUrl = this.crypto.viewerBaseUrl = safeshare_relay.replace(/\/$/, "");
        } catch (_) {}

        const encResult = await this.crypto.encrypt(payload);
        let finalShareUrl = encResult.fullShareUrl;

        // Upload ciphertext to relay server via background script
        const relayUrl = this.crypto.relayBaseUrl; // default lives in engine/crypto.js
        const uploadPayload = {
          id: encResult.shareId,
          ciphertext: encResult.ciphertext,
          ttl: ttl
        };

        let uploaded = false;
        let revokeToken = null;

        // Auto-retry wake-up loop for privileged background script
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            let response = null;
            if (typeof browser !== "undefined" && browser.runtime && browser.runtime.sendMessage) {
              response = await browser.runtime.sendMessage({
                action: "UPLOAD_TO_RELAY",
                relayUrl: relayUrl,
                payload: uploadPayload
              });
            } else if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
              response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                  {
                    action: "UPLOAD_TO_RELAY",
                    relayUrl: relayUrl,
                    payload: uploadPayload
                  },
                  (res) => {
                    if (chrome.runtime.lastError) {
                      return reject(new Error(chrome.runtime.lastError.message));
                    }
                    resolve(res);
                  }
                );
              });
            }

            if (response && response.success) {
              uploaded = true;
              revokeToken = response.data && response.data.revoke_token;
              break;
            } else {
              throw new Error((response && response.error) || "Relay upload returned unsuccessful");
            }
          } catch (err) {
            console.warn(`[SafeShare] Upload attempt ${attempt + 1} via background worker failed:`, err);
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 200));
            }
          }
        }

        // Direct edge fetch fallback
        if (!uploaded) {
          try {
            const uploadRes = await fetch(`${relayUrl}/api/share`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(uploadPayload)
            });
            if (uploadRes.ok) {
              uploaded = true;
              revokeToken = (await uploadRes.json()).revoke_token;
            }
          } catch (fetchErr) {
            console.warn("[SafeShare] Direct edge fetch fallback failed:", fetchErr);
          }
        }

        if (!uploaded) {
          throw new Error("Unable to upload encrypted payload to Cloudflare Edge. Please verify your connection.");
        }

        // Switch to Result View
        document.getElementById("safeshare-review-view").style.display = "none";
        document.querySelector(".safeshare-policy-bar").style.display = "none";
        document.getElementById("safeshare-inspector-drawer").style.display = "none";
        document.getElementById("safeshare-modal-footer").style.display = "none";
        document.getElementById("safeshare-result-view").style.display = "block";

        const urlDisplay = document.getElementById("result-url-display");
        urlDisplay.innerText = finalShareUrl;

        // Copy button
        const copyBtn = document.getElementById("btn-copy-url");
        copyBtn.onclick = async () => {
          await navigator.clipboard.writeText(finalShareUrl);
          copyBtn.innerText = "Copied! ✓";
          setTimeout(() => (copyBtn.innerText = "Copy Link"), 2500);
        };

        // Revoke button. ponytail: the token only lives in this modal; persist it in
        // extension storage if users need to revoke after closing the dialog.
        const revokeBtn = document.getElementById("btn-revoke-url");
        if (revokeToken) {
          revokeBtn.style.display = "";
          revokeBtn.onclick = async () => {
            const api = typeof browser !== "undefined" ? browser : chrome;
            const res = await api.runtime.sendMessage({
              action: "REVOKE_SHARE",
              relayUrl,
              shareId: encResult.shareId,
              token: revokeToken
            });
            revokeBtn.innerText = res && res.success ? "Revoked ✓" : "Revoke failed";
            revokeBtn.disabled = !!(res && res.success);
          };
        }
      } catch (err) {
        console.error("[SafeShare] Encryption error:", err);
        btn.innerText = "Error Encrypting";
        btn.disabled = false;
      } finally {
        this.publishing = false;
        controls.forEach(([el, disabled]) => { el.disabled = disabled; });
      }
    });

    this.setupTextSelectionRedactor(backdrop);
  }

  setupTextSelectionRedactor(backdrop) {
    let floatingBtn = backdrop.querySelector("#safeshare-floating-redact-btn");
    if (!floatingBtn && typeof document !== "undefined" && document.createElement) {
      floatingBtn = document.createElement("button");
      floatingBtn.id = "safeshare-floating-redact-btn";
      floatingBtn.type = "button";
      floatingBtn.className = "ss-floating-redact-btn";
      floatingBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span>Redact selection</span>
      `;
      floatingBtn.style.display = "none";
      backdrop.appendChild(floatingBtn);
    }

    let selectedRaw = "";

    const handleSelection = () => {
      if (typeof window === "undefined" || !window.getSelection) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        if (floatingBtn) floatingBtn.style.display = "none";
        selectedRaw = "";
        return;
      }

      const raw = sel.toString().trim();
      if (raw.length < 2 || /^\[(?:REDACTED|CONFIDENTIAL|INTERNAL|HR|User|ANONYMIZED)_[A-Z0-9_]+\]$/.test(raw)) {
        if (floatingBtn) floatingBtn.style.display = "none";
        selectedRaw = "";
        return;
      }

      const range = sel.getRangeAt(0);
      const parent = range.commonAncestorContainer;
      const el = parent && (parent.nodeType === 1 ? parent : parent.parentElement);
      if (!el || !el.closest || !el.closest("#diff-box-orig, #diff-box-sanitized")) {
        if (floatingBtn) floatingBtn.style.display = "none";
        selectedRaw = "";
        return;
      }

      selectedRaw = raw;
      if (floatingBtn && range.getBoundingClientRect) {
        const rect = range.getBoundingClientRect();
        floatingBtn.style.position = "fixed";
        floatingBtn.style.top = `${Math.max(10, rect.top - 36)}px`;
        floatingBtn.style.left = `${Math.max(10, rect.left + (rect.width / 2) - 65)}px`;
        floatingBtn.style.display = "flex";
      }
    };

    const diffArea = backdrop.querySelector(".direct-comparison-grid") || backdrop;
    if (diffArea && diffArea.addEventListener) {
      diffArea.addEventListener("mouseup", () => setTimeout(handleSelection, 20));
      diffArea.addEventListener("keyup", () => setTimeout(handleSelection, 20));
    }

    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("selectionchange", () => {
        if (typeof window !== "undefined" && window.getSelection) {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) {
            if (floatingBtn) floatingBtn.style.display = "none";
          }
        }
      });
    }

    if (floatingBtn && floatingBtn.addEventListener) {
      floatingBtn.addEventListener("mousedown", (e) => {
        if (e && e.preventDefault) e.preventDefault();
      });
      floatingBtn.addEventListener("click", (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (e && e.preventDefault) e.preventDefault();
        if (selectedRaw) {
          this.addCustomSelection(selectedRaw);
          floatingBtn.style.display = "none";
          if (typeof window !== "undefined" && window.getSelection) {
            window.getSelection().removeAllRanges();
          }
        }
      });
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SafeShareModal;
}
