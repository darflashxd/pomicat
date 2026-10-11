/**
 * SafeShare-AI — Zero-Clipboard Continuation Bridge
 * 
 * Securely forks sanitized conversation context into ChatGPT, Claude, or DeepSeek:
 *   1. Direct In-Memory Extension Messaging (0% Clipboard Footprint)
 *   2. Web Standalone Mode with 30-Second OS Clipboard Auto-Purge Timer
 *   3. Prevents persistent clipboard snooping by infostealer malware
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SafeShareExtensionBridge = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const PLATFORM_URLS = {
    ChatGPT: "https://chatgpt.com",
    Claude: "https://claude.ai/new",
    DeepSeek: "https://chat.deepseek.com"
  };

  class SafeShareExtensionBridge {
    constructor() {
      this.extensionDetected = false;
      this.autoPurgeTimer = null;
      this.initListener();
    }

    initListener() {
      if (typeof window === "undefined") return;

      window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        if (!event.data || typeof event.data !== "object") return;
        if (event.data.source === "SAFESHARE_EXTENSION_PONG") {
          this.extensionDetected = true;
          console.log("[SafeShare Bridge] SafeShare browser extension detected on client machine.");
        }
      });

      // Ping for extension presence (only same-origin)
      window.postMessage({ source: "SAFESHARE_EXTENSION_PING" }, window.location.origin);
    }

    /**
     * Checks if SafeShare browser extension is listening.
     */
    async pingExtension(timeoutMs = 300) {
      if (this.extensionDetected) return true;
      if (typeof window === "undefined") return false;

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          window.removeEventListener("message", handler);
          resolve(false);
        }, timeoutMs);

        const handler = (event) => {
          if (event.data && event.data.source === "SAFESHARE_EXTENSION_PONG") {
            clearTimeout(timer);
            window.removeEventListener("message", handler);
            this.extensionDetected = true;
            resolve(true);
          }
        };

        window.addEventListener("message", handler);
        const targetOrigin = (window && window.location && window.location.origin) ? window.location.origin : "*";
      window.postMessage({ source: "SAFESHARE_EXTENSION_PING" }, targetOrigin);
      });
    }

    /**
     * Injects continuation context directly into the target AI platform.
     */
    async forwardToAIPlatform(platform, turns) {
      const continuationPrompt = SafeShareExtensionBridge.buildContinuationPrompt(turns);
      const targetUrl = PLATFORM_URLS[platform] || "https://chatgpt.com";

      const hasExt = await this.pingExtension(200);
      if (hasExt) {
        const targetOrigin = window.location.origin;
        window.postMessage({
          source: "SAFESHARE_FORWARD_TO_AI",
          platform: platform,
          prompt: continuationPrompt
        }, targetOrigin);
        return {
          success: true,
          mode: "extension_bridge",
          message: `Injected context directly into ${platform} via SafeShare Extension! (0% Clipboard Footprint)`
        };
      }

      // Standalone Web Mode: Copy with Auto-Purge Protection (30s)
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(continuationPrompt);
          this.scheduleClipboardPurge(30);

          // Open platform in new tab
          if (typeof window !== "undefined") {
            window.open(targetUrl, "_blank");
          }

          return {
            success: true,
            mode: "clipboard_autopurge",
            continuationPrompt: continuationPrompt,
            message: `Sanitized context copied! Opening ${platform} in a new tab.`
          };
        } catch (err) {
          return {
            success: false,
            mode: "error",
            continuationPrompt: continuationPrompt,
            message: "Unable to write to clipboard. Browser permissions denied."
          };
        }
      }

      return {
        success: false,
        mode: "manual",
        continuationPrompt: continuationPrompt,
        message: `Please open ${platform} manually and paste continuation prompt.`
      };
    }

    /**
     * Builds the hand-off prompt for a new chat, within a size budget:
     *  - explains the placeholders and asks the model not to reconstruct them
     *  - keeps the newest turns whole, shortens long older answers, drops the oldest turns
     * No model is involved, so nothing leaves the browser to make it.
     */
    static buildContinuationPrompt(turns, { budget = 12000, longTurn = 1500 } = {}) {
      const header =
        "Continue an earlier conversation. Private details were removed before it was shared: " +
        "anything in square or angle brackets, like [User_A], [REDACTED_FINANCIAL_1] or <S1>, is a placeholder. " +
        "Keep using the same placeholders, and don't guess or work out the values behind them.";
      const footer = "Pick up from the last message above. My next message follows.";
      // Strip the viewer's zero-width watermark: it is noise (and tokens) for the next model
      // Strip the viewer's zero-width watermark and any send-time shield instruction (links made by
      // older versions still contain it): both are noise for the next model
      const fmt = (t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content
        .replace(/[​-‍⁠﻿]/g, "")
        .replace(/\s*\[PRIVACY PROTOCOL:[^\]]*\]\s*/g, "\n")
        .trim()}`;
      // Drop a turn identical to the one before it (duplicate extraction in older links)
      turns = turns.filter((t, i) => !(i > 0 && t.role === turns[i - 1].role && t.content === turns[i - 1].content));
      const shorten = (t) => t.content.length <= longTurn ? t
        : { ...t, content: t.content.slice(0, longTurn).trimEnd() + " […shortened]" };

      const kept = [];
      let used = header.length + footer.length + 40;
      for (let i = turns.length - 1; i >= 0; i--) {
        // The last two turns stay whole; older long answers are shortened
        const turn = i >= turns.length - 2 ? turns[i] : shorten(turns[i]);
        const text = fmt(turn);
        if (used + text.length > budget && kept.length) break;
        kept.unshift(text.length > budget ? text.slice(0, budget - used) + " […shortened]" : text);
        used += text.length + 2;
      }
      const omitted = turns.length - kept.length;
      const note = omitted ? `(${omitted} earlier message${omitted === 1 ? "" : "s"} omitted)\n\n` : "";
      return `${header}\n\n---\n${note}${kept.join("\n\n")}\n---\n\n${footer}`;
    }

    /**
     * Ephemeral clipboard management: automatically wipes copied prompt from OS clipboard after timeout.
     */
    scheduleClipboardPurge(seconds = 30) {
      if (this.autoPurgeTimer) {
        clearTimeout(this.autoPurgeTimer);
      }
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        this.autoPurgeTimer = setTimeout(async () => {
          try {
            await navigator.clipboard.writeText("");
            console.log("[SafeShare Bridge] Ephemeral clipboard auto-purged after timeout.");
          } catch (_) {}
        }, seconds * 1000);
      }
    }
  }

  return SafeShareExtensionBridge;
});
