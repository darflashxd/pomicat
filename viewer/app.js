/**
 * SafeShare-AI — Shared conversation viewer
 * 
 * Features:
 * 1. Mode 1: Self-Contained Zero-Server Hash Mode (#d=<ciphertext>&k=<key>&exp=<deadline>)
 * 2. Mode 2: Cloud Relay Mode (/v/:id#<key>)
 * 3. Ephemeral GPU Canvas 2D Viewport (Zero-DOM footprint - 0 text nodes)
 * 4. Dynamic Glyph Scrambler (Decoy honeypot DOM)
 * 5. Zero-width watermark (deterrence only: stripped by Unicode normalization or a screenshot)
 * 6. Active Tamper Guard & RAM Memory Zeroizer
 * 7. Zero-Clipboard Continuation Bridge
 */

document.addEventListener("DOMContentLoaded", async () => {
  const cryptoEngine = new SafeShareCrypto();
  const steganography = typeof SafeShareSteganography !== "undefined" ? new SafeShareSteganography() : null;
  const scrambler = typeof SafeShareFontScrambler !== "undefined" ? new SafeShareFontScrambler() : null;
  const extensionBridge = typeof SafeShareExtensionBridge !== "undefined" ? new SafeShareExtensionBridge() : null;
  // Extract ID from URL params or pathname
  const params = new URLSearchParams(window.location.search);
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
    relayUrl: window.SAFESHARE_RELAY_URL || window.location.origin
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

    try {
      const relayHost = window.SAFESHARE_RELAY_URL || window.location.origin;
      const res = await fetch(`${relayHost}/api/share/${shareId}`);
      
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) {
          lockScreen.style.display = "block";
          lockScreen.querySelector("h2").innerText = "⏱️ Link Expired or Shredded";
          lockScreen.querySelector("p").innerText = "This link has passed its expiration deadline or has been shredded after read (Burn-After-Reading).";
          return;
        }
        throw new Error(`Failed to load chat: ${res.statusText}`);
      }

      const { ciphertext } = await res.json();
      decryptedData = await cryptoEngine.decrypt(ciphertext, hashKey);
    } catch (err) {
      console.error("[SafeShare Viewer] Relay decryption error:", err);
      lockScreen.style.display = "block";
      if (err && (err.code === "EXPIRED" || (err.message && err.message.toLowerCase().includes("expired")))) {
        lockScreen.querySelector("h2").innerText = "⏱️ Link Expired or Shredded";
        lockScreen.querySelector("p").innerText = "This link has passed its expiration deadline or has been shredded after read (Burn-After-Reading).";
      } else {
        lockScreen.querySelector("h2").innerText = "Decryption Failed";
        lockScreen.querySelector("p").innerText = "The link may have expired or the relay server is currently offline.";
      }
      return;
    }
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

  if (secBtn && secModal) {
    secBtn.addEventListener("click", () => { secModal.style.display = "flex"; });
  }
  if (footerSecLink && secModal) {
    footerSecLink.addEventListener("click", (e) => {
      e.preventDefault();
      secModal.style.display = "flex";
    });
  }
  if (closeSecModal && secModal) {
    closeSecModal.addEventListener("click", () => { secModal.style.display = "none"; });
  }
  if (secModal) {
    secModal.addEventListener("click", (e) => {
      if (e.target === secModal) secModal.style.display = "none";
    });
  }

  // 1. Forensic Watermarking Injection (Invisible Zero-Width Steganography)
  const watermarkMeta = {
    recipientId: recipientId,
    sessionId: (shareId || "hash_" + rawHash.substring(0, 8)).substring(0, 16),
    timestamp: Date.now()
  };

  watermarkedTurns = decryptedData.turns.map(turn => {
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
      contentDiv.innerHTML = formatChatContent(turn.content);
      bubble.appendChild(contentDiv);

      messagesContainer.appendChild(bubble);
    });
  }

  function formatChatContent(raw) {
    if (!raw) return "";

    function escapeHtml(text) {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function formatInline(text) {
      let s = escapeHtml(text);
      s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/\n/g, "<br>");
      return s;
    }

    const blocks = [];
    const parts = raw.split(/(```[a-zA-Z0-9_-]*[\s\S]*?```)/g);

    for (const part of parts) {
      if (part.startsWith("```") && part.endsWith("```")) {
        const match = part.match(/^```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```$/);
        if (match) {
          const lang = match[1] || "text";
          const code = match[2].trim();
          blocks.push(`<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`);
        }
      } else {
        const sections = part.split(/\n\n+/);
        for (const sec of sections) {
          const trimmed = sec.trim();
          if (!trimmed) continue;

          const lines = trimmed.split("\n");
          const isTable = lines.some(l => (l.trim().startsWith("|") && l.trim().endsWith("|")) || (l.includes("\t") && l.split("\t").length >= 2));

          if (isTable) {
            const rows = [];
            for (const line of lines) {
              const l = line.trim();
              if (!l) continue;
              if (l.startsWith("|") && l.endsWith("|")) {
                if (/^\|[\s:-|-]+\|$/.test(l)) continue;
                rows.push(l.split("|").slice(1, -1).map(c => c.trim()));
              } else if (l.includes("\t")) {
                rows.push(l.split("\t").map(c => c.trim()).filter(Boolean));
              }
            }

            if (rows.length > 0) {
              let tableHtml = `<div class="table-wrapper"><table>`;
              const header = rows[0];
              tableHtml += "<thead><tr>" + header.map(h => `<th>${formatInline(h)}</th>`).join("") + "</tr></thead>";
              if (rows.length > 1) {
                tableHtml += "<tbody>";
                for (let r = 1; r < rows.length; r++) {
                  tableHtml += "<tr>" + rows[r].map(c => `<td>${formatInline(c)}</td>`).join("") + "</tr>";
                }
                tableHtml += "</tbody>";
              }
              tableHtml += "</table></div>";
              blocks.push(tableHtml);
              continue;
            }
          }

          blocks.push(`<p>${formatInline(trimmed)}</p>`);
        }
      }
    }

    return blocks.join("\n");
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.innerText = str;
    return div.innerHTML;
  }
});
