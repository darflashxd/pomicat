/**
 * SafeShare-AI — Background Service Worker
 * Handles network relay uploads securely from an isolated privileged context,
 * completely bypassing webpage CSP (Content Security Policy) and Mixed Content blocks.
 */

console.log("[Blackline] Background script initialized.");

const webExtApi = typeof browser !== "undefined" ? browser : chrome;

// One relay allowlist for every context. Chrome MV3 loads this with importScripts;
// Firefox background pages load it from manifest.background.scripts before this file.
if (typeof importScripts === "function") {
  try { importScripts("relay_hosts.js"); } catch (_) {}
}
const RelayHosts = (typeof globalThis !== "undefined" && globalThis.BlacklineRelayHosts) ||
  (typeof self !== "undefined" ? self.BlacklineRelayHosts : null);

// The Word launcher is declared statically in the manifest, so no runtime
// permission request or dynamic registration is needed. Keep a single guarded
// injection for tabs that loaded before the extension was reloaded.
const WORD_ORIGIN = /^https:\/\/(?:[a-z0-9-]+\.)*(?:sharepoint\.com|officeapps\.live\.com|word\.cloud\.microsoft)$/i;
async function injectWordLauncher(tabId, url) {
  try {
    if (!url || !WORD_ORIGIN.test(new URL(url).origin)) return;
    await webExtApi.scripting.executeScript({ target: { tabId }, files: ["word/launcher.js"] });
  } catch (_) {}
}
webExtApi.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === "complete") injectWordLauncher(tabId, tab?.url);
});

// Word setup runs in a trusted extension tab; provider access is opt-in.
webExtApi.action.onClicked.addListener((tab) => {
  const query = new URLSearchParams();
  if (tab?.id && tab?.url) {
    try {
      const url = new URL(tab.url);
      if (url.protocol === "https:" && /(^|\.)(sharepoint\.com|officeapps\.live\.com|word\.cloud\.microsoft)$/.test(url.hostname)) {
        query.set("tab", String(tab.id));
        query.set("origin", url.origin);
      }
    } catch (_) {}
  }
  webExtApi.tabs.create({ url: webExtApi.runtime.getURL("word/index.html") + "?" + query });
});

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

// Relays the background worker will talk to: the official ones (relay_hosts.js), a local one,
// or the one set with chrome.storage.local.set({ safeshare_relay }) (see DEPLOY.md). Anything
// else is refused, so a bug elsewhere can't turn upload/revoke into requests to arbitrary sites.
function relayOrigin(relayUrl) {
  if (RelayHosts) return RelayHosts.originOf(relayUrl);
  try { return new URL(String(relayUrl)).origin; } catch (_) { return ""; }
}

function isKnownRelay(origin) {
  if (!origin) return false;
  if (RelayHosts) return RelayHosts.isRelayOrigin(origin);
  return /^(?:https:\/\/(?:safeshare|blackline)-relay\.bleedguard\.workers\.dev|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/.test(origin);
}

async function relayAllowed(relayUrl) {
  const origin = relayOrigin(relayUrl);
  if (!origin) return false;
  if (isKnownRelay(origin)) return true;
  try {
    const { safeshare_relay } = await webExtApi.storage.local.get("safeshare_relay");
    return Boolean(safeshare_relay) && relayOrigin(safeshare_relay) === origin;
  } catch (_) {
    return false;
  }
}

// Host access is separate from the allowlist: an unpacked extension keeps the old grant until
// it is reloaded. Failing here with RELOAD_REQUIRED turns a silent skew into a clear message.
async function relayHostGranted(origin) {
  if (!webExtApi.permissions || typeof webExtApi.permissions.contains !== "function") return true;
  const pattern = RelayHosts ? RelayHosts.permissionPattern(origin) : "";
  if (!pattern) return false;
  try {
    return await webExtApi.permissions.contains({ origins: [pattern] });
  } catch (_) {
    return false;
  }
}

function relayError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function fromOwnContentScript(sender) {
  return sender && sender.id === webExtApi.runtime.id;
}

webExtApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_MAPPING_CONTEXT") {
    if (!fromOwnContentScript(sender) || !Number.isInteger(sender.tab?.id)) return false;
    sendResponse({ tabId: sender.tab.id });
    return false;
  }
  if (request.action === "OPEN_WORD_SETUP") {
    if (!fromOwnContentScript(sender) || !sender.tab || !sender.url) return false;
    try {
      const url = new URL(sender.url);
      if (url.protocol !== "https:" || !/(^|\.)(sharepoint\.com|officeapps\.live\.com|word\.cloud\.microsoft)$/.test(url.hostname)) return false;
      const params = new URLSearchParams({tab:String(sender.tab.id),origin:url.origin});
      webExtApi.tabs.create({url:webExtApi.runtime.getURL("word/index.html")+"?"+params});
    } catch (_) {}
    return false;
  }
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
    const origin = relayOrigin(relayUrl);

    relayAllowed(relayUrl).then(async (ok) => {
      if (!ok) throw relayError("RELAY_NOT_ALLOWED", "Relay not allowed: " + relayUrl);
      if (!(await relayHostGranted(origin))) {
        throw relayError("RELOAD_REQUIRED",
          `Extension reload required to grant access to ${origin}. Reload Blackline in chrome://extensions and approve the relay host.`);
      }
      return fetch(`${origin}/api/share`, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        redirect: "error",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    })
      .then(async (response) => {
        if (!response.ok) {
          const errText = await response.text();
          throw relayError(`HTTP_${response.status}`, `Relay returned status ${response.status}: ${errText}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("[Blackline Background] Upload success");
        if (typeof sendResponse === "function") sendResponse({ success: true, data });
      })
      .catch((err) => {
        console.error("[Blackline Background] Upload failed:", err);
        if (typeof sendResponse === "function") sendResponse({ success: false, error: err.message, code: err.code || null });
      });

    return true; // Required by Chrome MV3 to keep message channel open asynchronously
  }

  // "Continue in ChatGPT/Claude/DeepSeek" from a share page: open the chat site and leave the
  // prompt for the content script there to paste once the input box exists.
  // A share link was opened on the relay: show it in the extension's own copy of the viewer
  // (see viewer_redirect.js), so the relay's page never runs with the key.
  if (request.action === "OPEN_SHARE_IN_EXTENSION") {
    const relay = sender.url ? relayOrigin(sender.url) : "";
    if (!sender.tab) {
      sendResponse({ success: false, reason: "no_tab" });
      return false;
    }
    if (!isKnownRelay(relay)) {
      sendResponse({ success: false, reason: "relay_not_allowed" });
      return false;
    }
    if (typeof request.hash !== "string" || !request.hash.startsWith("#") || request.hash.length < 2) {
      sendResponse({ success: false, reason: "bad_hash" });
      return false;
    }
    const id = typeof request.id === "string" && /^[0-9a-f-]{36}$/i.test(request.id) ? request.id : "";
    if (request.id && !id) {
      sendResponse({ success: false, reason: "bad_id" });
      return false;
    }
    const url = webExtApi.runtime.getURL("viewer/index.html") +
      `?relay=${encodeURIComponent(relay)}${id ? `&id=${id}` : ""}${request.hash}`;
    // Without host access the extension viewer could not fetch the ciphertext. Tell the
    // content script to fall back to the relay's own viewer instead of opening a dead tab.
    relayHostGranted(relay).then((granted) => {
      if (!granted) {
        sendResponse({ success: false, reason: "reload_required" });
        return;
      }
      Promise.resolve(webExtApi.tabs.update(sender.tab.id, { url }))
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, reason: "update_failed", error: err.message }));
    });
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
    const origin = relayOrigin(relayUrl);
    relayAllowed(relayUrl).then(async (ok) => {
      if (!ok) throw relayError("RELAY_NOT_ALLOWED", "Relay not allowed: " + relayUrl);
      if (!(await relayHostGranted(origin))) {
        throw relayError("RELOAD_REQUIRED",
          `Extension reload required to grant access to ${origin}. Reload Blackline in chrome://extensions and approve the relay host.`);
      }
      return fetch(`${origin}/api/revoke/${encodeURIComponent(shareId)}`, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
    })
      .then(async (response) => {
        if (!response.ok) {
          const errText = await response.text();
          throw relayError(`HTTP_${response.status}`, `Relay returned status ${response.status}: ${errText}`);
        }
        sendResponse({ success: true });
      })
      .catch((err) => sendResponse({ success: false, error: err.message, code: err.code || null }));
    return true;
  }
});
