/**
 * Runs at document_start on the relay's share page, before any of the page's own scripts.
 * Stops the page and reopens the link in the extension's copy of the viewer, so whoever runs the
 * relay can't change the page to read the key and the chat (ROADMAP §1, attack 1.1).
 */
(function () {
  const isRelayShare = /^\/[sv]\/[0-9a-f-]{36}\/?$/i.test(location.pathname) && location.hash.length > 1;
  const isHashShare = /(?:^#|&)d=/.test(location.hash) && /&k=/.test(location.hash);
  if (!isRelayShare && !isHashShare) return;
  window.stop();
  const api = typeof browser !== "undefined" ? browser : chrome;
  const id = isRelayShare ? location.pathname.split("/")[2] : "";
  api.runtime.sendMessage({ action: "OPEN_SHARE_IN_EXTENSION", id, hash: location.hash });
})();
