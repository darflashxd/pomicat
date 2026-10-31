/**
 * Turns relay/upload failures into a short message plus a next step for the Word panel.
 * Pure so tests/publish_errors.test.js can cover the mapping without a browser.
 */
(function (root, factory) {
  const api = factory();
  root.BlacklinePublishErrors = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self, function () {
  "use strict";

  function describePublishError(error, relayUrl) {
    const relay = relayUrl || "the configured relay";
    const message = (error && (error.message || String(error))) || "Unknown upload error";
    const code = error && error.code;

    if (code === "RELOAD_REQUIRED" || /reload required|not granted|permission/i.test(message)) {
      return {
        message,
        hint: `Reload the PomiCat extension, approve access to ${relay}, then create the link again. The sanitized DOCX is unchanged.`
      };
    }
    if (/too large|max 512|340000|340 KB|512 KB|exceeds the relay limit/i.test(message)) {
      return {
        message,
        hint: "This document is too large for an encrypted link (limit 512 KB ciphertext). Use Download DOCX instead."
      };
    }
    if (/429|too many requests/i.test(message)) {
      return {
        message,
        hint: "Too many uploads in the last minute. Wait about a minute, then retry. The sanitized DOCX is unchanged."
      };
    }
    if (/status 5\d\d|failed to fetch|networkerror|network error|timed? ?out|unreachable/i.test(message)) {
      return {
        message,
        hint: `Relay ${relay} could not be reached. Check the relay setting or try again. The sanitized DOCX is unchanged.`
      };
    }
    if (/status 409|already exists/i.test(message)) {
      return {
        message,
        hint: "The relay reported a share ID collision. Retry to create a new link."
      };
    }
    return {
      message,
      hint: `The sanitized copy is unchanged. Download it, or check the relay setting (${relay}).`
    };
  }

  return { describePublishError };
});
