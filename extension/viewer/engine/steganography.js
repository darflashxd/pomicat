/**
 * PomiCat: Zero-Width Unicode HMAC Steganography Engine
 * 
 * Embeds imperceptible cryptographic watermarks into text using zero-width characters:
 *   - \uFEFF : Magic Header/Footer Marker (Byte Order Mark)
 *   - \u200B : Zero-Width Space ('0' bit)
 *   - \u200C : Zero-Width Non-Joiner ('1' bit)
 *   - \u200D : Zero-Width Joiner (Field Delimiter)
 * 
 * Provides:
 *   1. Recipient watermark (deterrence only: removed by stripping zero-width characters)
 *   2. Tamper-Proof HMAC-SHA256 Signature (Detects forged or mutated watermarks)
 *   3. Distributed Paragraph Embedding (Survives partial quotation or paragraph deletion)
 *   4. Zero Visual Impact (Invisible to human eyes in all modern fonts and renderers)
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SafeShareSteganography = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  // Zero-width Unicode constants (Using Non-Joiner \u200C to avoid font shaping collisions)
  const ZW_HEADER = "\uFEFF\u200C";
  const ZW_FOOTER = "\u200C\uFEFF";
  const ZW_ZERO = "\u200B"; // Bit 0
  const ZW_ONE = "\u200C";  // Bit 1
  const ZW_DELIM = "\u200C"; // Field delimiter

  function toUtf8Binary(str) {
    if (typeof TextEncoder !== "undefined") {
      const bytes = new TextEncoder().encode(str);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return bin;
    }
    return unescape(encodeURIComponent(str));
  }

  // Pure JavaScript SHA-256 implementation (synchronous, portable, dependency-free)
  function sha256(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    let i, j;
    let result = '';

    const words = [];
    const asciiBitLength = ascii[lengthProperty] * 8;
    
    let hash = sha256.h = sha256.h || [];
    const k = sha256.k = sha256.k || [];
    let primeCounter = k[lengthProperty];

    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }

    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return; // ASCII only
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength);

    for (j = 0; j < words[lengthProperty];) {
      const w = words.slice(j, j += 16);
      const oldHash = hash;
      hash = hash.slice(0, 8);

      for (i = 0; i < 64; i++) {
        const i2 = i + j;
        const w15 = w[i - 15], w2 = w[i - 2];

        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
              w[i - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
            ) | 0
          );
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }

      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }

    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  // HMAC-SHA256
  function hmacSha256(rawKey, rawMessage) {
    const key = toUtf8Binary(String(rawKey || ""));
    const message = toUtf8Binary(String(rawMessage || ""));
    const blockSize = 64;
    let k = key;
    if (k.length > blockSize) {
      k = hexToAscii(sha256(k));
    }
    while (k.length < blockSize) {
      k += '\x00';
    }

    let oKeyPad = '';
    let iKeyPad = '';
    for (let i = 0; i < blockSize; i++) {
      oKeyPad += String.fromCharCode(k.charCodeAt(i) ^ 0x5c);
      iKeyPad += String.fromCharCode(k.charCodeAt(i) ^ 0x36);
    }

    const innerHash = hexToAscii(sha256(iKeyPad + message));
    return sha256(oKeyPad + innerHash);
  }

  function hexToAscii(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
  }

  class SafeShareSteganography {
    constructor(secretKey = "SafeShare-Default-MasterKey-2026") {
      this.secretKey = secretKey;
    }

    /**
     * Converts an ASCII/UTF-8 string to a sequence of zero-width binary characters.
     */
    stringToZeroWidth(str) {
      let zw = "";
      const bytes = new TextEncoder().encode(str);
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        for (let bit = 7; bit >= 0; bit--) {
          zw += ((b >> bit) & 1) ? ZW_ONE : ZW_ZERO;
        }
      }
      return zw;
    }

    /**
     * Converts a sequence of zero-width binary characters back to string.
     */
    zeroWidthToString(zw) {
      const bits = [];
      for (let i = 0; i < zw.length; i++) {
        const ch = zw[i];
        if (ch === ZW_ZERO) bits.push(0);
        else if (ch === ZW_ONE) bits.push(1);
      }

      const bytes = [];
      for (let i = 0; i < bits.length; i += 8) {
        if (i + 8 <= bits.length) {
          let b = 0;
          for (let bit = 0; bit < 8; bit++) {
            b = (b << 1) | bits[i + bit];
          }
          bytes.push(b);
        }
      }
      return new TextDecoder().decode(new Uint8Array(bytes));
    }

    /**
     * Embeds forensic tracking watermark into conversation turns or plain text.
     * 
     * @param {string} text - Raw content text
     * @param {object} meta - { recipientId, sessionId, timestamp }
     * @param {string} customKey - Optional key for HMAC
     * @returns {string} Text containing invisible watermark
     */
    embed(text, meta = {}, customKey = null) {
      if (!text || typeof text !== "string") return text;

      const key = customKey || this.secretKey;
      const payload = {
        r: meta.recipientId || "anonymous_recipient",
        s: meta.sessionId || "session_" + Math.random().toString(36).substring(2, 10),
        t: meta.timestamp || Date.now()
      };

      const jsonStr = JSON.stringify(payload);
      const hmacSignature = hmacSha256(key, jsonStr).substring(0, 16); // 16-hex char signature
      const rawEnvelope = jsonStr + "|" + hmacSignature;

      const zeroWidthBlock = ZW_HEADER + this.stringToZeroWidth(rawEnvelope) + ZW_FOOTER;

      // Distribute watermark into text:
      // Append safely at paragraph ends to avoid word/glyph collisions
      const paragraphs = text.split("\n\n");
      const watermarkedParagraphs = paragraphs.map(para => {
        if (para.trim().length === 0) return para;
        return para + zeroWidthBlock;
      });

      return watermarkedParagraphs.join("\n\n");
    }

    /**
     * Extracts and validates forensic watermarks from potentially leaked text.
     * 
     * @param {string} text - Text that may contain invisible watermark
     * @param {string} customKey - Optional key to verify HMAC
     * @returns {object} { detected, validSignature, metadata, watermarkCount, tampered }
     */
    extract(text, customKey = null) {
      if (!text || typeof text !== "string") {
        return { detected: false, error: "Empty or invalid text input" };
      }

      const key = customKey || this.secretKey;
      const regex = new RegExp(`${ZW_HEADER}([${ZW_ZERO}${ZW_ONE}]+)${ZW_FOOTER}`, "g");
      const matches = [];
      let match;

      while ((match = regex.exec(text)) !== null) {
        matches.push(match[1]);
      }

      if (matches.length === 0) {
        return {
          detected: false,
          watermarkCount: 0,
          error: "No Blackline forensic watermark found in text"
        };
      }

      // Decode first valid match
      for (const zwBlock of matches) {
        try {
          const envelope = this.zeroWidthToString(zwBlock);
          const parts = envelope.split("|");
          if (parts.length >= 2) {
            const jsonStr = parts[0];
            const signature = parts[1];
            const meta = JSON.parse(jsonStr);

            const expectedSig = hmacSha256(key, jsonStr).substring(0, 16);
            const isSignatureValid = (signature === expectedSig);

            return {
              detected: true,
              watermarkCount: matches.length,
              validSignature: isSignatureValid,
              tampered: !isSignatureValid,
              metadata: {
                recipientId: meta.r,
                sessionId: meta.s,
                timestamp: meta.t,
                date: new Date(meta.t).toISOString()
              },
              signature: signature
            };
          }
        } catch (e) {
          // Continue to next match
        }
      }

      return {
        detected: true,
        watermarkCount: matches.length,
        validSignature: false,
        tampered: true,
        error: "Watermark signature corrupted or invalid key"
      };
    }

    /**
     * Removes all zero-width characters to yield clean text.
     */
    clean(text) {
      if (!text) return text;
      return text
        .replace(new RegExp(`[${ZW_HEADER}${ZW_FOOTER}${ZW_ZERO}${ZW_ONE}${ZW_DELIM}]`, "g"), "");
    }
  }

  return SafeShareSteganography;
});
