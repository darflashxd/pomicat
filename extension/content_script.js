/**
 * SafeShare-AI — Content Script
 * Injects SafeShare action button into ChatGPT, Claude, and DeepSeek interfaces
 * and extracts conversation context.
 */

(function () {
  console.log("[SafeShare-AI] Extension content script active.");

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

  // Periodic check to inject button once UI is loaded
  setInterval(initSafeShareButton, 1500);
})();
