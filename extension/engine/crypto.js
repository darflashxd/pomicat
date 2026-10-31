/**
 * PomiCat: Client-side AES-256-GCM encryption (server never sees the key)
 * Uses W3C Standard Web Crypto API (SubtleCrypto) for AES-256-GCM.
 * The encryption key lives ONLY in the URI fragment (#) and is NEVER transmitted over the wire.
 */

class SafeShareCrypto {
  constructor(
    relayBaseUrl = "https://pomicat-relay.bleedguard.workers.dev",
    viewerBaseUrl = "https://pomicat-relay.bleedguard.workers.dev"
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
      ["encrypt", "decrypt"] // encrypt: the sharer's own copy of the originals (encryptWithKey)
    );
  }

  /**
   * Encrypts plain payload object using AES-256-GCM.
   * Prepends the 96-bit random IV to the ciphertext.
   * Cryptographically binds expMs and shareId inside the encrypted ciphertext.
   */
  async encrypt(payload) {
    const key = await this.generateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
    const shareId = payload.shareId || crypto.randomUUID();

    const ttlSec = payload.ttl ? (parseInt(payload.ttl, 10) || 86400) : 86400;
    const expMs = payload.expMs || (Date.now() + (ttlSec * 1000));

    // Authenticated binding: embed expMs and shareId directly inside payload
    const payloadToEncrypt = Object.assign({}, payload, {
      shareId,
      expMs
    });

    const jsonStr = JSON.stringify(payloadToEncrypt);
    const encodedData = new TextEncoder().encode(jsonStr);
    const paddedData = this.pad(encodedData, 256);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      paddedData
    );

    // Concatenate IV + Ciphertext
    const combinedBuffer = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combinedBuffer.set(iv, 0);
    combinedBuffer.set(new Uint8Array(encryptedBuffer), iv.length);

    const ciphertextB64 = this.bufferToBase64Url(combinedBuffer.buffer);
    const keyB64 = await this.exportKeyToBase64Url(key);

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
   * Encrypts another object with an existing link key (same format as encrypt(), so decrypt()
   * reads it). Used for the sharer's own copy of the originals, which only the link key opens.
   */
  async encryptWithKey(obj, keyB64Url) {
    const key = await this.importKeyFromBase64Url(keyB64Url);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = this.pad(new TextEncoder().encode(JSON.stringify(obj)), 256);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return this.bufferToBase64Url(combined.buffer);
  }

  /**
   * Decrypts ciphertext using key provided from URI fragment #.
   * Enforces authenticated expiry metadata in this viewer, not against a holder of the key.
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

    const decryptedBytes = new Uint8Array(decryptedBuffer);
    const unpaddedBytes = this.unpad(decryptedBytes);
    const decodedStr = new TextDecoder().decode(unpaddedBytes).replace(/\0+$/, "");
    const parsed = JSON.parse(decodedStr);

    // Authenticated expiry cannot be edited without the key; holders can decrypt outside this viewer.
    if (parsed && typeof parsed.expMs === "number" && parsed.expMs > 0) {
      if (Date.now() > parsed.expMs) {
        const expErr = new Error("Link expired: the cryptographic expiration deadline has passed.");
        expErr.code = "EXPIRED";
        throw expErr;
      }
    }

    return parsed;
  }

  // --- Cryptographic Padding Utilities (Traffic Analysis Mitigation) ---

  /**
   * Applies 256-byte bucket padding to reduce size precision; bucket size remains visible.
   */
  pad(data, blockSize = 256) {
    const padLen = blockSize - (data.length % blockSize);
    const padded = new Uint8Array(data.length + padLen);
    padded.set(data);
    padded.fill(padLen, data.length);
    return padded;
  }

  /**
   * Safely strips block padding with backward-compatibility for legacy unpadded payloads.
   * Handles blockSize = 256 overflow where 256 is represented as 0 in Uint8Array.
   */
  unpad(data) {
    if (data.length === 0) return data;
    const lastByte = data[data.length - 1];
    const padLen = lastByte === 0 ? 256 : lastByte;
    if (padLen <= 0 || padLen > 256 || padLen > data.length) return data;
    for (let i = data.length - padLen; i < data.length; i++) {
      if (data[i] !== lastByte) return data;
    }
    return data.slice(0, data.length - padLen);
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
