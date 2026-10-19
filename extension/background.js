/**
 * SafeShare-AI — Background Service Worker
 * Handles network relay uploads securely from an isolated privileged context,
 * completely bypassing webpage CSP (Content Security Policy) and Mixed Content blocks.
 */

console.log("[SafeShare-AI] Background script initialized.");

const webExtApi = typeof browser !== "undefined" ? browser : chrome;

// Let the content script keep the shield's placeholder -> original map in session storage:
// private to the extension (the chat site's own scripts can't read it), cleared on browser exit.
try {
  if (webExtApi.storage && webExtApi.storage.session && webExtApi.storage.session.setAccessLevel) {
    webExtApi.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
  }
} catch (_) {}
// Wake this worker when the browser starts, so the access level above is set before a chat
// page's content script reads session storage.
webExtApi.runtime.onStartup.addListener(() => {});
webExtApi.runtime.onInstalled.addListener(() => {});

let creatingOffscreenPromise = null;

async function getOrCreateOffscreenDocument() {
  if (typeof chrome === "undefined" || !chrome.offscreen || !chrome.offscreen.hasDocument) {
    return false;
  }
  const hasDoc = await chrome.offscreen.hasDocument();
  if (hasDoc) return true;

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return true;
  }

  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["WORKERS", "BLOBS"],
    justification: "Run local BERT-small INT8 PII inference with zero network access."
  });

  try { await creatingOffscreenPromise; }
  finally { creatingOffscreenPromise = null; }
  return true;
}

// Relays the background worker will talk to: the official one, a local one, or the one set
// with chrome.storage.local.set({ safeshare_relay }) (see DEPLOY.md). Anything else is refused,
// so a bug elsewhere can't turn upload/revoke into requests to arbitrary sites.
const OFFICIAL_RELAY = /^(?:https:\/\/safeshare-relay\.bleedguard\.workers\.dev|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/;
async function relayAllowed(relayUrl) {
  let origin;
  try { origin = new URL(relayUrl).origin; } catch (_) { return false; }
  if (OFFICIAL_RELAY.test(origin)) return true;
  try {
    const { safeshare_relay } = await webExtApi.storage.local.get("safeshare_relay");
    return Boolean(safeshare_relay) && new URL(safeshare_relay).origin === origin;
  } catch (_) {
    return false;
  }
}
function fromOwnContentScript(sender) {
  return sender && sender.id === webExtApi.runtime.id;
}

webExtApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "PING") {
    if (typeof sendResponse === "function") sendResponse({ status: "PONG" });
    return false;
  }

  if (request.action === "ENSURE_OFFSCREEN_READY" || request.type === "ENSURE_OFFSCREEN_READY") {
    getOrCreateOffscreenDocument()
      .then(created => sendResponse({ ok: created || typeof runInference === "function" }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === "RUN_NER_INFERENCE" && request.target !== "NER_RUNTIME") {
    if (typeof request.text !== "string" || request.text.length > 512 * 1024) {
      sendResponse({ success: false, state: "failed", error: "Invalid inference text (max 512 KB)" });
      return false;
    }
    // Firefox has a DOM background page: run the same local WASM runtime there.
    if (typeof runInference === "function") {
      runInference(request.text, request.review === true).then(spans => sendResponse({ success: true, state: "checked", spans }))
        .catch(err => sendResponse({ success: false, state: "failed", error: err.message }));
      return true;
    }
    getOrCreateOffscreenDocument()
      .then(created => {
        if (!created) throw new Error("Local model runtime unavailable");
        webExtApi.runtime.sendMessage({ ...request, target: "NER_RUNTIME" }, (res) => {
          if (typeof sendResponse === "function") sendResponse(res || { success: false });
        });
      })
      .catch((err) => {
        if (typeof sendResponse === "function") sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (request.action === "UPLOAD_TO_RELAY") {
    const { relayUrl, payload } = request;
    if (!fromOwnContentScript(sender)) return false;

    relayAllowed(relayUrl).then((ok) => {
      if (!ok) throw new Error("Relay not allowed: " + relayUrl);
      return fetch(`${relayUrl}/api/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
      });
    })
      .then(async (response) => {
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Relay returned status ${response.status}: ${errText}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("[SafeShare-AI Background] Upload success");
        if (typeof sendResponse === "function") sendResponse({ success: true, data });
      })
      .catch((err) => {
        console.error("[SafeShare-AI Background] Upload failed:", err);
        if (typeof sendResponse === "function") sendResponse({ success: false, error: err.message });
      });

    return true; // Required by Chrome MV3 to keep message channel open asynchronously
  }

  // "Continue in ChatGPT/Claude/DeepSeek" from a share page: open the chat site and leave the
  // prompt for the content script there to paste once the input box exists.
  // A share link was opened on the relay: show it in the extension's own copy of the viewer
  // (see viewer_redirect.js), so the relay's page never runs with the key.
  if (request.action === "OPEN_SHARE_IN_EXTENSION") {
    const relay = sender.url ? new URL(sender.url).origin : "";
    const relayOk = /^(?:https:\/\/safeshare-relay\.bleedguard\.workers\.dev|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/.test(relay);
    const id = typeof request.id === "string" && /^[0-9a-f-]{36}$/i.test(request.id) ? request.id : "";
    if (!sender.tab || !relayOk || typeof request.hash !== "string" || !request.hash.startsWith("#")) {
      sendResponse({ success: false });
      return false;
    }
    const url = webExtApi.runtime.getURL("viewer/index.html") +
      `?relay=${encodeURIComponent(relay)}${id ? `&id=${id}` : ""}${request.hash}`;
    Promise.resolve(webExtApi.tabs.update(sender.tab.id, { url }))
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "OPEN_CHAT_WITH_PROMPT") {
    const urls = { ChatGPT: "https://chatgpt.com/", Claude: "https://claude.ai/new", DeepSeek: "https://chat.deepseek.com/" };
    const url = urls[request.platform];
    if (!url || typeof request.prompt !== "string") {
      sendResponse({ success: false, error: "Unknown platform" });
      return false;
    }
    webExtApi.storage.local
      .set({ safeshare_pending_continuation: { platform: request.platform, prompt: request.prompt, at: Date.now() } })
      .then(() => webExtApi.tabs.create({ url }))
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "REVOKE_SHARE") {
    const { relayUrl, shareId, token } = request;
    if (!fromOwnContentScript(sender)) return false;
    relayAllowed(relayUrl).then((ok) => {
      if (!ok) throw new Error("Relay not allowed: " + relayUrl);
      return fetch(`${relayUrl}/api/revoke/${encodeURIComponent(shareId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
    })
      .then((response) => sendResponse({ success: response.ok }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
