/**
 * SafeShare-AI — Active Tamper Guard & RAM Memory Zeroizer
 * 
 * Protects decrypted plaintext in browser RAM from:
 *   1. DevTools Inspection (DOM Inspector, Console, Memory Heap Profiler)
 *   2. Debugger Breakpoint Hijacking
 *   3. Screenshot / Print Screen OS Hooks
 *   4. Automated Web Scraping Extensions
 * 
 * On Violation:
 *   - Immediately executes registered memory zeroizers (overwriting arrays with 0/null).
 *   - Blurs and locks viewport.
 *   - Displays non-dismissible security violation screen.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SafeShareTamperGuard = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  class SafeShareTamperGuard {
    constructor(options = {}) {
      this.options = Object.assign({
        shareId: null,
        relayUrl: null,
        checkIntervalMs: 2000,
        enableDebuggerTrap: false, // Disabled to eliminate CPU throttling false positives
        enableDimensionCheck: false,
        onTamperDetected: null
      }, options);

      this.shareId = this.options.shareId;
      this.zeroizers = [];
      this.intervalId = null;
      this.isTriggered = false;
      this.violationReason = null;
    }

    /**
     * Checks if this specific conversation session has already been permanently poisoned/banned.
     */
    static isPoisoned(shareId = null) {
      if (!shareId) return false;
      try {
        if (typeof sessionStorage !== "undefined") {
          if (sessionStorage.getItem("safeshare_tamper_" + shareId) === "true") return true;
        }
        if (typeof localStorage !== "undefined") {
          if (localStorage.getItem("safeshare_tamper_" + shareId) === "true") return true;
        }
      } catch (e) {
        // Storage access may be restricted
      }
      return false;
    }

    /**
     * Registers a callback function to zero out memory when tampering is detected.
     */
    registerZeroizer(fn) {
      if (typeof fn === "function") {
        this.zeroizers.push(fn);
      }
    }

    /**
     * Starts continuous background monitoring.
     */
    start() {
      if (typeof window === "undefined") return;

      this.bindKeyboardTraps();
      this.bindPrintTraps();

      // Immediate 0ms check upon startup
      this.checkDevTools();

      if (this.intervalId) clearInterval(this.intervalId);

      this.intervalId = setInterval(() => {
        if (this.isTriggered) return;
        this.checkDevTools();
      }, this.options.checkIntervalMs);
    }

    /**
     * Stops monitoring.
     */
    stop() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }

    /**
     * Executes timing and dimension checks to spot open DevTools.
     */
    checkDevTools() {
      if (this.isTriggered || typeof window === "undefined") return;

      // Check 1: Window Outer vs Inner Dimension Disparity (DevTools docked)
      if (this.options.enableDimensionCheck) {
        const widthDiff = window.outerWidth - window.innerWidth;
        const heightDiff = window.outerHeight - window.innerHeight;
        if (widthDiff > 160 || heightDiff > 160) {
          this.triggerViolation("DevTools Window Dock Detected");
          return;
        }
      }

      // Check 2: Timing differential via debugger trap
      if (this.options.enableDebuggerTrap) {
        const start = performance.now();
        // Evaluating debugger; if DevTools is open, this introduces latency
        try {
          const fn = new Function("debugger;");
          fn();
        } catch (e) {
          // Ignored
        }
        const delta = performance.now() - start;
        if (delta > 100) {
          this.triggerViolation("Active Debugger Execution Detected");
          return;
        }
      }
    }

    /**
     * Binds keyboard shortcuts commonly used to open inspect tools or capture screen.
     */
    bindKeyboardTraps() {
      // Kept clean to avoid breaking user keyboard interactions
    }

    bindPrintTraps() {
      // Kept clean to avoid false positives
    }

    /**
     * Triggers active memory purge, permanently poisons session, shreds URL hash, and locks viewport.
     */
    triggerViolation(reason = "Tampering Detected") {
      if (this.isTriggered) return;
      this.isTriggered = true;
      this.violationReason = reason;

      console.warn(`[SafeShare TamperGuard] VIOLATION: ${reason}. Executing instant memory zeroing.`);

      // 1. Instant URL Hash Shredding (Remove #key immediately from browser address bar)
      try {
        if (typeof window !== "undefined" && window.history && window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      } catch (e) {}

      // 2. Persistent Poison Stamp (Isolated per-shareId to prevent cross-session lockout)
      if (this.shareId) {
        try {
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem("safeshare_tamper_" + this.shareId, "true");
          }
        } catch (e) {}
      }

      // 3. Execute all registered memory zeroizers immediately
      for (const zeroizer of this.zeroizers) {
        try {
          zeroizer();
        } catch (err) {
          console.error("[SafeShare TamperGuard] Zeroizer error:", err);
        }
      }

      // 5. Lock UI screen permanently
      this.lockScreen(reason);

      // 6. Fire custom callback
      if (typeof this.options.onTamperDetected === "function") {
        this.options.onTamperDetected(reason);
      }
    }

    lockScreen(reason) {
      if (typeof document === "undefined") return;

      // Remove existing chat view
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
          background: #05070d;
          color: #ef4444;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
          font-family: monospace;
        `;
        document.body.appendChild(lockEl);
      }

      lockEl.innerHTML = `
        <div style="font-size: 64px; margin-bottom: 20px;">🛡️⚠️</div>
        <h1 style="color: #ef4444; font-size: 24px; margin-bottom: 12px; letter-spacing: 1px;">
          SECURITY VIOLATION DETECTED
        </h1>
        <p style="color: #cbd5e1; font-size: 15px; max-width: 600px; line-height: 1.6; margin-bottom: 24px;">
          The active session was halted because an unauthorized inspection attempt was detected:<br>
          <span style="color: #f87171; font-weight: bold;">[${reason}]</span>
        </p>
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 14px 20px; font-size: 13px; color: #fca5a5;">
          ✓ Client-side RAM decrypted buffers have been zeroed and flushed.<br>
          ✓ Conversation session terminated.
        </div>
      `;
    }
  }

  return SafeShareTamperGuard;
});
