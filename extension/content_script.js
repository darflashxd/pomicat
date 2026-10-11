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
   * Strictly filters out sidebar items, chat rename inputs, and non-composer elements.
   */
  function findPromptInputElement() {
    const isValidInput = (el) => {
      if (!el || typeof document === "undefined" || !document.body || !document.body.contains(el)) return false;
      // Exclude sidebar search, chat rename input, and elements inside modals/headers
      if (el.closest("#safeshare-modal-backdrop, aside, nav, [class*='sidebar'], header")) return false;
      return true;
    };

    const candidates = [
      document.querySelector("#prompt-textarea"),
      document.querySelector("form textarea"),
      document.querySelector("form [contenteditable='true']"),
      document.querySelector("div.ProseMirror[contenteditable='true']"),
      document.querySelector("[data-testid='chat-input']"),
      document.querySelector("textarea[data-id='root']"),
      document.querySelector("textarea[placeholder*='Message' i], textarea[placeholder*='Pesan' i], textarea[placeholder*='Ask' i]"),
      document.querySelector("div[contenteditable='true'][data-placeholder]"),
      document.querySelector("fieldset div[contenteditable='true']"),
      document.querySelector("textarea")
    ];

    for (const el of candidates) {
      if (isValidInput(el)) return el;
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
      indicator.title = "Pre-Inference Symbolic Shield: Click to toggle on/off";
      indicator.addEventListener("click", (e) => {
        e.stopPropagation();
        const nextState = !isPreInferenceEnabled();
        localStorage.setItem("safeshare_pre_inference", nextState ? "true" : "false");
        updateShieldIndicator(inputEl);
        runHydrationPass();
      });
      indicator.style.pointerEvents = "auto";
      bar.appendChild(indicator);
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
      inputEl.addEventListener("keyup", () => updateShieldIndicator(inputEl));

      // Hook Enter key
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          handlePreInferencePromptSubmit(inputEl);
        }
      }, true); // Capture phase
    }

    // Hook Send Buttons
    const sendButtons = document.querySelectorAll(
      "button[data-testid='send-button'], button[aria-label*='Send'], button[aria-label*='Kirim'], fieldset button, form button[type='submit']"
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

    // Selector for all assistant message content containers
    const asstNodes = document.querySelectorAll(
      "[data-markdown-text-style='assistant-message'] p, [data-markdown-text-style='assistant-message'] li, [data-markdown-text-style='assistant-message'] td, [data-markdown-text-style='assistant-message'] th, [data-markdown-text-style='assistant-message'] pre, [data-markdown-text-style='assistant-message'] code, [data-markdown-text-style='assistant-message'] span.katex, [data-markdown-text-style='assistant-message'] div[class*='math'], " +
      "[data-message-author-role='assistant'],[data-message-author-role='assistant'] p, [data-message-author-role='assistant'] li, [data-message-author-role='assistant'] td, [data-message-author-role='assistant'] th, [data-message-author-role='assistant'] pre, [data-message-author-role='assistant'] code, [data-message-author-role='assistant'] div.markdown, [data-message-author-role='assistant'] div[class*='math'], [data-message-author-role='assistant'] span.katex, .font-claude-message, .font-claude-message p, .font-claude-message li, .font-claude-message td, .font-claude-message pre, .font-claude-message code, .chat-message-assistant, .chat-message-assistant p, .chat-message-assistant td"
    );

    asstNodes.forEach((node) => {
      if (node.dataset.safeshareHydrated === "true") return;

      // Check if node is KaTeX with annotation
      const katexAnnotation = node.querySelector ? node.querySelector("annotation[encoding='application/x-tex']") : null;
      if (katexAnnotation) {
        const tex = katexAnnotation.textContent || "";
        if (/<S\d+>|\\langle\s*s?\d+\s*\\rangle|⟨\s*s?\d+\s*⟩|&lt;s?\d+&gt;|<s\d+>|\bs?\d+\b/i.test(tex)) {
          const res = localCompute.hydrateText(tex, vaultData, true);
          if (res.computedCount > 0) {
            sanitizeAndMountHydration(node, res.hydratedText);
            node.dataset.safeshareHydrated = "true";
            return;
          }
        }
      }

      const text = node.innerHTML;
      if (/<S\d+>|\\langle\s*s?\d+\s*\\rangle|⟨\s*s?\d+\s*⟩|&lt;s?\d+&gt;|<s\d+>|\bs\d+\b/i.test(text)) {
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
   */
  function initLocalHydrationObserver() {
    if (!localCompute || !symbolicVault) return;

    // Run hydration pass immediately on existing elements (e.g. after tab refresh or navigation)
    runHydrationPass();

    const observer = new MutationObserver(() => {
      runHydrationPass();
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
    if (!containerEl.querySelector(".ss-local-compute, [data-expr]")) {
      return (containerEl.innerText || containerEl.textContent || "").trim();
    }
    try {
      // Clone container to avoid mutating the user's active reading view
      const clone = containerEl.cloneNode(true);
      // Find all hydrated local compute spans in the clone
      const hydratedSpans = clone.querySelectorAll(".ss-local-compute, [data-expr]");
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
    // Strictly exclude the user prompt composer input, form, and SafeShare UI
    if (el.closest("form, #prompt-textarea, fieldset, textarea, #safeshare-modal-backdrop, #safeshare-shield-bar, #safeshare-action-pill")) {
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
      const content = t.content.replace(/\s*\[PRIVACY PROTOCOL:[^\]]*\]\s*/g, "\n").trim();
      if (!content) continue;
      const prev = out[out.length - 1];
      if (prev && prev.role === t.role && prev.content === content) continue;
      out.push({ role: t.role, content });
    }
    return out;
  }

  function extractRawTurns() {
    const turns = [];

    // Strategy A (ChatGPT, 2026 layout): user bubbles and assistant markdown carry readable
    // data attributes; class names are hashed and change between releases.
    const bubbles = Array.from(document.querySelectorAll(
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
    const roleDivs = document.querySelectorAll("[data-message-author-role]");
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
    const chatGptTurns = document.querySelectorAll("[data-testid^='conversation-turn']");
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
    const claudeUserNodes = document.querySelectorAll("[data-testid='user-message'], div[class*='user-message']");
    const claudeAsstNodes = document.querySelectorAll(".font-claude-message, div[class*='standard-message'], div[class*='font-claude']");
    if (claudeUserNodes.length > 0 || claudeAsstNodes.length > 0) {
      const allClaude = document.querySelectorAll("[data-testid='user-message'], div[class*='user-message'], .font-claude-message, div[class*='standard-message'], div[class*='font-claude']");
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
    const deepseekNodes = document.querySelectorAll("div.ds-markdown, div[class*='ds-markdown'], .chat-message, div[class*='message-bubble']");
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

  // Periodic check to inject button & prompt shield once UI is loaded
  setInterval(() => {
    initSafeShareButton();
    initPreInferenceInterception();
    runHydrationPass();
  }, 1500);

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
      let tries = 0;
      const timer = setInterval(() => {
        const inputEl = findPromptInputElement();
        if (inputEl || ++tries > 40) clearInterval(timer); // chat apps render the input late; give up after ~20s
        if (inputEl) {
          setInputText(inputEl, pending.prompt);
          console.log("[SafeShare-AI] Pasted continuation prompt into the new chat.");
        }
      }, 500);
    });
  })();
})();
