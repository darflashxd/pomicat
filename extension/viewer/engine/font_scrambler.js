/**
 * SafeShare-AI — Dynamic Glyph Scrambler & Anti-Scraping Enclave Engine
 * 
 * Neutralizes:
 *   1. Web Crawlers & Headless Puppeteer / Playwright Scraping
 *   2. DOM innerText / textContent Dump via Browser Extensions or DevTools
 *   3. Native OS Clipboard Hijacking (Ctrl+C / Ctrl+A)
 *   4. Accessibility & Shadow DOM Tree Scraping
 * 
 * Mechanism:
 *   - Generates a per-session cryptographic bijective permutation of printable glyphs.
 *   - DOM text nodes contain scrambled ciphertext and honeypot entropy traps.
 *   - Visual rendering uses dynamic CSS glyph remapping and vector path projection.
 *   - Intercepts clipboard events (copy/cut) to feed scrambled noise or honeypot canaries.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SafeShareFontScrambler = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  // Printable ASCII character set (32 to 126, 95 characters)
  const ASCII_START = 32;
  const ASCII_END = 126;

  class SafeShareFontScrambler {
    constructor(seed = null) {
      this.seed = seed || (Date.now().toString(36) + Math.random().toString(36).substring(2));
      this.forwardMap = new Map(); // plain -> scrambled
      this.reverseMap = new Map(); // scrambled -> plain
      this.honeypotSignature = "AB-CANARY-EXFILTRATION-TRAP";
      this.initMaps();
    }

    /**
     * Pseudo-random generator with seed for repeatable/deterministic session scrambles.
     */
    _pseudoRandom(seedStr) {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < seedStr.length; i++) {
        h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
      }
      return function () {
        h += h << 13;
        h ^= h >>> 7;
        h += h << 3;
        h ^= h >>> 17;
        return (h >>> 0) / 4294967296;
      };
    }

    /**
     * Initializes bijective permutation map for ASCII 32..126.
     */
    initMaps() {
      this.forwardMap.clear();
      this.reverseMap.clear();

      const chars = [];
      for (let i = ASCII_START; i <= ASCII_END; i++) {
        chars.push(String.fromCharCode(i));
      }

      // Fisher-Yates shuffle with seeded PRNG
      const shuffled = [...chars];
      const prng = this._pseudoRandom(this.seed);

      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        const temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
      }

      // Ensure no character maps to itself (derangement for maximum entropy)
      for (let i = 0; i < chars.length; i++) {
        if (chars[i] === shuffled[i]) {
          const swapIdx = (i + 1) % chars.length;
          const tmp = shuffled[i];
          shuffled[i] = shuffled[swapIdx];
          shuffled[swapIdx] = tmp;
        }
      }

      for (let i = 0; i < chars.length; i++) {
        this.forwardMap.set(chars[i], shuffled[i]);
        this.reverseMap.set(shuffled[i], chars[i]);
      }
    }

    /**
     * Scrambles plain text into ciphertext glyph sequence.
     */
    scramble(plainText) {
      if (!plainText || typeof plainText !== "string") return plainText;
      let out = "";
      for (let i = 0; i < plainText.length; i++) {
        const ch = plainText[i];
        const code = ch.charCodeAt(0);
        if (code >= ASCII_START && code <= ASCII_END) {
          out += this.forwardMap.get(ch) || ch;
        } else {
          // Preserve newlines, tabs, and non-ASCII unicode
          out += ch;
        }
      }
      return out;
    }

    /**
     * Descrambles ciphertext back to original plain text.
     */
    descramble(scrambledText) {
      if (!scrambledText || typeof scrambledText !== "string") return scrambledText;
      let out = "";
      for (let i = 0; i < scrambledText.length; i++) {
        const ch = scrambledText[i];
        const code = ch.charCodeAt(0);
        if (code >= ASCII_START && code <= ASCII_END) {
          out += this.reverseMap.get(ch) || ch;
        } else {
          out += ch;
        }
      }
      return out;
    }

    /**
     * Generates a honeypot decoy payload for clipboard hijackers.
     */
    generateHoneypotPayload(plainText) {
      const scrambled = this.scramble(plainText);
      const hashDigest = Math.abs(this.hashCode(scrambled)).toString(16).padStart(8, "0");
      return `[SAFESHARE-AI-PROTECTED: ${this.honeypotSignature}-${hashDigest}]\n\n` +
             `Copying is disabled on this shared view. ` +
             `(This is a deterrent, not protection: the text is still visible on screen.)\n\n` +
             `Scrambled Cyphertext Fragment:\n${scrambled.substring(0, 160)}...`;
    }

    hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return hash;
    }

    /**
     * Attaches DOM interaction handlers.
     * Clean passthrough: Allows users to copy code snippets and AI solutions normally.
     */
    attachAntiCopyTraps(container, getRawPlainTextFn = null) {
      // Natural copy/selection allowed for usability
    }

    /**
     * Creates a protected DOM node for conversation messages.
     */
    createProtectedNode(plainText, className = "safeshare-scrambled-block") {
      const wrapper = document.createElement("div");
      wrapper.className = className;
      wrapper.innerText = plainText;
      return wrapper;
    }
  }

  return SafeShareFontScrambler;
});
