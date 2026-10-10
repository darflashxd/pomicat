/**
 * SafeShare-AI — Background Service Worker
 * Handles network relay uploads securely from an isolated privileged context,
 * completely bypassing webpage CSP (Content Security Policy) and Mixed Content blocks.
 */

console.log("[SafeShare-AI] Background script initialized.");

const webExtApi = typeof browser !== "undefined" ? browser : chrome;

webExtApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "PING") {
    if (typeof sendResponse === "function") sendResponse({ status: "PONG" });
    return false;
  }

  if (request.action === "UPLOAD_TO_RELAY") {
    const { relayUrl, payload } = request;
    console.log("[SafeShare-AI Background] Relaying upload to:", `${relayUrl}/api/share`);

    fetch(`${relayUrl}/api/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
      .then(async (response) => {
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Relay returned status ${response.status}: ${errText}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("[SafeShare-AI Background] Upload success:", data);
        if (typeof sendResponse === "function") sendResponse({ success: true, data });
      })
      .catch((err) => {
        console.error("[SafeShare-AI Background] Upload failed:", err);
        if (typeof sendResponse === "function") sendResponse({ success: false, error: err.message });
      });

    return true; // Required by Chrome MV3 to keep message channel open asynchronously
  }

  if (request.action === "REVOKE_SHARE") {
    const { relayUrl, shareId, token } = request;
    fetch(`${relayUrl}/api/revoke/${encodeURIComponent(shareId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    })
      .then((response) => sendResponse({ success: response.ok }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
