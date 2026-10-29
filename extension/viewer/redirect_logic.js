/**
 * Pure helpers for viewer_redirect.js.
 *
 * Kept DOM-free so tests/viewer_redirect.test.js can exercise the fallback rules in Node:
 * if the extension cannot take over a relay share, the page must fall back to the web
 * viewer instead of staying stopped and blank.
 */
(function (root, factory) {
  const api = factory();
  root.BlacklineRedirectLogic = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self, function () {
  "use strict";

  const RELAY_SHARE_PATH = /^\/[sv]\/[0-9a-f-]{36}\/?$/i;

  function isRelaySharePath(pathname, hash) {
    return RELAY_SHARE_PATH.test(String(pathname || "")) &&
      typeof hash === "string" && hash.length > 1 && hash.charAt(0) === "#";
  }

  function isHashShare(hash) {
    const value = String(hash || "");
    return /(?:^#|&)d=/.test(value) && /&k=/.test(value);
  }

  function isWebFallback(href) {
    try {
      return new URL(String(href)).searchParams.get("web") === "1";
    } catch (_) {
      return false;
    }
  }

  function buildFallbackHref(href) {
    const url = new URL(String(href));
    url.searchParams.set("web", "1");
    return url.toString();
  }

  function shouldFallback(response) {
    return !response || response.success !== true;
  }

  return { isRelaySharePath, isHashShare, isWebFallback, buildFallbackHref, shouldFallback };
});
