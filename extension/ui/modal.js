/**
 * SafeShare-AI — Modal Controller (Direct Side-by-Side Comparison)
 * Coordinates the 3-Tier Redaction Pipeline and Zero-Knowledge Encryption Flow.
 */

class SafeShareModal {
  constructor() {
    this.heuristics = new HeuristicsRedactor();
    this.contextual = new ContextualClassifier();
    this.pseudonymizer = new ConsistentPseudonymizer();
    this.crypto = new SafeShareCrypto();
    this.currentTurns = [];
    this.sanitizedTurns = [];
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
            <div class="safeshare-title">Share Privately</div>
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
            <div class="summary-icon-wrap">
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
          <!-- Hidden compatibility elements -->
          <span id="stat-turns" style="display:none;">${turns.length}</span>
          <span id="stat-hard-secrets" style="display:none;">0</span>
          <span id="stat-contextual" style="display:none;">0</span>
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
              </div>
              <div class="diff-box" id="diff-box-sanitized"></div>
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
        <div class="safeshare-body result-view" id="safeshare-result-view">
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
    `;

    document.body.appendChild(backdrop);
    this.bindEvents(backdrop);
    this.runPipeline();
  }

  removeExisting() {
    const existing = document.getElementById("safeshare-modal-backdrop");
    if (existing) existing.remove();
  }

  runPipeline() {
    this.pseudonymizer.reset();
    let totalHardSecrets = 0;
    let totalContextual = 0;

    let origTextDisplay = "";
    let sanitizedTextDisplay = "";

    const detectedContextualEntities = [];
    const intermediateTurns = [];

    // Step 1: Run Tier 1 (Heuristics) & Tier 2 (Contextual) per turn
    for (let i = 0; i < this.currentTurns.length; i++) {
      const turn = this.currentTurns[i];
      origTextDisplay += `[${turn.role.toUpperCase()}]:\n${turn.content}\n\n`;

      const hResult = this.heuristics.scan(turn.content);
      totalHardSecrets += hResult.detections.length;

      const cDetections = this.contextual.classifyTurn(hResult.sanitizedText, i);
      totalContextual += cDetections.length;
      detectedContextualEntities.push(...cDetections);

      intermediateTurns.push({
        role: turn.role,
        content: hResult.sanitizedText
      });
    }

    // Step 2: Run Tier 3 Consistent Pseudonymization & Equivalence Clustering
    const { anonymizedTurns } = this.pseudonymizer.anonymizeConversation(
      intermediateTurns,
      detectedContextualEntities
    );
    this.sanitizedTurns = anonymizedTurns;

    for (const turn of this.sanitizedTurns) {
      sanitizedTextDisplay += `[${turn.role.toUpperCase()}]:\n${turn.content}\n\n`;
    }

    // Update Stats Summary
    const totalMasked = totalHardSecrets + totalContextual;
    const summaryTitleEl = document.getElementById("summary-title");
    const summarySubEl = document.getElementById("summary-subtitle");
    const chipsEl = document.getElementById("summary-chips");

    if (summaryTitleEl) {
      summaryTitleEl.innerText = totalMasked > 0
        ? `Protected · ${totalMasked} sensitive ${totalMasked === 1 ? 'item' : 'items'} masked`
        : "Protected · Ready to share";
    }

    if (summarySubEl) {
      summarySubEl.innerText = `${this.currentTurns.length} ${this.currentTurns.length === 1 ? 'turn' : 'turns'} prepared`;
    }

    if (chipsEl) {
      chipsEl.innerHTML = "";
      if (totalHardSecrets > 0) {
        const c = document.createElement("span");
        c.className = "summary-chip chip-secret";
        c.innerText = `${totalHardSecrets} secrets`;
        chipsEl.appendChild(c);
      }
      if (totalContextual > 0) {
        const c = document.createElement("span");
        c.className = "summary-chip chip-entity";
        c.innerText = `${totalContextual} entities`;
        chipsEl.appendChild(c);
      }
      if (totalMasked === 0) {
        const c = document.createElement("span");
        c.className = "summary-chip";
        c.innerText = "Clean content";
        chipsEl.appendChild(c);
      }
    }

    // Populate Side-by-Side Boxes
    const diffOrigEl = document.getElementById("diff-box-orig");
    if (diffOrigEl) diffOrigEl.innerText = origTextDisplay.trimEnd();

    const diffSanEl = document.getElementById("diff-box-sanitized");
    if (diffSanEl) diffSanEl.innerText = sanitizedTextDisplay.trimEnd();

    const statHardEl = document.getElementById("stat-hard-secrets");
    if (statHardEl) statHardEl.innerText = totalHardSecrets;

    const statContextualEl = document.getElementById("stat-contextual");
    if (statContextualEl) statContextualEl.innerText = totalContextual;
  }

  bindEvents(backdrop) {
    backdrop.querySelector("#safeshare-close-btn").addEventListener("click", () => this.removeExisting());
    backdrop.querySelector("#btn-cancel").addEventListener("click", () => this.removeExisting());

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

        // Auto-retry wake-up loop for privileged background script (Firefox MV3 keep-alive)
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

        // Direct edge fetch fallback (if webpage CSP allows)
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

        // Edge Relay upload succeeded -> ALWAYS CLEAN SHORT LINK!
        finalShareUrl = encResult.fullShareUrl;

        // Switch to Result View
        document.getElementById("safeshare-review-view").style.display = "none";
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
