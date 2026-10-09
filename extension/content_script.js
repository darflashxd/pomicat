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

  function isPreInferenceEnabled() {
    try {
      return localStorage.getItem("safeshare_pre_inference") !== "false";
    } catch (_) {
      return true;
    }
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
   * Finds the active prompt input area across ChatGPT, Claude, and DeepSeek.
   */
  function findPromptInputElement() {
    return (
      document.querySelector("#prompt-textarea") ||
      document.querySelector("div[contenteditable='true'][data-id]") ||
      document.querySelector("div[contenteditable='true']") ||
      document.querySelector("fieldset div[contenteditable='true']") ||
      document.querySelector("textarea[data-id]") ||
      document.querySelector("textarea")
    );
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
   */
  function updateShieldIndicator(inputEl) {
    if (!symbolicRewriter || !inputEl) return;

    let indicator = document.getElementById("safeshare-shield-indicator");
    const isEnabled = isPreInferenceEnabled();

    if (!indicator) {
      indicator = document.createElement("div");
      indicator.id = "safeshare-shield-indicator";
      indicator.title = "Pre-Inference Symbolic Shield: Click to toggle on/off";
      indicator.addEventListener("click", () => {
        const nextState = !isPreInferenceEnabled();
        localStorage.setItem("safeshare_pre_inference", nextState ? "true" : "false");
        updateShieldIndicator(inputEl);
      });

      // Mount shield bar right above the prompt composer to avoid overflow:hidden clipping
      const composerForm = inputEl.closest("form") || inputEl.closest("[class*='composer']") || inputEl.closest("div.relative") || inputEl.parentElement;
      let bar = document.getElementById("safeshare-shield-bar");
      if (!bar && composerForm && composerForm.parentElement) {
        bar = document.createElement("div");
        bar.id = "safeshare-shield-bar";
        bar.style.cssText = "display: flex; justify-content: flex-end; width: 100%; margin-bottom: 6px; padding: 0 4px; pointer-events: none; z-index: 99999;";
        composerForm.parentElement.insertBefore(bar, composerForm);
      }
      if (bar) {
        indicator.style.pointerEvents = "auto";
        bar.appendChild(indicator);
      } else if (inputEl.parentElement) {
        inputEl.parentElement.style.position = inputEl.parentElement.style.position || "relative";
        inputEl.parentElement.appendChild(indicator);
      }
    }

    if (!isEnabled) {
      indicator.className = "shield-disabled";
      indicator.innerHTML = `<span>🛡️ Shield Off</span>`;
      return;
    }

    const currentText = getInputText(inputEl);
    const analysis = symbolicRewriter.analyze(currentText);

    if (analysis.hasSensitive) {
      indicator.className = "shield-active";
      indicator.innerHTML = `<span>🛡️ ${analysis.detectedItems.length} Secret${analysis.detectedItems.length > 1 ? "s" : ""} Protected (&lt;S1&gt;)</span>`;
    } else {
      indicator.className = "shield-active";
      indicator.innerHTML = `<span>🛡️ Shield Ready</span>`;
    }
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

      // Hook Enter key
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          handlePreInferencePromptSubmit(inputEl);
        }
      }, true); // Capture phase
    }

    // Hook Send Buttons
    const sendButtons = document.querySelectorAll(
      "button[data-testid='send-button'], button[aria-label*='Send'], button[aria-label*='Kirim'], fieldset button"
    );
    sendButtons.forEach((btn) => {
      if (!btn.dataset.safeshareHooked) {
        btn.dataset.safeshareHooked = "true";
        btn.addEventListener("click", () => handlePreInferencePromptSubmit(inputEl), true);
      }
    });

    updateShieldIndicator(inputEl);
  }

  function handlePreInferencePromptSubmit(inputEl) {
    if (!isPreInferenceEnabled() || !symbolicRewriter) return;

    try {
      const currentText = getInputText(inputEl);
      if (!currentText || currentText.trim().length === 0) return;

      const rewritten = symbolicRewriter.rewrite(currentText);
      if (rewritten.isTransformed) {
        console.log("[SafeShare-AI] Pre-Inference Rewrite applied:", rewritten.symbols);
        setInputText(inputEl, rewritten.sanitizedPrompt);
      }
    } catch (err) {
      console.warn("[SafeShare-AI] Pre-inference rewrite fallback:", err);
    }
  }

  /**
   * Hydrates formulas in AI responses with locally computed numbers in client RAM.
   */
  function initLocalHydrationObserver() {
    if (!localCompute || !symbolicVault) return;

    const observer = new MutationObserver(() => {
      if (symbolicVault.size() === 0) return;
      const vaultData = symbolicVault.getAll();

      // Find assistant text containers
      const asstNodes = document.querySelectorAll(
        "[data-message-author-role='assistant'] p, [data-message-author-role='assistant'] li, .font-claude-message p"
      );

      asstNodes.forEach((node) => {
        if (node.dataset.safeshareHydrated) return;
        const text = node.innerHTML;

        if (/<S\d+>|\bS\d+\b/.test(text)) {
          const res = localCompute.hydrateText(text, vaultData, true);
          if (res.computedCount > 0) {
            node.innerHTML = res.hydratedText;
            node.dataset.safeshareHydrated = "true";
          }
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Universal extractor for ChatGPT, Claude, and DeepSeek conversation nodes.
   */
  function extractConversationTurns() {
    const turns = [];

    // 0. High-accuracy ChatGPT data-message-author-role pattern
    const roleDivs = document.querySelectorAll("[data-message-author-role]");
    if (roleDivs.length > 0) {
      roleDivs.forEach((el) => {
        const role = el.getAttribute("data-message-author-role");
        const content = el.innerText.trim();
        if (content) {
          turns.push({ role, content });
        }
      });
      return turns;
    }

    // 1. ChatGPT article turn pattern
    const chatGptArticles = document.querySelectorAll("article[data-testid^='conversation-turn']");
    if (chatGptArticles.length > 0) {
      chatGptArticles.forEach((art) => {
        const isAssistant = art.querySelector("[data-message-author-role='assistant']") !== null;
        const textContent = art.innerText || "";
        turns.push({
          role: isAssistant ? "assistant" : "user",
          content: textContent.trim()
        });
      });
      return turns;
    }

    // 2. Claude DOM Pattern
    const claudeMessages = document.querySelectorAll("[data-testid='user-message'], .font-claude-message");
    if (claudeMessages.length > 0) {
      claudeMessages.forEach((el) => {
        const isUser = el.getAttribute("data-testid") === "user-message";
        turns.push({
          role: isUser ? "user" : "assistant",
          content: el.innerText.trim()
        });
      });
      return turns;
    }

    // 3. Fallback: Generic turn extraction
    const allParas = document.querySelectorAll("main p, .chat-message, [role='presentation'] p");
    allParas.forEach((p, idx) => {
      if (p.innerText.trim()) {
        turns.push({
          role: idx % 2 === 0 ? "user" : "assistant",
          content: p.innerText.trim()
        });
      }
    });

    return turns;
  }

  // Periodic check to inject button & prompt shield once UI is loaded
  setInterval(() => {
    initSafeShareButton();
    initPreInferenceInterception();
  }, 1500);

  // Initialize inbound streaming local hydration observer
  initLocalHydrationObserver();

  // Listen to modal toggle events
  window.addEventListener("safeshare:shield_toggle", (e) => {
    const inputEl = findPromptInputElement();
    if (inputEl) updateShieldIndicator(inputEl);
  });
})();
