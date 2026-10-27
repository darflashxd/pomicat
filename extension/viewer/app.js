/**
 * SafeShare-AI — Shared conversation viewer
 * 
 * Features:
 * 1. Mode 1: Self-Contained Zero-Server Hash Mode (#d=<ciphertext>&k=<key>&exp=<deadline>)
 * 2. Mode 2: Cloud Relay Mode (/v/:id#<key>)
 * 3. Client-Side AES-256-GCM In-Memory Decryption
 * 4. Zero-width watermark (deterrence only: stripped by Unicode normalization or a screenshot)
 * 5. RAM Memory Zeroizer on session unload/termination
 * 6. Zero-Clipboard Continuation Bridge
 */

document.addEventListener("DOMContentLoaded", async () => {
  const cryptoEngine = new SafeShareCrypto();
  const steganography = typeof SafeShareSteganography !== "undefined" ? new SafeShareSteganography() : null;
  const extensionBridge = typeof SafeShareExtensionBridge !== "undefined" ? new SafeShareExtensionBridge() : null;
  // Extract ID from URL params or pathname
  const params = new URLSearchParams(window.location.search);
  // Opened inside the extension (extension/viewer_redirect.js): this page comes from the
  // extension, not the relay, so a dishonest relay can't change it. Only the relay's API is used.
  const inExtension = /^(?:chrome|moz)-extension:$/.test(window.location.protocol);
  if (inExtension) window.SAFESHARE_RELAY_URL = params.get("relay") || "";
  const lockMeta = document.querySelector("#crawler-lock-screen .lock-meta");
  if (lockMeta) {
    lockMeta.innerText = inExtension
      ? "Opened inside the SafeShare extension: decrypted by the extension's own copy of this page." +
        (/^https:\/\/safeshare-relay\.bleedguard\.workers\.dev$/.test(window.SAFESHARE_RELAY_URL)
          ? "" : ` Chat loaded from ${window.SAFESHARE_RELAY_URL}, not the official relay.`)
      : "Decrypted by this page, served by the relay. With the SafeShare extension installed, links open inside the extension instead.";
  }
  let shareId = params.get("id");
  if (!shareId) {
    const segments = window.location.pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && (segments[0] === "s" || segments[0] === "v")) {
      shareId = segments[1];
    }
  }

  // Extract Decryption Key and Parameters from URI Fragment # BEFORE any URL mutation
  const rawHash = window.location.hash.replace(/^#/, "").trim();

  // 0. Pre-Flight Check: Ephemeral Revocation Status Check for this specific shareId
  const ZeroizerEngine = typeof SafeShareMemoryZeroizer !== "undefined" ? SafeShareMemoryZeroizer : (typeof SafeShareTamperGuard !== "undefined" ? SafeShareTamperGuard : null);
  if (ZeroizerEngine && shareId && ZeroizerEngine.isPoisoned(shareId)) {
    const lock = document.getElementById("crawler-lock-screen");
    if (lock) {
      lock.style.display = "block";
      lock.querySelector("h2").innerText = "⚠️ Session Revoked";
      lock.querySelector("p").innerText = "This conversation session has been permanently revoked and cleared from memory.";
    }
    console.warn("[SafeShare] Access denied: Session has been revoked.");
    return;
  }

  const memoryZeroizer = ZeroizerEngine ? new ZeroizerEngine({
    shareId: shareId,
    relayUrl: window.SAFESHARE_RELAY_URL || window.location.origin,
    // Keep the fragment so refresh/history can reopen unexpired, non-burn links.
    // URL fragments are not sent to the relay; do not persist keys in web storage.
    autoShredUrlKey: false
  }) : null;

  let watermarkedTurns = [];

  if (memoryZeroizer) {
    memoryZeroizer.registerZeroizer(() => {
      console.warn("[SafeShare] Zeroing memory and DOM buffers.");
      decryptedData = null;
      if (watermarkedTurns && Array.isArray(watermarkedTurns)) {
        watermarkedTurns.length = 0;
      }
      if (messagesContainer) messagesContainer.innerHTML = "";
    });
    memoryZeroizer.start();
  }

  const lockScreen = document.getElementById("crawler-lock-screen");
  const chatView = document.getElementById("chat-content-view");
  const messagesContainer = document.getElementById("messages-container");

  // Determine Recipient ID for forensic traitor tracing
  let recipientId = params.get("r") || "recipient_auth_user";

  // Mode 1: Self-Contained Zero-Server Hash Mode (#d=...&k=...&exp=...)
  if (rawHash.includes("d=") && rawHash.includes("k=")) {
    try {
      const hashParams = new URLSearchParams(rawHash);
      const ciphertext = hashParams.get("d");
      const hashKey = hashParams.get("k");
      const exp = parseInt(hashParams.get("exp") || "0", 10);
      if (hashParams.get("r")) {
        recipientId = hashParams.get("r");
      }

      // Enforce strict expiration deadline check
      if (exp > 0 && Date.now() > exp) {
        lockScreen.style.display = "block";
        lockScreen.querySelector("h2").innerText = "⏱️ Link Expired";
        lockScreen.querySelector("p").innerText = "This link has passed its expiration deadline set by the sender and has been destroyed.";
        return;
      }

      decryptedData = await cryptoEngine.decrypt(ciphertext, hashKey);
    } catch (err) {
      console.error("[SafeShare Viewer] Standalone decryption error:", err);
      lockScreen.style.display = "block";
      if (err && (err.code === "EXPIRED" || (err.message && err.message.toLowerCase().includes("expired")))) {
        lockScreen.querySelector("h2").innerText = "⏱️ Link Expired";
        lockScreen.querySelector("p").innerText = "This link has passed its expiration deadline set by the sender and has been destroyed.";
      } else {
        lockScreen.querySelector("h2").innerText = "Decryption Failed";
        lockScreen.querySelector("p").innerText = "The secret key is invalid or the data is corrupted.";
      }
      return;
    }
  } else {
    // Mode 2: Cloud Relay Mode (fetches from /api/share/:id with #key)
    const hashKey = rawHash;

    // If Key or shareId is Missing (Search Engine Crawler / Unauthorized)
    if (!hashKey || !shareId) {
      lockScreen.style.display = "block";
      return;
    }

    // Link scanners (chat previews, mail security, antivirus) open links without a person; for a
    // burn-after-reading link that would use up the one view. Fetch only after a real click.
    await new Promise((resolve) => {
      lockScreen.style.display = "block";
      lockScreen.querySelector("p").innerText = "This conversation is end-to-end encrypted. Single-view links are consumed when opened; timed links can be reopened until they expire or are revoked.";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-platform btn-open-conversation";
      btn.textContent = "Open conversation";
      btn.addEventListener("click", (e) => {
        if (!e.isTrusted) return;
        btn.remove();
        lockScreen.style.display = "none";
        resolve();
      });
      lockScreen.appendChild(btn);
    });

    let decryptStarted = false;
    try {
      const relayHost = window.SAFESHARE_RELAY_URL || window.location.origin;
      const res = await fetch(`${relayHost}/api/share/${shareId}`);
      
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) {
          lockScreen.style.display = "block";
          lockScreen.querySelector("h2").innerText = "⏱️ Link Expired or Revoked";
          lockScreen.querySelector("p").innerText = "This link has expired, was revoked by the sender, or was already opened once.";
          return;
        }
        throw new Error(`Failed to load chat: ${res.statusText}`);
      }

      const { ciphertext } = await res.json();
      decryptStarted = true;
      decryptedData = await cryptoEngine.decrypt(ciphertext, hashKey);
    } catch (err) {
      console.error("[SafeShare Viewer] Relay decryption error:", err);
      lockScreen.style.display = "block";
      if (err && (err.code === "EXPIRED" || (err.message && err.message.toLowerCase().includes("expired")))) {
        lockScreen.querySelector("h2").innerText = "⏱️ Link Expired or Revoked";
        lockScreen.querySelector("p").innerText = "This link has expired, was revoked by the sender, or was already opened once.";
      } else {
        lockScreen.querySelector("h2").innerText = decryptStarted ? "Decryption Failed" : "Could Not Load Conversation";
        lockScreen.querySelector("p").innerText = decryptStarted
          ? "The key may be incorrect or the encrypted data could not be verified. No conversation was opened."
          : "The relay could not provide the conversation. Check your connection and try again.";
      }
      return;
    }
  }

  // Retired experimental document payloads are not safe Word snapshots.
  if (decryptedData?.kind === "document") {
    lockScreen.style.display = "block";
    lockScreen.querySelector("h2").textContent = "Experimental document link retired";
    lockScreen.querySelector("p").textContent = "Ask the sender for a new reviewed copy. Chat links are unaffected.";
    return;
  }

  // Render Decrypted Chat View
  if (!decryptedData || !decryptedData.turns) {
    lockScreen.style.display = "block";
    return;
  }

  lockScreen.style.display = "none";
  chatView.style.display = "block";

  const dateStr = decryptedData.timestamp
    ? new Date(decryptedData.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Just now";
  document.getElementById("chat-time").innerText = `Shared · ${dateStr}`;

  // Progressive Disclosure: Security Modal Handlers
  const secBtn = document.getElementById("btn-security-info");
  const secModal = document.getElementById("security-modal");
  const closeSecModal = document.getElementById("btn-close-security-modal");
  const footerSecLink = document.getElementById("link-security-footer");
  let securityTrigger = null;
  const openSecurity = (trigger) => {
    securityTrigger = trigger;
    secModal.style.display = "flex";
    (closeSecModal || secModal).focus();
  };
  const closeSecurity = () => {
    secModal.style.display = "none";
    if (securityTrigger && securityTrigger.isConnected) securityTrigger.focus();
  };

  if (secBtn && secModal) {
    secBtn.addEventListener("click", () => openSecurity(secBtn));
  }
  if (footerSecLink && secModal) {
    footerSecLink.addEventListener("click", (e) => {
      e.preventDefault();
      openSecurity(footerSecLink);
    });
  }
  if (closeSecModal && secModal) {
    closeSecModal.addEventListener("click", closeSecurity);
  }
  if (secModal) {
    secModal.addEventListener("click", (e) => {
      if (e.target === secModal) closeSecurity();
    });
    secModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSecurity();
      } else if (e.key === "Tab") {
        const focusable = [...secModal.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')]
          .filter(el => el.getClientRects().length);
        const first = focusable[0] || secModal;
        const last = focusable[focusable.length - 1] || secModal;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === secModal)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === secModal)) {
          e.preventDefault(); first.focus();
        }
      }
    });
  }

  // 1. Forensic Watermarking Injection (Invisible Zero-Width Steganography)
  const watermarkMeta = {
    recipientId: recipientId,
    sessionId: (shareId || "hash_" + rawHash.substring(0, 8)).substring(0, 16),
    timestamp: Date.now()
  };

  // Renders the conversation; called again with the sharer's originals filled in (see below)
  function renderTurns(sourceTurns) {
  watermarkedTurns = sourceTurns.map(turn => {
    if (steganography) {
      const watermarkedContent = steganography.embed(turn.content, watermarkMeta, rawHash);
      return { role: turn.role, content: watermarkedContent };
    }
    return turn;
  });

  const forensicTagEl = document.getElementById("forensic-meta-tag");
  if (forensicTagEl) {
    forensicTagEl.innerText = `ID: ${watermarkMeta.sessionId}`;
  }

  // 2. Populate Native High-Fidelity Enclave Messages Stream
  if (messagesContainer) {
    messagesContainer.innerHTML = "";
    watermarkedTurns.forEach((turn) => {
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble chat-bubble-${turn.role}`;
      
      const headerDiv = document.createElement("div");
      headerDiv.className = "bubble-header";
      
      const avatarDiv = document.createElement("div");
      avatarDiv.className = "bubble-avatar";
      avatarDiv.innerHTML = turn.role === "assistant"
        ? `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM4 11v6a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3z"/></svg>`
        : `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      
      const roleNameDiv = document.createElement("div");
      roleNameDiv.className = "bubble-role-name";
      roleNameDiv.innerText = turn.role === "assistant" ? "Assistant" : "You";
      
      headerDiv.appendChild(avatarDiv);
      headerDiv.appendChild(roleNameDiv);
      bubble.appendChild(headerDiv);

      const contentDiv = document.createElement("div");
      contentDiv.className = "bubble-content";
      // \uE000…\uE001 mark the sharer's own originals; the text inside is already HTML-escaped
      contentDiv.innerHTML = formatChatContent(turn.content)
        .replace(/\uE000([\s\S]*?)\uE001/g, '<mark class="ss-own-original" title="Your original value. Only on this device; link readers see the tag.">$1</mark>');
      bubble.appendChild(contentDiv);

      messagesContainer.appendChild(bubble);
    });
  }
  }
  // A shared chat can carry invisible "smuggled" instructions (Unicode tag characters, bidi
  // controls) aimed at whoever copies it into an AI; drop them before showing anything.
  decryptedData.turns = decryptedData.turns.map(({ role, content }) =>
    ({ role, content: String(content).replace(/(?<!\u{1F3F4}[\u{E0020}-\u{E007E}]*)[\u{E0000}-\u{E007F}]|[‪-‮⁦-⁩]/gu, "") }));
  renderTurns(decryptedData.turns);

  // The sharer's own originals. Saved by the share dialog encrypted with this link's key, in this
  // extension's storage, so only the browser that created the link (and has the link) can show
  // them. Readers, and the relay's own page, never can.
  if (inExtension && shareId && rawHash && !rawHash.includes("k=")) {
    try {
      const api = typeof browser !== "undefined" ? browser : chrome;
      const storageKey = `safeshare_own_${shareId}`;
      const entry = (await api.storage.local.get(storageKey))[storageKey];
      if (entry && entry.ct) {
        const own = await cryptoEngine.decrypt(entry.ct, rawHash);
        const withOriginals = decryptedData.turns.map((turn, i) => {
          let content = turn.content;
          for (const { s, e, o } of [...((own.turns || [])[i] || [])].sort((a, b) => b.s - a.s)) {
            if (typeof o === "string" && s >= 0 && e <= content.length && s < e) {
              content = content.slice(0, s) + "\uE000" + o + "\uE001" + content.slice(e);
            }
          }
          return { role: turn.role, content };
        });
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-platform";
        btn.id = "btn-own-originals";
        let showing = false;
        btn.textContent = "Show originals saved in this browser";
        const remaining = withOriginals.some(turn => /\[(?:REDACTED|CONFIDENTIAL|HR|User)_[A-Z0-9_]+\]|<S\d+>/i.test(turn.content.replace(/\uE000[^\uE001]*\uE001/g, "")));
        const note = document.createElement("span");
        note.textContent = "Some original values are unavailable.";
        note.hidden = true;
        note.setAttribute("role", "status");
        btn.addEventListener("click", () => {
          showing = !showing;
          renderTurns(showing ? withOriginals : decryptedData.turns);
          btn.textContent = showing ? "Hide my original values" : "Show originals saved in this browser";
          note.hidden = !showing || !remaining;
        });
        (document.querySelector(".chat-header-meta") || messagesContainer.parentElement).appendChild(btn);
        btn.after(note);
      }
    } catch (_) {
      // Different browser, expired, or not the sharer: nothing to show
    }
  }

  function formatChatContent(raw) {
    if (!raw) return "";
    if (typeof SafeShareMarkdown !== "undefined" && SafeShareMarkdown &&
        typeof SafeShareMarkdown.format === "function") {
      return SafeShareMarkdown.format(raw);
    }
    // Renderer missing (should not happen): show escaped plain text, never raw HTML.
    const div = document.createElement("div");
    div.textContent = String(raw);
    return `<p>${div.innerHTML.replace(/\n/g, "<br>")}</p>`;
  }

  // 5. Zero-Clipboard Continuation Handlers
  setupZeroClipboardContinue(watermarkedTurns);

  function setupZeroClipboardContinue(turns) {
    const handlePlatformClick = async (platformName) => {
      if (extensionBridge) {
        const summarizeChk = document.getElementById("chk-summarize-context");
        const summarize = summarizeChk ? summarizeChk.checked : true;
        const result = await extensionBridge.forwardToAIPlatform(platformName, turns, { summarize });
        if (result.success) {
          alert(`[SafeShare]\n✓ ${result.message}`);
        } else {
          alert(`[SafeShare]\nContext forwarding is supported directly via the SafeShare Browser Extension.`);
        }
      }
    };

    const chatGptBtn = document.getElementById("btn-continue-chatgpt");
    if (chatGptBtn) {
      chatGptBtn.addEventListener("click", () => handlePlatformClick("ChatGPT"));
    }

    const claudeBtn = document.getElementById("btn-continue-claude");
    if (claudeBtn) {
      claudeBtn.addEventListener("click", () => handlePlatformClick("Claude"));
    }

    const deepseekBtn = document.getElementById("btn-continue-deepseek");
    if (deepseekBtn) {
      deepseekBtn.addEventListener("click", () => handlePlatformClick("DeepSeek"));
    }
  }

});
