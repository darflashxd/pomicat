/**
 * SafeShare-AI — Zero-Knowledge Client-Side Cryptographic Engine
 * Uses W3C Standard Web Crypto API (SubtleCrypto) for AES-256-GCM.
 * The encryption key lives ONLY in the URI fragment (#) and is NEVER transmitted over the wire.
 */

class SafeShareCrypto {
  constructor(
    relayBaseUrl = "https://safeshare-relay.bleedguard.workers.dev",
    viewerBaseUrl = "https://safeshare-relay.bleedguard.workers.dev"
  ) {
    this.relayBaseUrl = relayBaseUrl;
    this.viewerBaseUrl = viewerBaseUrl;
  }

  /**
   * Generates a 256-bit AES-GCM symmetric key.
   */
  async generateKey() {
    return await crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256
      },
      true, // extractable
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Exports an CryptoKey into a URL-safe Base64 string.
   */
  async exportKeyToBase64Url(key) {
    const rawKey = await crypto.subtle.exportKey("raw", key);
    return this.bufferToBase64Url(rawKey);
  }

  /**
   * Imports a raw Base64Url key into a CryptoKey for decryption.
   */
  async importKeyFromBase64Url(base64UrlKey) {
    const rawBuffer = this.base64UrlToBuffer(base64UrlKey);
    return await crypto.subtle.importKey(
      "raw",
      rawBuffer,
      {
        name: "AES-GCM",
        length: 256
      },
      false,
      ["decrypt"]
    );
  }

  /**
   * Encrypts plain payload object using AES-256-GCM.
   * Prepends the 96-bit random IV to the ciphertext.
   */
  async encrypt(payload) {
    const key = await this.generateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
    const jsonStr = JSON.stringify(payload);
    const encodedData = new TextEncoder().encode(jsonStr);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      encodedData
    );

    // Concatenate IV + Ciphertext
    const combinedBuffer = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combinedBuffer.set(iv, 0);
    combinedBuffer.set(new Uint8Array(encryptedBuffer), iv.length);

    const ciphertextB64 = this.bufferToBase64Url(combinedBuffer.buffer);
    const keyB64 = await this.exportKeyToBase64Url(key);
    const shareId = crypto.randomUUID();

    const ttlSec = payload.ttl ? (parseInt(payload.ttl, 10) || 86400) : 86400;
    const expMs = Date.now() + (ttlSec * 1000);
    const fullShareUrl = `${this.viewerBaseUrl}/v/${shareId}#${keyB64}`;
    const standaloneShareUrl = `${this.viewerBaseUrl}/#d=${encodeURIComponent(ciphertextB64)}&k=${encodeURIComponent(keyB64)}&exp=${expMs}`;

    return {
      shareId,
      ciphertext: ciphertextB64,
      key: keyB64,
      expMs,
      fullShareUrl,
      standaloneShareUrl
    };
  }

  /**
   * Decrypts ciphertext using key provided from URI fragment #.
   */
  async decrypt(ciphertextB64Url, keyB64Url) {
    const key = await this.importKeyFromBase64Url(keyB64Url);
    const combinedBuffer = new Uint8Array(this.base64UrlToBuffer(ciphertextB64Url));

    if (combinedBuffer.length < 12) {
      throw new Error("Invalid payload: ciphertext is too short.");
    }

    // Extract IV (first 12 bytes) and ciphertext
    const iv = combinedBuffer.slice(0, 12);
    const ciphertext = combinedBuffer.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      ciphertext
    );

    const decodedStr = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decodedStr);
  }

  // --- Buffer Conversion Utilities ---

  bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  base64UrlToBuffer(base64Url) {
    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SafeShareCrypto;
}
