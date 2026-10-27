/* Publish a sanitized DOCX as an encrypted link.
   Payload v4 carries the reviewed bytes plus a plain-text/table preview.
   The relay only ever sees ciphertext; the key stays in the URL fragment. */
const PublishState = { busy: false, last: null };

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

async function relayBaseUrl() {
  try {
    const api = typeof browser !== "undefined" ? browser : chrome;
    const { safeshare_relay } = await api.storage.local.get("safeshare_relay");
    if (safeshare_relay) return String(safeshare_relay).replace(/\/$/, "");
  } catch (_) {}
  return "https://safeshare-relay.bleedguard.workers.dev";
}

function sanitizedPreviewHtml() {
  const host = document.getElementById("compare");
  const sanitizedPane = host ? host.lastElementChild : null;
  const parts = [];
  if (sanitizedPane) {
    for (const node of sanitizedPane.children) {
      if (node.tagName === "H3") continue;
      parts.push(`<p>${node.textContent.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</p>`);
    }
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Reviewed document</title><style>body{font:16px/1.6 Georgia,serif;color:#1a1a1a;background:#fff;margin:0;padding:32px;max-width:820px}p{white-space:pre-wrap;margin:0 0 14px}</style></head><body>${parts.join("")}</body></html>`;
}

async function publishSanitized() {
  if (PublishState.busy || !sanitizedBytes) return;
  if (attackLeaks > 0 && !document.getElementById("attack-confirm").checked) {
    document.getElementById("apply-status").textContent = "Confirm the attack check warning before creating a link.";
    return;
  }
  const button = document.getElementById("create-link");
  PublishState.busy = true;
  button.disabled = true;
  const status = document.getElementById("publish-status");
  status.textContent = "Encrypting and uploading…";
  try {
    const cryptoEngine = new SafeShareCrypto(await relayBaseUrl(), await relayBaseUrl());
    const ttl = Number(document.getElementById("ttl").value) || 86400;
    const payload = {
      version: 4,
      kind: "document",
      format: "docx",
      docx: bytesToBase64(sanitizedBytes),
      preview: sanitizedPreviewHtml(),
      byteLength: sanitizedBytes.length,
      ttl,
      timestamp: new Date().toISOString()
    };
    const rough = JSON.stringify(payload).length;
    if (rough > 340000) throw new Error("This copy is too large for the current relay limit. Download the file instead.");
    const encrypted = await cryptoEngine.encrypt(payload);
    if (encrypted.ciphertext.length > 512 * 1024) throw new Error("Encrypted copy exceeds the relay limit. Download the file instead.");
    const api = typeof browser !== "undefined" ? browser : chrome;
    const result = await api.runtime.sendMessage({
      action: "UPLOAD_TO_RELAY",
      relayUrl: cryptoEngine.relayBaseUrl,
      payload: { id: encrypted.shareId, ciphertext: encrypted.ciphertext, ttl }
    });
    if (!result || !result.success || !result.data || !result.data.revoke_token) throw new Error("Relay upload failed. The sanitized file can still be downloaded.");
    PublishState.last = { relayUrl: cryptoEngine.relayBaseUrl, shareId: encrypted.shareId, token: result.data.revoke_token };
    await api.storage.local.set({ ["document_share_revoke_" + encrypted.shareId]: PublishState.last });
    document.getElementById("share-link").value = encrypted.fullShareUrl;
    document.getElementById("link-result").hidden = false;
    status.textContent = "Encrypted link ready. Anyone holding the full link can read it.";
  } catch (error) {
    status.textContent = "Link was not created.";
    const box = document.getElementById("error");
    box.textContent = error.message;
    box.hidden = false;
  } finally {
    PublishState.busy = false;
    button.disabled = false;
  }
}

document.getElementById("create-link").addEventListener("click", publishSanitized);
document.getElementById("copy-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.getElementById("share-link").value);
    document.getElementById("publish-status").textContent = "Link copied.";
  } catch (_) {
    document.getElementById("publish-status").textContent = "Copy failed; select the link manually.";
  }
});
document.getElementById("revoke-link").addEventListener("click", async () => {
  if (!PublishState.last) return;
  const button = document.getElementById("revoke-link");
  button.disabled = true;
  try {
    const api = typeof browser !== "undefined" ? browser : chrome;
    const result = await api.runtime.sendMessage({ action: "REVOKE_SHARE", ...PublishState.last });
    if (!result || !result.success) throw new Error("Revoke failed; the link may still work.");
    await api.storage.local.remove("document_share_revoke_" + PublishState.last.shareId);
    PublishState.last = null;
    document.getElementById("link-result").hidden = true;
    document.getElementById("publish-status").textContent = "Link revoked. Saved copies remain.";
  } catch (error) {
    document.getElementById("publish-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
