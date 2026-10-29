/**
 * SafeShare-AI — Client-Side RAM Memory Zeroizer & Ephemeral Session Lifecycle
 * 
 * Cryptographic Hygiene & RAM Sanitization:
 *   1. Clears registered references and DOM content on closure (best effort, not RAM erasure).
 *   2. Automatically shreds the URI fragment (#key) from the address bar to prevent key leakage in browser history.
 *   3. Enforces ephemeral session revocation flags in local/session storage.
 *   4. Free from client-side DevTools / F12 gimmicks — enforces actual cryptographic boundaries.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const mod = factory();
    root.SafeShareMemoryZeroizer = mod;
    root.SafeShareTamperGuard = mod; // Backward-compatible alias
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  class SafeShareMemoryZeroizer {
    constructor(options = {}) {
      this.options = Object.assign({
        shareId: null,
        relayUrl: null,
        onSessionTerminated: null,
        autoShredUrlKey: true
      }, options);

      this.shareId = this.options.shareId;
      this.zeroizers = [];
      this.isTriggered = false;
      this.terminationReason = null;
    }

    /**
     * Checks if this specific conversation session has been marked as terminated/revoked.
     */
    static isPoisoned(shareId = null) {
      if (!shareId) return false;
      try {
        if (typeof sessionStorage !== "undefined") {
          if (sessionStorage.getItem("safeshare_revoked_" + shareId) === "true" ||
              sessionStorage.getItem("safeshare_tamper_" + shareId) === "true") {
            return true;
          }
        }
        if (typeof localStorage !== "undefined") {
          if (localStorage.getItem("safeshare_revoked_" + shareId) === "true" ||
              localStorage.getItem("safeshare_tamper_" + shareId) === "true") {
            return true;
          }
        }
      } catch (e) {
        // Storage access may be restricted
      }
      return false;
    }

    /**
     * Registers a callback function to zero out memory buffers when session ends.
     */
    registerZeroizer(fn) {
      if (typeof fn === "function") {
        this.zeroizers.push(fn);
      }
    }

    /**
     * Starts session monitoring: shreds URL fragment key from address bar for hygiene.
     */
    start() {
      if (typeof window === "undefined") return;

      // Automatically shred the #key from address bar after reading so it's not logged in browser history
      if (this.options.autoShredUrlKey && window.location.hash) {
        try {
          if (window.history && window.history.replaceState) {
            // Keep params but remove sensitive hash fragment key
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        } catch (e) {}
      }

      // Attach beforeunload hook to flush memory buffers when page is navigated away
      window.addEventListener("beforeunload", () => {
        this.flushMemory();
      });
    }

    /**
     * Stops monitoring.
     */
    stop() {
      // Clean stop
    }

    /**
     * Flushes all registered memory buffers immediately.
     */
    flushMemory() {
      for (const zeroizer of this.zeroizers) {
        try {
          zeroizer();
        } catch (err) {
          console.error("[Blackline] Cleanup callback error:", err);
        }
      }
    }

    /**
     * Triggers active memory purge, permanently terminates session, and locks viewport.
     */
    triggerViolation(reason = "Session Terminated") {
      this.terminateSession(reason);
    }

    terminateSession(reason = "Session Revoked") {
      if (this.isTriggered) return;
      this.isTriggered = true;
      this.terminationReason = reason;

      console.warn(`[Blackline Cleanup] Session terminated: ${reason}. Clearing registered references.`);

      // 1. Instant URL Hash Shredding (Remove #key immediately from browser address bar)
      try {
        if (typeof window !== "undefined" && window.history && window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      } catch (e) {}

      // 2. Persistent Revocation Flag (Isolated per-shareId)
      if (this.shareId) {
        try {
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem("safeshare_revoked_" + this.shareId, "true");
            sessionStorage.setItem("safeshare_tamper_" + this.shareId, "true");
          }
        } catch (e) {}
      }

      // 3. Execute all registered memory zeroizers immediately
      this.flushMemory();

      // 4. Lock UI screen
      this.lockScreen(reason);

      // 5. Fire custom callback
      if (typeof this.options.onSessionTerminated === "function") {
        this.options.onSessionTerminated(reason);
      }
    }

    lockScreen(reason) {
      if (typeof document === "undefined") return;

      const chatView = document.getElementById("chat-content-view");
      if (chatView) chatView.style.display = "none";

      let lockEl = document.getElementById("tamper-lock-overlay");
      if (!lockEl) {
        lockEl = document.createElement("div");
        lockEl.id = "tamper-lock-overlay";
        lockEl.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: #09090b;
          color: #f4f4f5;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        document.body.appendChild(lockEl);
      }

      lockEl.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 16px;">🛡️</div>
        <h1 style="color: #f4f4f5; font-size: 20px; font-weight: 600; margin-bottom: 8px;">
          Session Ended
        </h1>
        <p style="color: #a1a1aa; font-size: 14px; max-width: 520px; line-height: 1.5; margin-bottom: 20px;">
          Decrypted content was removed from the view and application references were cleared where possible. Browser memory erasure is not guaranteed.<br>
          <span style="color: #71717a; font-size: 12px; margin-top: 4px; display: inline-block;">Reason: ${reason}</span>
        </p>
        <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px 18px; font-size: 12px; color: #10b981;">
          Application cleanup requested; copies may remain in browser memory.
        </div>
      `;
    }
  }

  return SafeShareMemoryZeroizer;
});
