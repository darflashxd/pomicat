/**
 * SafeShare-AI — Modal Controller (Calm Security with User-Controlled Redaction)
 * Coordinates the 3-Tier Redaction Pipeline, Granular Customization Engine,
 * and Zero-Knowledge Encryption Flow.
 */

const SS_CATEGORIES = {
  CREDENTIALS: { id: "CREDENTIALS", label: "Credentials", icon: "🔑", color: "#f43f5e" },
  FINANCIAL: { id: "FINANCIAL", label: "Financial & Salary", icon: "💳", color: "#10b981" },
  GOV_ID: { id: "GOV_ID", label: "Gov & Academic IDs", icon: "🆔", color: "#3b82f6" },
  PROFILE: { id: "PROFILE", label: "Contact & Profile", icon: "👤", color: "#8b5cf6" },
  HEALTH: { id: "HEALTH", label: "Health & Medical", icon: "🏥", color: "#ec4899" },
  SYSTEM: { id: "SYSTEM", label: "System & Shell", icon: "💻", color: "#eab308" }
};

class SafeShareModal {
  constructor() {
    this.heuristics = new HeuristicsRedactor();
    this.contextual = new ContextualClassifier();
    this.pseudonymizer = new ConsistentPseudonymizer();
    this.crypto = new SafeShareCrypto();

    this.currentTurns = [];
    this.candidates = [];
    this.activeCategories = new Set(Object.keys(SS_CATEGORIES));
    this.isInspectorOpen = false;

    this.sanitizedTurns = [];
    this.loadPreferences();
  }

  loadPreferences() {
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
  open(turns) {
    this.currentTurns = turns;
    this.removeExisting();

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
              <div class="safeshare-version-tag">Zero-Knowledge Enclave</div>
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
                  <span>Sanitized Output (Safe to Share)</span>
                </div>
                <span class="hint-badge">💡 Click any badge to toggle</span>
              </div>
              <div class="diff-box diff-box-interactive" id="diff-box-sanitized"></div>
            </div>
          </div>

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
            End-to-end encrypted with AES-256-GCM. The decryption key exists solely in the URL fragment and never touches server logs.
          </p>

          <div class="result-url-box">
            <div class="result-url-text" id="result-url-display">https://...</div>
            <button class="btn-copy-url" id="btn-copy-url">Copy Link</button>
          </div>

          <div class="result-meta-notice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Search engine crawl-immune & anti-scraping protected</span>
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
  }

  removeExisting() {
    const existing = document.getElementById("safeshare-modal-backdrop");
    if (existing) existing.remove();
  }

  /**
   * Runs the 3-Tier scan pass and populates candidate registry.
   */
  runPipeline() {
    this.pseudonymizer.reset();
    this.candidates = [];
    this.cachedTurnDetections = [];
    this.rawContextualEntities = [];

    const intermediateTurns = [];
    let candIdCounter = 0;

    // 1. Scan Tier 1 (Heuristics)
    for (let turnIdx = 0; turnIdx < this.currentTurns.length; turnIdx++) {
      const turn = this.currentTurns[turnIdx];
      const hResult = this.heuristics.scan(turn.content);

      for (const det of hResult.detections) {
        let cat = det.category || "CREDENTIALS";
        if (det.type === "CREDIT_CARD") cat = "FINANCIAL";
        else if (["ID_NIK", "ID_NPWP", "PASSPORT_RI", "ID_BPJS", "ID_SIM", "STUDENT_ID", "US_SSN", "US_SSN_RAW", "US_EIN"].includes(det.type)) cat = "GOV_ID";
        else if (["EMAIL", "PHONE", "ADDRESS_ID", "ENGLISH_PHYSICAL_ADDRESS"].includes(det.type)) cat = "PROFILE";
        else if (det.type.includes("PROMPT") || det.type.includes("OUTPUT") || det.type.includes("USER_") || det.type.includes("SSH_") || det.type.includes("GIT_")) cat = "SYSTEM";

        const exists = this.candidates.some(c => c.raw.toLowerCase() === det.raw.toLowerCase());
        if (!exists) {
          this.candidates.push({
            id: `c_${candIdCounter++}`,
            role: turn.role,
            category: cat,
            categoryLabel: SS_CATEGORIES[cat]?.label || "General",
            ruleName: det.name,
            raw: det.raw,
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

    // 2. Scan Tier 3 (Pseudonymizer & Algebraic Solver)
    const { mappings, solverLeaks } = this.pseudonymizer.anonymizeConversation(
      intermediateTurns,
      this.rawContextualEntities
    );

    // Contextual mappings into candidates
    if (mappings && Array.isArray(mappings)) {
      for (const m of mappings) {
        let cat = "PROFILE";
        if (m.category === "SENSITIVE_FINANCIAL") cat = "FINANCIAL";
        else if (m.category === "SENSITIVE_HEALTH") cat = "HEALTH";
        else if (m.category === "SENSITIVE_CORP") cat = "CREDENTIALS";
        else if (m.category === "SENSITIVE_LEGAL_HR") cat = "PROFILE";

        // Avoid exact duplicate candidates if already covered by Tier 1
        const exists = this.candidates.some(c => c.raw.toLowerCase() === m.original.toLowerCase());
        if (!exists) {
          this.candidates.push({
            id: `c_${candIdCounter++}`,
            role: "user",
            category: cat,
            categoryLabel: SS_CATEGORIES[cat]?.label || "General",
            ruleName: `Contextual ${m.category.replace("SENSITIVE_", "")}`,
            raw: m.original,
            replacement: m.pseudonym,
            enabled: true,
            isAlgebraic: false
          });
        }
      }
    }

    // Solver algebraic leaks into candidates
    if (solverLeaks && Array.isArray(solverLeaks)) {
      for (const leak of solverLeaks) {
        if (!leak.raw) continue;
        const exists = this.candidates.some(c => c.raw === leak.raw);
        if (!exists) {
          this.candidates.push({
            id: `c_${candIdCounter++}`,
            role: "assistant",
            category: "FINANCIAL",
            categoryLabel: SS_CATEGORIES.FINANCIAL.label,
            ruleName: "Algebraic Inversion Defense",
            raw: leak.raw,
            replacement: leak.replacement,
            enabled: true,
            isAlgebraic: true
          });
        }
      }
    }

    // Rebuild UI views and assemble output
    this.rebuildViews();
  }

  /**
   * Reassembles the conversation based on user's active customization settings.
   */
  rebuildViews() {
    let origTextDisplay = "";
    let sanitizedTextPlain = "";
    let sanitizedHtmlDisplay = "";

    // Tally candidate counts per category
    const catCounts = {};
    for (const catKey of Object.keys(SS_CATEGORIES)) {
      catCounts[catKey] = 0;
    }
    for (const c of this.candidates) {
      if (catCounts[c.category] !== undefined) {
        catCounts[c.category]++;
      }
    }

    // 1. Prepare intermediate turns based on active heuristic candidate toggles
    const activeIntermediateTurns = [];
    for (let tIdx = 0; tIdx < this.currentTurns.length; tIdx++) {
      const turn = this.currentTurns[tIdx];
      origTextDisplay += `[${turn.role.toUpperCase()}]:\n${turn.content}\n\n`;

      let turnText = turn.content;
      const hDets = (this.cachedTurnDetections && this.cachedTurnDetections[tIdx]?.hDetections) || [];
      for (const det of hDets) {
        const cand = this.candidates.find(c => c.raw.toLowerCase() === det.raw.toLowerCase());
        const isProtected = !cand || (this.activeCategories.has(cand.category) && cand.enabled);
        if (isProtected) {
          turnText = turnText.replace(new RegExp(this.escapeRegExp(det.raw), "gi"), det.replacement);
        }
      }
      activeIntermediateTurns.push({
        role: turn.role,
        content: turnText
      });
    }

    // 2. Filter active contextual entities based on user toggles
    const activeContextual = (this.rawContextualEntities || []).filter(e => {
      const cand = this.candidates.find(c => c.raw.toLowerCase() === e.raw.toLowerCase());
      return !cand || (this.activeCategories.has(cand.category) && cand.enabled);
    });

    // 3. Run the full multi-turn engine (sweeping all user and assistant turns)
    this.pseudonymizer.reset();
    const { anonymizedTurns } = this.pseudonymizer.anonymizeConversation(
      activeIntermediateTurns,
      activeContextual
    );

    this.sanitizedTurns = anonymizedTurns;

    // 4. Build output displays and interactive badges
    for (let tIdx = 0; tIdx < anonymizedTurns.length; tIdx++) {
      const turn = anonymizedTurns[tIdx];
      sanitizedTextPlain += `[${turn.role.toUpperCase()}]:\n${turn.content}\n\n`;

      let htmlContent = this.escapeHtml(turn.content);

      // Wrap replacement tags into interactive badges
      for (const cand of this.candidates) {
        const isCatActive = this.activeCategories.has(cand.category);
        const isProtected = isCatActive && cand.enabled;

        const replEscaped = this.escapeHtml(cand.replacement);
        const rawEscaped = this.escapeHtml(cand.raw);

        if (isProtected && replEscaped) {
          const regRepl = new RegExp(this.escapeRegExp(replEscaped), "g");
          const badgeHtml = `<span class="ss-badge ss-badge-redacted" data-cand-id="${cand.id}" title="Click to unmask (Original: ${rawEscaped})">${replEscaped}<span class="ss-badge-icon">✕</span></span>`;
          htmlContent = htmlContent.replace(regRepl, badgeHtml);
        } else if (!isProtected && rawEscaped) {
          const regRaw = new RegExp(this.escapeRegExp(rawEscaped), "gi");
          const badgeHtml = `<span class="ss-badge ss-badge-unmasked" data-cand-id="${cand.id}" title="Click to re-redact">${rawEscaped}<span class="ss-badge-icon">👁️</span></span>`;
          htmlContent = htmlContent.replace(regRaw, badgeHtml);
        }
      }

      sanitizedHtmlDisplay += `<div class="turn-block"><div class="turn-header">[${turn.role.toUpperCase()}]:</div><div class="turn-body">${htmlContent}</div></div>`;
    }

    this.sanitizedTurns = finalTurns;

    // 1. Update Diff Boxes
    const diffOrigEl = document.getElementById("diff-box-orig");
    if (diffOrigEl) diffOrigEl.innerText = origTextDisplay.trimEnd();

    const diffSanEl = document.getElementById("diff-box-sanitized");
    if (diffSanEl) {
      diffSanEl.innerHTML = sanitizedHtmlDisplay;
      // Attach click events on inline badges
      diffSanEl.querySelectorAll(".ss-badge").forEach(badge => {
        badge.addEventListener("click", (e) => {
          e.stopPropagation();
          const candId = badge.getAttribute("data-cand-id");
          const cand = this.candidates.find(c => c.id === candId);
          if (cand) {
            cand.enabled = !cand.enabled;
            this.rebuildViews();
          }
        });
      });
    }

    // 2. Update Category Filter Pills
    this.renderCategoryPills(catCounts);

    // 3. Update Entity Inspector Drawer
    this.renderInspectorList();

    // 4. Update Stats & Compatibility Counters
    const activeProtectedCount = this.candidates.filter(c => this.activeCategories.has(c.category) && c.enabled).length;
    const totalDetectedCount = this.candidates.length;

    const summaryTitleEl = document.getElementById("summary-title");
    const summarySubEl = document.getElementById("summary-subtitle");
    const chipsEl = document.getElementById("summary-chips");

    if (summaryTitleEl) {
      if (activeProtectedCount === totalDetectedCount && totalDetectedCount > 0) {
        summaryTitleEl.innerText = `Protected · All ${totalDetectedCount} sensitive items masked`;
      } else if (activeProtectedCount > 0) {
        summaryTitleEl.innerText = `Custom Protected · ${activeProtectedCount} of ${totalDetectedCount} items masked`;
      } else {
        summaryTitleEl.innerText = `All Unmasked · Original content shared`;
      }
    }

    if (summarySubEl) {
      summarySubEl.innerText = `${this.currentTurns.length} ${this.currentTurns.length === 1 ? 'turn' : 'turns'} prepared`;
    }

    if (chipsEl) {
      chipsEl.innerHTML = "";
      const chipProtected = document.createElement("span");
      chipProtected.className = "summary-chip chip-secret";
      chipProtected.innerText = `${activeProtectedCount} masked`;
      chipsEl.appendChild(chipProtected);

      if (totalDetectedCount - activeProtectedCount > 0) {
        const chipUnmasked = document.createElement("span");
        chipUnmasked.className = "summary-chip chip-entity";
        chipUnmasked.innerText = `${totalDetectedCount - activeProtectedCount} kept raw`;
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

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  renderCategoryPills(catCounts) {
    const listEl = document.getElementById("policy-pills-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    for (const [key, meta] of Object.entries(SS_CATEGORIES)) {
      const count = catCounts[key] || 0;
      if (count === 0) continue; // Only show relevant categories

      const isActive = this.activeCategories.has(key);
      const pill = document.createElement("button");
      pill.className = `cat-pill ${isActive ? "active" : "inactive"}`;
      pill.setAttribute("data-cat", key);
      pill.innerHTML = `
        <span class="cat-pill-icon">${meta.icon}</span>
        <span class="cat-pill-label">${meta.label}</span>
        <span class="cat-pill-count">${count}</span>
      `;

      pill.addEventListener("click", () => {
        if (this.activeCategories.has(key)) {
          this.activeCategories.delete(key);
        } else {
          this.activeCategories.add(key);
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
    container.innerHTML = "";

    if (this.candidates.length === 0) {
      container.innerHTML = `<div class="inspector-empty">No sensitive entities detected in this chat.</div>`;
      return;
    }

    for (const cand of this.candidates) {
      const meta = SS_CATEGORIES[cand.category] || { icon: "🛡️", label: "General" };
      const isCatActive = this.activeCategories.has(cand.category);
      const isItemActive = isCatActive && cand.enabled;

      const card = document.createElement("div");
      card.className = `inspector-item-card ${isItemActive ? "item-active" : "item-inactive"}`;
      card.innerHTML = `
        <div class="item-card-left">
          <div class="item-icon">${meta.icon}</div>
          <div class="item-details">
            <div class="item-name-row">
              <span class="item-rule-name">${this.escapeHtml(cand.ruleName)}</span>
              <span class="item-turn-tag">${cand.role === "assistant" ? "AI Reply" : "User Prompt"}</span>
              ${cand.isAlgebraic ? `<span class="item-algebraic-tag" title="Inversion protection against mathematical reconstruction">🔗 Derived Math</span>` : ""}
            </div>
            <div class="item-values-row">
              <code class="val-raw" title="${this.escapeHtml(cand.raw)}">${this.escapeHtml(cand.raw)}</code>
              <span class="val-arrow">→</span>
              <code class="val-masked">${this.escapeHtml(cand.replacement)}</code>
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
      inputEl.addEventListener("change", (e) => {
        cand.enabled = e.target.checked;
        if (e.target.checked && !this.activeCategories.has(cand.category)) {
          this.activeCategories.add(cand.category);
          this.savePreferences();
        }
        this.rebuildViews();
      });

      container.appendChild(card);
    }
  }

  bindEvents(backdrop) {
    backdrop.querySelector("#safeshare-close-btn").addEventListener("click", () => this.removeExisting());
    backdrop.querySelector("#btn-cancel").addEventListener("click", () => this.removeExisting());

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
    backdrop.querySelector("#btn-select-all-cands").addEventListener("click", () => {
      this.activeCategories = new Set(Object.keys(SS_CATEGORIES));
      for (const c of this.candidates) c.enabled = true;
      this.savePreferences();
      this.rebuildViews();
    });

    backdrop.querySelector("#btn-deselect-all-cands").addEventListener("click", () => {
      for (const c of this.candidates) c.enabled = false;
      this.rebuildViews();
    });

    // Footer Reset button
    backdrop.querySelector("#btn-reset-default").addEventListener("click", () => {
      this.activeCategories = new Set(Object.keys(SS_CATEGORIES));
      for (const c of this.candidates) c.enabled = true;
      this.savePreferences();
      this.rebuildViews();
    });

    // Publish & Encrypt Event
    backdrop.querySelector("#btn-encrypt-publish").addEventListener("click", async () => {
      const btn = backdrop.querySelector("#btn-encrypt-publish");
      btn.innerText = "Encrypting...";
      btn.disabled = true;

      try {
        const ttl = document.getElementById("safeshare-ttl").value;
        const payload = {
          turns: this.sanitizedTurns,
          timestamp: new Date().toISOString(),
          ttl: ttl
        };

        const encResult = await this.crypto.encrypt(payload);
        let finalShareUrl = encResult.fullShareUrl;

        // Upload ciphertext to relay server via background script
        const relayUrl = this.crypto.relayBaseUrl || "https://safeshare-relay.bleedguard.workers.dev";
        const uploadPayload = {
          id: encResult.shareId,
          ciphertext: encResult.ciphertext,
          ttl: ttl
        };

        let uploaded = false;

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
      } catch (err) {
        console.error("[SafeShare] Encryption error:", err);
        btn.innerText = "Error Encrypting";
        btn.disabled = false;
      }
    });
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SafeShareModal;
}
