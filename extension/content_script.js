/**
 * SafeShare-AI — Content Script
 * Injects SafeShare action button into ChatGPT, Claude, and DeepSeek interfaces,
 * manages Pre-Inference Outbound Symbolic Transformation (<S1>),
 * and executes Local Compute Hydration in client RAM.
 */

(function () {
  console.log("[SafeShare-AI] Extension content script active.");

  // Ephemeral engines initialized in content script context
  const symbolicVault = typeof SafeShareSymbolicVault !== "undefined" ? new SafeShareSymbolicVault() : null;
  const symbolicRewriter = (typeof SafeShareSymbolicRewriter !== "undefined" && symbolicVault) ? new SafeShareSymbolicRewriter(symbolicVault) : null;
  const localCompute = typeof SafeShareLocalCompute !== "undefined" ? new SafeShareLocalCompute() : null;

  // Before-sending protection ("shield") mode, chosen from the chip above the chat input:
  //   "all"     replace IDs, keys, cards, emails, phones, and turn amounts into <S1> (default)
  //   "amounts" only turn amounts into <S1>
  //   "off"     send as typed
  const SHIELD_MODES = {
    all: "Protect IDs + amounts",
    amounts: "Protect amounts only",
    off: "Off (send as typed)"
  };
  function getShieldMode() {
    try {
      const m = localStorage.getItem("safeshare_shield_mode");
      if (SHIELD_MODES[m]) return m;
      return localStorage.getItem("safeshare_pre_inference") === "false" ? "off" : "all"; // older setting
    } catch (_) {
      return "all";
    }
  }
  function setShieldMode(mode) {
    try { localStorage.setItem("safeshare_shield_mode", mode); } catch (_) {}
  }
  function isPreInferenceEnabled() {
    return getShieldMode() !== "off";
  }

  const shieldIdScanner = typeof HeuristicsRedactor !== "undefined" ? new HeuristicsRedactor() : null;
  let directNerPort = null;
  const pendingNerRequests = new Map();

  async function getDirectOffscreenPort() {
    if (directNerPort) return directNerPort;
    const api = typeof browser !== "undefined" ? browser : chrome;
    if (!api || !api.runtime || !api.runtime.connect) return null;

    try {
      await api.runtime.sendMessage({ action: "ENSURE_OFFSCREEN_READY" });
      directNerPort = api.runtime.connect({ name: "OFFSCREEN_DIRECT_NER" });
      directNerPort.onMessage.addListener((res) => {
        const resolver = pendingNerRequests.get(res.requestId);
        if (resolver) {
          pendingNerRequests.delete(res.requestId);
          resolver(res.ok ? res.spans : []);
        }
      });
      directNerPort.onDisconnect.addListener(() => {
        directNerPort = null;
      });
      return directNerPort;
    } catch (_) {
      return null;
    }
  }

  /**
   * What the shield would send: in "all" mode, hard identifiers are replaced first (same rules as
   * sharing), then amounts become <S1>. Returns { isTransformed, sanitizedPrompt, count }.
   */
  function shieldRewrite(text, { dryRun = false } = {}) {
    let out = text;
    let count = 0;
    if (getShieldMode() === "all" && shieldIdScanner) {
      const scan = shieldIdScanner.scan(text);
      if (scan.detections.length) {
        out = scan.sanitizedText;
        count += scan.detections.length;
      }
    }
    // Dry run (chip preview while typing): analyze() does not store values in the vault
    if (dryRun) {
      const analysis = symbolicRewriter.analyze(out);
      count += analysis.hasSensitive ? analysis.detectedItems.length : 0;
      return { isTransformed: count > 0, sanitizedPrompt: out, count };
    }
    const rewritten = symbolicRewriter.rewrite(out);
    if (rewritten.isTransformed) {
      out = rewritten.sanitizedPrompt;
      count += (rewritten.symbols || []).length || 1;
    }
    return { isTransformed: out !== text, sanitizedPrompt: out, count };
  }

  function initSafeShareButton() {
    if (document.getElementById("safeshare-action-pill")) return;

    const pill = document.createElement("button");
    pill.id = "safeshare-action-pill";
    pill.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span>SafeShare</span>
    `;
    pill.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 28px;
      z-index: 99999;
      background: rgba(24, 24, 27, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #f4f4f5;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 9999px;
      padding: 7px 14px;
      font-size: 13px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 7px;
      transition: all 0.15s ease;
    `;

    pill.addEventListener("mouseenter", () => {
      pill.style.transform = "translateY(-1px)";
      pill.style.borderColor = "rgba(255, 255, 255, 0.22)";
      pill.style.background = "#27272a";
    });
    pill.addEventListener("mouseleave", () => {
      pill.style.transform = "translateY(0)";
      pill.style.borderColor = "rgba(255, 255, 255, 0.12)";
      pill.style.background = "rgba(24, 24, 27, 0.92)";
    });

    pill.addEventListener("click", () => {
      handleSessionRouteChange();
      const turns = extractConversationTurns();
      if (turns.length === 0) {
        alert("SafeShare: No active conversation found in the current chat window.");
        return;
      }
      const modal = new SafeShareModal();
      modal.open(turns);
    });

    document.body.appendChild(pill);
  }

  /**
   * Helper to check if an element is genuinely visible in the active document layout.
   * Excludes elements inside aria-hidden, inert, or display:none containers (e.g. inactive SPA chat panes).
   */
  function isVisibleElement(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest("[aria-hidden='true'], [inert], .hidden, [hidden]")) return false;
    if (typeof el.checkVisibility === "function") {
      try {
        if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false;
      } catch (_) {}
    }
    try {
      const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (s && (s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse")) {
        return false;
      }
    } catch (_) {}
    return el.offsetWidth > 0 || el.offsetHeight > 0 || (el.getClientRects && el.getClientRects().length > 0);
  }

  /**
   * Finds the active prompt input area across ChatGPT, Claude, and DeepSeek.
   * Strictly filters out sidebar items, chat rename inputs, and non-composer elements.
   */
  function findPromptInputElement() {
    const isValidInput = (el) => {
      if (!el || typeof document === "undefined" || !document.body || !document.body.contains(el)) return false;
      if (!isVisibleElement(el)) return false;
      // Exclude sidebar search, chat rename input, and elements inside modals/headers
      if (el.closest("#safeshare-modal-backdrop, aside, nav, [class*='sidebar'], header")) return false;
      return true;
    };

    const selectors = [
      "#prompt-textarea",
      "form textarea",
      "form [contenteditable='true']",
      "div.ProseMirror[contenteditable='true']",
      "[data-testid='chat-input']",
      "textarea[data-id='root']",
      "textarea[placeholder*='Message' i], textarea[placeholder*='Pesan' i], textarea[placeholder*='Ask' i]",
      "div[contenteditable='true'][data-placeholder]",
      "fieldset div[contenteditable='true']",
      "textarea"
    ];

    for (const sel of selectors) {
      const matches = document.querySelectorAll(sel);
      for (const el of matches) {
        if (isValidInput(el)) return el;
      }
    }
    return null;
  }

  /**
   * Retrieves text from the input element (handling textarea and contenteditable).
   */
  function getInputText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      return el.value || "";
    }
    return el.innerText || el.textContent || "";
  }

  /**
   * Injects rewritten symbolic text into ProseMirror/Lexical/React input element.
   */
  function setInputText(el, newText) {
    if (!el) return;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.value = newText;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    // Contenteditable (ChatGPT / Claude ProseMirror / Lexical)
    el.focus();
    if (typeof document.execCommand === "function") {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, newText);
    } else {
      el.innerText = newText;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /**
   * Manages the subtle Privacy Shield Chip indicator near the input prompt area.
   * Enforces Active Re-Parenting Invariant: if React unmounts/replaces the composer form,
   * stale orphan bars/indicators are cleaned up and remounted directly above the active composer.
   */
  function updateShieldIndicator(inputEl) {
    if (!symbolicRewriter || !inputEl || typeof document === "undefined" || !document.body) return;

    const isEnabled = isPreInferenceEnabled();

    // 1. Locate the active prompt composer container or form
    const composerForm = inputEl.closest("form") || inputEl.closest("[class*='composer']") || inputEl.closest("fieldset") || inputEl.closest("div.relative") || inputEl.parentElement;
    if (!composerForm || !composerForm.parentElement) return;

    // 2. Active Re-Parenting Invariant for safeshare-shield-bar:
    // If bar does not exist, or is detached, or is NOT directly before the active composerForm:
    let bar = document.getElementById("safeshare-shield-bar");
    if (!bar || !document.body.contains(bar) || bar.parentElement !== composerForm.parentElement || bar.nextElementSibling !== composerForm) {
      if (bar) bar.remove(); // Remove stale or misplaced bar
      bar = document.createElement("div");
      bar.id = "safeshare-shield-bar";
      bar.style.cssText = "display: flex; justify-content: flex-end; width: 100%; margin-bottom: 6px; padding: 0 4px; pointer-events: none; z-index: 99999;";
      composerForm.parentElement.insertBefore(bar, composerForm);
    }

    // 3. Active Re-Parenting Invariant for safeshare-shield-indicator:
    // If indicator does not exist, or is detached, or is NOT a child of the active bar:
    let indicator = document.getElementById("safeshare-shield-indicator");
    if (!indicator || !document.body.contains(indicator) || indicator.parentElement !== bar) {
      if (indicator) indicator.remove(); // Remove stale indicator
      indicator = document.createElement("div");
      indicator.id = "safeshare-shield-indicator";
      indicator.title = "SafeShare: what to protect before sending (click to change)";
      indicator.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleShieldMenu(indicator, () => {
          updateShieldIndicator(findPromptInputElement() || inputEl);
          runHydrationPass();
        });
      });
      indicator.style.pointerEvents = "auto";
      bar.appendChild(indicator);
    }

    if (!isEnabled) {
      indicator.className = "shield-disabled";
      indicator.textContent = "🛡️ Protection off ▾";
      return;
    }

    const mode = getShieldMode();
    let count = 0;
    try { count = shieldRewrite(getInputText(inputEl), { dryRun: true }).count; } catch (_) {}
    indicator.className = "shield-active";
    indicator.textContent = count
      ? `🛡️ ${count} item${count > 1 ? "s" : ""} will be protected ▾`
      : `🛡️ ${mode === "all" ? "Protecting IDs + amounts" : "Protecting amounts"} ▾`;
  }

  /** Small menu under the chip to pick the before-sending protection mode. */
  function toggleShieldMenu(anchor, onChange) {
    const existing = document.getElementById("safeshare-shield-menu");
    if (existing) {
      existing.remove();
      return;
    }
    const menu = document.createElement("div");
    menu.id = "safeshare-shield-menu";
    const title = document.createElement("div");
    title.className = "shield-menu-title";
    title.textContent = "Before sending, protect:";
    menu.appendChild(title);
    const current = getShieldMode();
    for (const [mode, label] of Object.entries(SHIELD_MODES)) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "shield-menu-option" + (mode === current ? " selected" : "");
      opt.textContent = (mode === current ? "● " : "○ ") + label;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        setShieldMode(mode);
        menu.remove();
        onChange();
      });
      menu.appendChild(opt);
    }
    const note = document.createElement("div");
    note.className = "shield-menu-note";
    note.textContent = "Names and places are removed when you share.";
    menu.appendChild(note);
    anchor.parentElement.appendChild(menu);
    setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
  }

  /**
   * Hooks prompt submission to apply Pre-Inference symbolic rewrite transparently.
   */
  function initPreInferenceInterception() {
    if (!symbolicRewriter || !symbolicVault) return;

    const inputEl = findPromptInputElement();
    if (!inputEl) return;

    // Attach typing listener to update shield indicator
    if (!inputEl.dataset.safeshareHooked) {
      inputEl.dataset.safeshareHooked = "true";
      inputEl.addEventListener("input", () => updateShieldIndicator(inputEl));
      inputEl.addEventListener("focus", () => updateShieldIndicator(inputEl));
      inputEl.addEventListener("keyup", () => updateShieldIndicator(inputEl));
    }

    installSubmitGuard();
    updateShieldIndicator(inputEl);
  }

  const SEND_BUTTON_SELECTOR =
    "button[data-testid='send-button'], button[aria-label*='Send'], button[aria-label*='Kirim'], fieldset button, form button[type='submit']";
  let submitGuardInstalled = false;
  let resubmitting = false;

  /**
   * Holds a send until the rewrite is in place. Listens on window in the capture phase, so it runs
   * before the chat site's own Enter / send handlers (ChatGPT handles them above the input box).
   * If the prompt needs rewriting: cancel this send, rewrite, give the editor (ProseMirror keeps
   * its own copy of the text) a moment to sync, then send again.
   */
  function installSubmitGuard() {
    if (submitGuardInstalled) return;
    submitGuardInstalled = true;

    const guard = (e, resend) => {
      if (resubmitting || !isPreInferenceEnabled() || !symbolicRewriter) return;
      const inputEl = findPromptInputElement();
      if (!inputEl) return;
      let rewritten;
      try {
        const text = getInputText(inputEl);
        if (!text || !text.trim()) return;
        rewritten = shieldRewrite(text);
      } catch (err) {
        console.warn("[SafeShare-AI] Pre-inference rewrite fallback:", err);
        return;
      }
      if (!rewritten.isTransformed) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      setInputText(inputEl, rewritten.sanitizedPrompt);
      console.log("[SafeShare-AI] Protected before sending:", rewritten.count, "item(s)");
      setTimeout(() => {
        resubmitting = true;
        try { resend(inputEl); } finally { setTimeout(() => (resubmitting = false), 300); }
      }, 120);
    };

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const inputEl = findPromptInputElement();
      if (!inputEl || !(e.target === inputEl || inputEl.contains(e.target))) return;
      guard(e, () => {
        const btn = document.querySelector(SEND_BUTTON_SELECTOR);
        if (btn && !btn.disabled) btn.click();
        else inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
      });
    }, true);

    window.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest && e.target.closest(SEND_BUTTON_SELECTOR);
      if (!btn) return;
      guard(e, () => btn.click());
    }, true);
  }

  /**
   * Safely mounts locally computed HTML badges without XSS injection or ProseMirror corruption.
   */
  function sanitizeAndMountHydration(node, htmlStr) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlStr, "text/html");
      // Strip dangerous tags
      const dangerous = doc.querySelectorAll("script, iframe, object, embed, style, link, meta");
      dangerous.forEach(el => el.remove());

      // Strip event handlers and javascript: URLs
      const allEls = doc.querySelectorAll("*");
      allEls.forEach(el => {
        for (let i = el.attributes.length - 1; i >= 0; i--) {
          const attr = el.attributes[i];
          const attrName = attr.name.toLowerCase();
          const attrVal = (attr.value || "").toLowerCase();
          if (attrName.startsWith("on") || attrVal.startsWith("javascript:") || attrName === "srcdoc") {
            el.removeAttribute(attr.name);
          }
        }
      });

      node.replaceChildren(...doc.body.childNodes);
    } catch (_) {
      node.innerHTML = htmlStr;
    }
  }

  /**
   * Performs an active hydration pass over all visible assistant message nodes.
   * If shield is disabled, reverts any existing local compute spans back to original expressions.
   * Resolves KaTeX math annotations, tables, code, and text containers.
   */
  function runHydrationPass() {
    if (!localCompute || !symbolicVault || typeof document === "undefined" || !document.body) return;
    const isEnabled = isPreInferenceEnabled();

    // If shield is disabled: un-hydrate all local compute spans so user sees raw symbols
    if (!isEnabled) {
      const hydratedSpans = document.querySelectorAll(".ss-local-compute, [data-expr]");
      hydratedSpans.forEach(span => {
        const origExpr = span.getAttribute("data-expr");
        if (origExpr) {
          const txtNode = document.createTextNode(decodeURIComponent(origExpr));
          span.replaceWith(txtNode);
        }
      });
      document.querySelectorAll("[data-safeshare-hydrated]").forEach(el => {
        delete el.dataset.safeshareHydrated;
      });
      return;
    }

    if (symbolicVault.size() === 0) return;
    const vaultData = symbolicVault.getAll();
    if (!vaultData || Object.keys(vaultData).length === 0) return;

    // Helper: detect if active streaming is ongoing
    const isStreamingActive = Boolean(
      document.querySelector(
        "[data-testid='stop-button'], button[aria-label*='Stop'], [data-is-streaming='true'], .result-streaming, [aria-label*='Stop response']"
      )
    );

    const isSymbolicMathContent = (str) =>
      /<S\d+>|\\langle\s*s?\d+\s*\\rangle|⟨\s*s?\d+\s*⟩|&lt;s?\d+&gt;|<s\d+>|\b(?:VAL\d+|S\d+_[A-Za-z0-9_]+)\b|(?:\d+(?:\.\d+)?%?|[+\-*^×÷·(]|\\times|\\cdot|\\div|\b(?:Rp\.?|IDR|USD|EUR|GBP|\$)\s*`?|(?<!\/)\/(?!\/))\s*S\d+\b|\bS\d+\b\s*(?:[-+*^×÷·)]|\\times|\\cdot|\\div|(?<!\/)\/(?!\/))|<code>[^<]*\bS\d+\b[^<]*<\/code>/i.test(str);

    // PASS 1: Hydrate KaTeX LaTeX equations in-place across ChatGPT, Claude, and DeepSeek
    const katexNodes = document.querySelectorAll("span.katex, div.katex-display, div[class*='math']");
    katexNodes.forEach((kNode) => {
      if (kNode.dataset.safeshareHydrated === "true") return;
      if (isPromptInputOrUIElement(kNode)) return;

      const annot = kNode.querySelector ? (kNode.querySelector("annotation[encoding='application/x-tex']") || kNode.querySelector("annotation")) : null;
      const tex = annot ? annot.textContent : "";
      if (tex && isSymbolicMathContent(tex)) {
        const res = localCompute.hydrateText(tex, vaultData, true);
        if (res.computedCount > 0) {
          const wrapper = document.createElement("span");
          wrapper.className = "ss-katex-hydrated";
          wrapper.dataset.safeshareHydrated = "true";
          sanitizeAndMountHydration(wrapper, res.hydratedText);
          kNode.replaceWith(wrapper);
        }
      }
    });

    // PASS 2: Hydrate leaf text blocks (ONLY ASSISTANT MESSAGES)
    // STRICT RULE: Never query user message bubbles, prompt inputs, or code blocks (<pre>)
    // to prevent Virtual DOM collisions and self-hydration loops.
    const leafNodes = document.querySelectorAll(
      "[data-markdown-text-style='assistant-message'] p, [data-markdown-text-style='assistant-message'] li, [data-markdown-text-style='assistant-message'] td, [data-markdown-text-style='assistant-message'] th, " +
      "[data-message-author-role='assistant'] p, [data-message-author-role='assistant'] li, [data-message-author-role='assistant'] td, [data-message-author-role='assistant'] th, " +
      ".font-claude-message p, .font-claude-message li, .font-claude-message td, .font-claude-message th, " +
      "div.ds-markdown p, div.ds-markdown li, div.ds-markdown td, div.ds-markdown th, " +
      ".chat-message-assistant p, .chat-message-assistant li, .chat-message-assistant td, .chat-message-assistant th"
    );

    leafNodes.forEach((node) => {
      if (node.dataset.safeshareHydrated === "true") return;
      if (isPromptInputOrUIElement(node)) return;
      if (node.closest("pre, .ss-katex-hydrated, [data-message-author-role='user'], [data-testid='user-message']")) return;
      // Skip if leaf node contains an un-hydrated KaTeX span (Pass 1 handles KaTeX widgets)
      if (node.querySelector && node.querySelector("span.katex:not([data-safeshare-hydrated='true'])")) return;

      // Quiescence check: if node is within an active streaming block or table, defer until settled
      if (isStreamingActive) {
        const table = node.closest("table");
        if (table) {
          const assistantContainer = table.closest("[data-message-author-role='assistant'], .font-claude-message, div.ds-markdown, .chat-message-assistant");
          if (assistantContainer && assistantContainer.lastElementChild === table) return;
        }
        const block = node.closest("p, li, td, th") || node;
        const parentContainer = block.parentElement;
        if (parentContainer && parentContainer.lastElementChild === block) return;
      }

      // Check unbalanced parentheses (incomplete streaming expression)
      const rawText = node.innerText || node.textContent || "";
      const openParens = (rawText.match(/\(/g) || []).length;
      const closeParens = (rawText.match(/\)/g) || []).length;
      if (openParens !== closeParens) return;

      const text = node.innerHTML;
      if (isSymbolicMathContent(text)) {
        const res = localCompute.hydrateText(text, vaultData, true);
        if (res.computedCount > 0) {
          sanitizeAndMountHydration(node, res.hydratedText);
          node.dataset.safeshareHydrated = "true";
        }
      }
    });
  }

  /**
   * Hydrates formulas in AI responses with locally computed numbers in client RAM.
   * Uses debounced quiescence to avoid crashing React Fiber streaming loops.
   */
  let hydrationDebounceTimer = null;
  function initLocalHydrationObserver() {
    if (!localCompute || !symbolicVault) return;

    // Run hydration pass immediately on existing elements (e.g. after tab refresh or navigation)
    runHydrationPass();

    const observer = new MutationObserver(() => {
      if (hydrationDebounceTimer) clearTimeout(hydrationDebounceTimer);
      hydrationDebounceTimer = setTimeout(() => {
        runHydrationPass();
      }, 350);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Safely extracts an element's text content while reverting any ephemeral local hydration badges
   * back to their raw symbolic form before exporting or sharing.
   * INVARIANT: Client-side decrypted RAM secrets MUST NEVER cross into the share payload!
   */
  function getCleanNodeContent(containerEl) {
    if (!containerEl) return "";
    // If no local compute badges exist, read layout text directly from the attached DOM node (fast & accurate)
    if (!containerEl.querySelector(".ss-local-compute, .ss-katex-hydrated, [data-expr]")) {
      return (containerEl.innerText || containerEl.textContent || "").trim();
    }
    try {
      // Clone container to avoid mutating the user's active reading view
      const clone = containerEl.cloneNode(true);
      // Find all hydrated local compute spans in the clone
      const hydratedSpans = clone.querySelectorAll(".ss-local-compute, .ss-katex-hydrated, [data-expr]");
      hydratedSpans.forEach(span => {
        const origExpr = span.getAttribute("data-expr");
        if (origExpr) {
          // Revert to original symbolic expression e.g. <S10>, <S1> / <S2>
          const textNode = document.createTextNode(decodeURIComponent(origExpr));
          span.replaceWith(textNode);
        }
      });
      const cleanText = clone.innerText || clone.textContent || "";
      return cleanText.trim() || (containerEl.innerText || containerEl.textContent || "").trim();
    } catch (_) {
      return (containerEl.innerText || containerEl.textContent || "").trim();
    }
  }

  /**
   * Identifies whether an element is inside the prompt composer, textarea, UI header/footer, or disclaimer.
   * Such elements must NEVER be extracted as chat conversation turns.
   */
  function isPromptInputOrUIElement(el) {
    if (!el) return true;
    if (!isVisibleElement(el)) return true;
    // Strictly exclude the user prompt composer input, form, user bubbles, and SafeShare UI
    if (el.closest("form, #prompt-textarea, fieldset, textarea, [contenteditable='true'], [data-message-author-role='user'], [data-testid='user-message'], .chat-message-user, [data-user-message-bubble='true'], #safeshare-modal-backdrop, #safeshare-shield-bar, #safeshare-action-pill")) {
      return true;
    }
    // Exclude disclaimer text (e.g. ChatGPT can make mistakes...)
    const txt = (el.innerText || el.textContent || "").trim();
    if (/^(?:ChatGPT can make mistakes|Free Research Preview|By messaging ChatGPT|Claude may make mistakes|DeepSeek can make mistakes)/i.test(txt)) {
      return true;
    }
    return false;
  }

  /**
   * Scopes search to the active conversation container hosting the visible prompt composer.
   * Prevents querying background/unmounted chat session panes in React/Next.js SPAs.
   */
  function getActiveConversationRoot() {
    const inputEl = findPromptInputElement();
    if (inputEl) {
      const main = inputEl.closest("main, [role='main']");
      if (main && isVisibleElement(main)) return main;
      const form = inputEl.closest("form");
      if (form && form.parentElement) {
        const parentMain = form.parentElement.closest("main, [role='main']");
        if (parentMain && isVisibleElement(parentMain)) return parentMain;
        return form.parentElement;
      }
    }
    const mains = Array.from(document.querySelectorAll("main, [role='main']")).filter(isVisibleElement);
    if (mains.length > 0) return mains[mains.length - 1];
    return document.body;
  }

  /**
   * Universal extractor for ChatGPT, Claude, and DeepSeek conversation nodes.
   * Returns empty array [] if the active chat has no messages sent yet.
   */
  function extractConversationTurns() {
    return tidyTurns(extractRawTurns());
  }

  /**
   * Cleans extracted turns before sharing:
   *  - removes the send-time shield's "[PRIVACY PROTOCOL: ...]" instruction (meant for the model,
   *    not part of the conversation)
   *  - drops a turn that repeats the previous one (nested elements matching the same message)
   */
  function tidyTurns(turns) {
    const out = [];
    for (const t of turns) {
      const content = t.content.replace(/\s*\[(?:PRIVACY PROTOCOL|PROTOKOL PRIVASI):[^\]]*\]\s*/g, "\n").trim();
      if (!content) continue;
      const prev = out[out.length - 1];
      if (prev && prev.role === t.role && prev.content === content) continue;
      out.push({ role: t.role, content });
    }
    return out;
  }

  function extractRawTurns() {
    const root = getActiveConversationRoot();
    let turns = extractTurnsFromContainer(root);
    if (turns.length === 0 && root !== document.body) {
      // Fallback: search document.body for visible turns only
      turns = extractTurnsFromContainer(document.body);
    }
    return turns;
  }

  function extractTurnsFromContainer(container) {
    if (!container) return [];
    const turns = [];

    // Strategy A (ChatGPT, 2026 layout): user bubbles and assistant markdown carry readable
    // data attributes; class names are hashed and change between releases.
    const bubbles = Array.from(container.querySelectorAll(
      "[data-user-message-bubble='true'], [data-markdown-text-style='assistant-message']"
    )).filter(el => !isPromptInputOrUIElement(el));
    if (bubbles.length > 0) {
      // A reply can be split over several markdown blocks: join blocks of the same turn
      let lastKey = null;
      for (const el of bubbles) {
        const role = el.matches("[data-user-message-bubble='true']") ? "user" : "assistant";
        const unit = el.closest("[data-chatgpt-search-unit-key], [data-chatgpt-selection-message-id]");
        const key = unit ? (unit.getAttribute("data-chatgpt-search-unit-key") || unit.getAttribute("data-chatgpt-selection-message-id")) : el;
        const content = getCleanNodeContent(el);
        if (!content) continue;
        const prev = turns[turns.length - 1];
        if (prev && prev.role === role && key === lastKey) prev.content += "\n\n" + content;
        else turns.push({ role, content });
        lastKey = key;
      }
      if (turns.length > 0) return turns;
    }

    // Strategy 0: High-accuracy ChatGPT data-message-author-role pattern
    const roleDivs = container.querySelectorAll("[data-message-author-role]");
    // Outermost only: a message element can contain another element with the same attribute
    const validRoleDivs = Array.from(roleDivs).filter(el =>
      !isPromptInputOrUIElement(el) && !(el.parentElement && el.parentElement.closest("[data-message-author-role]")));
    if (validRoleDivs.length > 0) {
      validRoleDivs.forEach((el) => {
        const role = el.getAttribute("data-message-author-role");
        const content = getCleanNodeContent(el);
        if (content) {
          turns.push({ role, content });
        }
      });
      if (turns.length > 0) return turns;
    }

    // Strategy 1: ChatGPT conversation-turn pattern (both article and div tags)
    const chatGptTurns = container.querySelectorAll("[data-testid^='conversation-turn']");
    const validTurns = Array.from(chatGptTurns).filter(el => !isPromptInputOrUIElement(el));
    if (validTurns.length > 0) {
      validTurns.forEach((turnEl) => {
        const isAssistant = turnEl.querySelector("[data-message-author-role='assistant'], div.markdown, [data-testid*='assistant']") !== null;
        // Prefer content subnode if present
        const contentNode = turnEl.querySelector("[data-message-author-role], div.markdown, div.whitespace-pre-wrap") || turnEl;
        const textContent = getCleanNodeContent(contentNode);
        if (textContent) {
          turns.push({
            role: isAssistant ? "assistant" : "user",
            content: textContent
          });
        }
      });
      if (turns.length > 0) return turns;
    }

    // Strategy 2: Claude DOM Pattern
    const claudeUserNodes = container.querySelectorAll("[data-testid='user-message'], div[class*='user-message']");
    const claudeAsstNodes = container.querySelectorAll(".font-claude-message, div[class*='standard-message'], div[class*='font-claude']");
    if (claudeUserNodes.length > 0 || claudeAsstNodes.length > 0) {
      const allClaude = container.querySelectorAll("[data-testid='user-message'], div[class*='user-message'], .font-claude-message, div[class*='standard-message'], div[class*='font-claude']");
      Array.from(allClaude).filter(el => !isPromptInputOrUIElement(el)).forEach((el) => {
        const isUser = el.getAttribute("data-testid") === "user-message" || (el.className && el.className.includes("user-message"));
        const textContent = getCleanNodeContent(el);
        if (textContent) {
          turns.push({
            role: isUser ? "user" : "assistant",
            content: textContent
          });
        }
      });
      if (turns.length > 0) return turns;
    }

    // Strategy 3: DeepSeek & generic markdown message turns
    const deepseekNodes = container.querySelectorAll("div.ds-markdown, div[class*='ds-markdown'], .chat-message, div[class*='message-bubble']");
    const validDeepseek = Array.from(deepseekNodes).filter(el => !isPromptInputOrUIElement(el));
    if (validDeepseek.length > 0) {
      validDeepseek.forEach((el) => {
        const isAsst = /assistant|ai|bot|markdown/i.test(el.className) || el.querySelector("[class*='assistant'], [class*='bot']") !== null;
        const textContent = getCleanNodeContent(el);
        if (textContent) {
          turns.push({
            role: isAsst ? "assistant" : "user",
            content: textContent
          });
        }
      });
      if (turns.length > 0) return turns;
    }

    // Chat is empty (no messages have been sent yet)
    return [];
  }

  let lastRecordedUrl = (typeof location !== "undefined" ? location.href : "");
  function handleSessionRouteChange() {
    if (typeof location === "undefined" || location.href === lastRecordedUrl) return;
    const oldUrl = lastRecordedUrl;
    lastRecordedUrl = location.href;

    const getChatId = (u) => {
      const m = (u || "").match(/(?:\/c\/|\/chat\/|\/a\/chat\/s\/)([a-zA-Z0-9_-]+)/);
      return m ? m[1] : null;
    };

    const oldId = getChatId(oldUrl);
    const newId = getChatId(location.href);

    // If transitioning from root/new chat to the newly created session for the same prompt, KEEP VAULT!
    const isNewChatToSession = !oldId && !!newId;
    const isSameChat = oldId && newId && oldId === newId;

    if (isNewChatToSession && newId && symbolicVault) {
      // Migrate secrets from "new" session to the newly assigned conversation ID
      symbolicVault.saveToSession(newId);
    } else if (!isSameChat) {
      // Truly different chat session: close modal and load secrets for this session (or clear)
      const existing = document.getElementById("safeshare-modal-backdrop");
      if (existing) existing.remove();

      if (symbolicVault) {
        if (newId) {
          symbolicVault.loadFromSession(newId);
        } else {
          symbolicVault.clear();
        }
      }
    }

    // Re-sync input and shield indicator for new session
    const inputEl = findPromptInputElement();
    if (inputEl) updateShieldIndicator(inputEl);
  }

  window.addEventListener("popstate", handleSessionRouteChange);

  // Periodic check to inject button & prompt shield once UI is loaded and track SPA navigation
  setInterval(() => {
    handleSessionRouteChange();
    initSafeShareButton();
    initPreInferenceInterception();
    runHydrationPass();
  }, 500);

  // Initialize inbound streaming local hydration observer
  initLocalHydrationObserver();

  // Listen to modal toggle events
  window.addEventListener("safeshare:shield_toggle", (e) => {
    const inputEl = findPromptInputElement();
    if (inputEl) updateShieldIndicator(inputEl);
    runHydrationPass();
  });

  // Extension bridge listener: responds to Web Viewer continuation requests
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.source === "SAFESHARE_EXTENSION_PING") {
      const respOrigin = (window && window.location && window.location.origin) ? window.location.origin : "*";
      window.postMessage({ source: "SAFESHARE_EXTENSION_PONG" }, respOrigin);
    } else if (event.data.source === "SAFESHARE_FORWARD_TO_AI") {
      const promptText = event.data.prompt;
      if (!promptText) return;
      const inputEl = findPromptInputElement();
      if (inputEl) {
        setInputText(inputEl, promptText);
        console.log("[SafeShare-AI] Injected continuation prompt directly into active session.");
      } else {
        // On a share page there is no chat box: open the chat site and paste it there
        const api = typeof browser !== "undefined" ? browser : chrome;
        api.runtime.sendMessage({ action: "OPEN_CHAT_WITH_PROMPT", platform: event.data.platform, prompt: promptText });
      }
    }
  });

  // Paste a continuation prompt left by the background worker (see OPEN_CHAT_WITH_PROMPT)
  (function deliverPendingContinuation() {
    const api = typeof browser !== "undefined" ? browser : chrome;
    if (!api || !api.storage || !api.storage.local) return;
    const hostFor = { ChatGPT: /chatgpt\.com|chat\.openai\.com/, Claude: /claude\.ai/, DeepSeek: /chat\.deepseek\.com/ };
    Promise.resolve(api.storage.local.get("safeshare_pending_continuation")).then((res) => {
      const pending = res && res.safeshare_pending_continuation;
      if (!pending || Date.now() - pending.at > 2 * 60 * 1000) return; // stale after 2 minutes
      if (!hostFor[pending.platform] || !hostFor[pending.platform].test(location.hostname)) return;
      api.storage.local.remove("safeshare_pending_continuation");

      const applyPrompt = (inputEl) => {
        setInputText(inputEl, pending.prompt);
        console.log("[SafeShare-AI] Pasted continuation prompt into the new chat.");
      };

      // Immediate check at t=0
      const immediateInput = findPromptInputElement();
      if (immediateInput) {
        applyPrompt(immediateInput);
        return;
      }

      // Fast-polling (40ms) so text is injected the instant the composer mounts
      let tries = 0;
      const timer = setInterval(() => {
        const inputEl = findPromptInputElement();
        if (inputEl) {
          clearInterval(timer);
          applyPrompt(inputEl);
        } else if (++tries > 100) { // ~4s max
          clearInterval(timer);
        }
      }, 40);
    });
  })();
})();
