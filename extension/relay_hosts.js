/**
 * Single source of truth for the relays this extension is allowed to talk to.
 *
 * Loaded by:
 *  - background service worker (importScripts in Chrome, <script> list in Firefox)
 *  - viewer_redirect content script (manifest js order)
 *  - extension pages that need the default relay (Word publish)
 *
 * Keep this list in sync with host_permissions in both manifests. The Node test
 * tests/relay_hosts.test.js fails if a relay host is added to one place only.
 */
(function (root, factory) {
  const api = factory();
  root.BlacklineRelayHosts = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self, function () {
  "use strict";

  const ORIGINS = [
    "https://safeshare-relay.bleedguard.workers.dev",
    "https://blackline-relay.bleedguard.workers.dev"
  ];
  const DEFAULT_RELAY = "https://blackline-relay.bleedguard.workers.dev";
  const LOCAL = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

  function originOf(value) {
    try {
      return new URL(String(value)).origin;
    } catch (_) {
      return "";
    }
  }

  function isRelayOrigin(value) {
    const origin = originOf(value);
    if (!origin) return false;
    return ORIGINS.indexOf(origin) !== -1 || LOCAL.test(origin);
  }

  /** Chrome match patterns do not accept ports, so drop them for permissions.contains(). */
  function permissionPattern(value) {
    const origin = originOf(value);
    if (!origin) return "";
    try {
      const url = new URL(origin);
      return `${url.protocol}//${url.hostname}/*`;
    } catch (_) {
      return "";
    }
  }

  return { ORIGINS: ORIGINS.slice(), DEFAULT_RELAY, LOCAL, originOf, isRelayOrigin, permissionPattern };
});
