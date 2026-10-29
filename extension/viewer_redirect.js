/**
 * Runs at document_start on the relay's share page, before any of the page's own scripts.
 * Stops the page and reopens the link in the extension's copy of the viewer, so whoever runs the
 * relay can't change the page to read the key and the chat (ROADMAP A1, attack 1.1).
 *
 * If the extension cannot take over (old service worker, withheld host permission, tab update
 * failure), the page falls back to the relay's own viewer with ?web=1. Before this guard the
 * page stayed stopped and blank whenever the handoff failed.
 */
(function () {
  "use strict";

  const logic = typeof BlacklineRedirectLogic !== "undefined" ? BlacklineRedirectLogic : null;
  if (!logic) return;

  const href = location.href;
  if (logic.isWebFallback(href)) return;

  const isRelayShare = logic.isRelaySharePath(location.pathname, location.hash);
  const isHashShare = logic.isHashShare(location.hash);
  if (!isRelayShare && !isHashShare) return;

  // Keep the relay page's scripts away from the key while we ask the extension to take over.
  window.stop();

  let settled = false;
  let timer = null;

  const fallback = () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    try {
      location.replace(logic.buildFallbackHref(location.href));
    } catch (_) {}
  };

  const done = (response) => {
    if (settled) return;
    if (logic.shouldFallback(response)) {
      fallback();
      return;
    }
    settled = true;
    if (timer) clearTimeout(timer);
  };

  try {
    const api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
    if (!api || !api.runtime || typeof api.runtime.sendMessage !== "function") {
      fallback();
      return;
    }
    const id = isRelayShare ? location.pathname.split("/")[2] : "";
    // The background redirects the tab on success. Anything else means the web viewer must run.
    timer = setTimeout(fallback, 1000);
    Promise.resolve(api.runtime.sendMessage({ action: "OPEN_SHARE_IN_EXTENSION", id, hash: location.hash }))
      .then(done)
      .catch(fallback);
  } catch (_) {
    fallback();
  }
})();
