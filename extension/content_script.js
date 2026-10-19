/**
 * SafeShare-AI — Content Script
 * Injects SafeShare action button into ChatGPT, Claude, and DeepSeek interfaces,
 * manages Pre-Inference Outbound Symbolic Transformation (<S1>),
 * and executes Local Compute Hydration in client RAM.
 */

(function () {
  // The version tells you whether the tab runs the extension you just reloaded
  const runtimeApi = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
  const loadedVersion = runtimeApi && runtimeApi.runtime && runtimeApi.runtime.getManifest ? runtimeApi.runtime.getManifest().version : "dev";
  console.log(`[SafeShare-AI] Extension content script active (v${loadedVersion}).`);

  // Ephemeral engines initialized in content script context
  const symbolicVault = typeof SafeShareSymbolicVault !== "undefined" ? new SafeShareSymbolicVault() : null;
  if (symbolicVault && typeof location !== "undefined") {
    const initMatch = (location.href || "").match(/(?:\/c\/|\/chat\/|\/a\/chat\/s\/)([a-zA-Z0-9_-]+)/);
    if (initMatch && initMatch[1]) {
      symbolicVault.loadFromSession(initMatch[1]);
    }
  }
  const symbolicRewriter = (typeof SafeShareSymbolicRewriter !== "undefined" && symbolicVault) ? new SafeShareSymbolicRewriter(symbolicVault) : null;
  const localCompute = typeof SafeShareLocalCompute !== "undefined" ? new SafeShareLocalCompute() : null;

  // Before-sending protection ("shield") mode, chosen from the chip above the chat input:
  //   "all"     replace IDs, keys, cards, emails, phones, and turn amounts into <S1>
  //   "amounts" only turn amounts into <S1>
  //   "off"     send as typed (default)
  const SHIELD_MODES = {
    all: "Protect IDs + amounts",
    amounts: "Protect amounts only",
    off: "Off (send as typed)"
  };
  // Settings live in extension storage (engine/settings.js), out of the chat site's reach
  const settings = typeof SafeShareSettings !== "undefined" ? SafeShareSettings : null;
  function getShieldMode() {
    const m = settings ? settings.get("shield_mode", "off") : "off";
    return SHIELD_MODES[m] ? m : "off";
  }
  function setShieldMode(mode) {
    if (settings) settings.set("shield_mode", mode);
  }
  function isPreInferenceEnabled() {
    return getShieldMode() !== "off";
  }

  const shieldIdScanner = typeof HeuristicsRedactor !== "undefined" ? new HeuristicsRedactor() : null;
  const spanArbiter = typeof PrioritySpanArbiter !== "undefined" ? new PrioritySpanArbiter() : null;
  // "Is this name/place the writer's own?" rules, shared with the CLI (engine/pseudonymizer.js)
  const personalBefore = ConsistentPseudonymizer.PERSONAL_BEFORE;
  function requestOffscreenNer(text) {
    return SafeShareNer.analyze(text).then(result => result.success ? result.spans : null);
  }

  /**
   * Originals of the identifiers the shield replaced, so they can be shown again on this screen
   * only. Numbered per kind ([PHONE_1], [PHONE_2]) so two phones stay distinguishable; the same
   * value always gets the same placeholder. Kept in the extension's private session storage
   * (not the page's), which the chat site's scripts can't read, and cleared when the browser closes.
   */
  // One map per chat ([NAME_1] in chat A is not [NAME_1] in chat B), keyed by the chat's ID from
  // the URL; a brand-new chat uses "new" until the site assigns its ID.
  const idMap = { byValue: new Map(), byPlaceholder: new Map(), counters: {} };
  const extApi = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
  const idStore = extApi && extApi.storage && extApi.storage.session ? extApi.storage.session : null;
  const chatIdOf = (url) => ((url || "").match(/(?:\/c\/|\/chat\/|\/a\/chat\/s\/)([a-zA-Z0-9_-]+)/) || [])[1] || null;
  let idMapKey = `safeshare_idmap_${chatIdOf(typeof location !== "undefined" ? location.href : "") || "new"}`;
  function loadIdMap(chatId) {
    idMap.byValue.clear();
    idMap.byPlaceholder.clear();
    idMap.counters = {};
    idMapKey = `safeshare_idmap_${chatId || "new"}`;
    for (const [ph, value] of idMapsSeen.get(idMapKey) || []) rememberId(ph, value);
    if (!idStore) return;
    const key = idMapKey;
    Promise.resolve(idStore.get(key)).then((res) => {
      if (key !== idMapKey) return; // switched chats meanwhile
      for (const [ph, value] of (res && res[key]) || []) rememberId(ph, value);
    }).catch(() => {});
  }
  const idMapsSeen = new Map(); // this tab's maps per chat, so switching back is instant
  function saveIdMap() {
    idMapsSeen.set(idMapKey, [...idMap.byPlaceholder]);
    // try: in a tab left over after an extension reload this throws, and it must not hold the send
    try { if (idStore) Promise.resolve(idStore.set({ [idMapKey]: [...idMap.byPlaceholder] })).catch(() => {}); } catch (_) {}
  }
  loadIdMap(chatIdOf(typeof location !== "undefined" ? location.href : ""));
  function rememberId(placeholder, value) {
    idMap.byPlaceholder.set(placeholder, value);
    idMap.byValue.set(value, placeholder);
    const m = /^\[([A-Z_]+)_(\d+)\]$/.exec(placeholder);
    if (m) idMap.counters[m[1]] = Math.max(idMap.counters[m[1]] || 0, Number(m[2]));
  }
  function placeholderFor(value, label) {
    if (idMap.byValue.has(value)) return idMap.byValue.get(value);
    const n = (idMap.counters[label] || 0) + 1;
    const ph = `[${label}_${n}]`;
    rememberId(ph, value);
    saveIdMap();
    return ph;
  }

  // Readable placeholder names; anything else uses the rule's own tag ([REDACTED_X] -> X)
  const ID_LABELS = {
    ID_NIK: "NIK", ID_NPWP: "NPWP", PHONE: "PHONE", EMAIL: "EMAIL", CREDIT_CARD: "CARD",
    CONVERSATIONAL_PASSWORD: "PASSWORD", OTP_CODE: "OTP", ADDRESS_ID: "ADDRESS",
    ENGLISH_PHYSICAL_ADDRESS: "ADDRESS", IBAN_ACCOUNT: "ACCOUNT", OPENAI_KEY: "API_KEY",
    ANTHROPIC_KEY: "API_KEY", GOOGLE_API_KEY: "API_KEY", GITHUB_TOKEN: "TOKEN", AWS_KEY: "API_KEY"
  };
  function idLabel(det) {
    if (ID_LABELS[det.type]) return ID_LABELS[det.type];
    const tag = /\[REDACTED_([A-Z_]+)\]/.exec(typeof det.replacement === "string" ? det.replacement : "");
    return tag ? tag[1] : String(det.type).replace(/[^A-Z_]/gi, "").toUpperCase();
  }

  /** Replaces hard identifiers with numbered placeholders, keeping words like "password ... aku". */
  // "Keep debug details": IPs, hostnames, user@host and paths (the System & Shell rules) are sent
  // as typed so the AI can help debug. Passwords, keys and tokens are still replaced.
  function keepDebugDetails() {
    const v = settings ? settings.get("debug_details", false) : false;
    return v === true || v === "true";
  }
  function replaceIds(text, { dryRun }) {
    const scan = shieldIdScanner.scan(text);
    const detections = keepDebugDetails() ? scan.detections.filter((d) => d.category !== "SYSTEM") : scan.detections;
    if (!detections.length) return { out: text, count: 0 };
    // Detection offsets refer to scan.baseText: the message as typed (minus smuggling characters).
    // Only the matched parts change; Cyrillic, Greek and emoji elsewhere are sent as typed.
    let out = scan.baseText;
    // Number placeholders in reading order ([PHONE_1] is the first phone), then replace from the
    // end so earlier offsets stay valid
    const edits = [...detections].sort((a, b) => a.index - b.index).map((det) => {
      // Keep what the rule keeps around the value ("password ", "curl -u ", the closing quote in
      // PASSWORD='…'): only the part the rule changed becomes the placeholder
      if (Number.isInteger(det.valueStart) && Number.isInteger(det.valueEnd) && det.valueEnd > det.valueStart) {
        const value = scan.baseText.slice(det.valueStart, det.valueEnd);
        return { det, text: det.raw.slice(0, det.valueStart - det.index) +
          (dryRun ? "[ID]" : placeholderFor(value, idLabel(det))) + det.raw.slice(det.valueEnd - det.index) };
      }
      // Missing capture metadata must never infer a secret boundary from a dummy replacement.
      // Fail closed over the detected match; migrate such rules to explicit value captures.
      return {det, text:dryRun ? "[ID]" : placeholderFor(det.raw, idLabel(det))};
    });
    for (const { det, text: replacement } of edits.reverse()) {
      out = out.slice(0, det.index) + replacement + out.slice(det.index + det.length);
    }
    return { out, count: detections.length };
  }

  /**
   * What the shield would send: in "all" mode, hard identifiers become numbered placeholders,
   * then amounts become <S1>. Returns { isTransformed, sanitizedPrompt, count }.
   */
  // Invisible "ASCII smuggling" characters: Unicode tag characters (kept only inside a flag emoji
  // such as England's) and bidi override/isolate controls. Text pasted from a web page can carry
  // hidden instructions for the AI in them; protection removes them before sending.
  const SMUGGLED = /(?<!\u{1F3F4}[\u{E0020}-\u{E007E}]*)[\u{E0000}-\u{E007F}]|[‪-‮⁦-⁩]/gu;
  function shieldRewrite(text, { dryRun = false } = {}) {
    const original = text;
    text = text.replace(SMUGGLED, "");
    let out = text;
    let count = 0;
    if (getShieldMode() === "all" && shieldIdScanner) {
      const ids = replaceIds(text, { dryRun });
      out = ids.out;
      count += ids.count;
    }
    // Dry run (chip preview while typing): analyze() does not store values in the vault
    if (dryRun) {
      const analysis = symbolicRewriter.analyze(out);
      count += analysis.hasSensitive ? analysis.detectedItems.length : 0;
      return { isTransformed: count > 0, sanitizedPrompt: out, count };
    }
    const rewritten = symbolicRewriter.rewrite(out);
    if (rewritten.isTransformed) {
      out = rewritten.sanitizedPrompt;
      count += (rewritten.symbols || []).length || 1;
    }
    return { isTransformed: out !== original, sanitizedPrompt: out, count };
  }

  /**
   * Hybrid Dual-Gate Rewrite: runs Gate 1 heuristics + Gate 2 ONNX NER via offscreen document.
   */
  async function shieldRewriteAsync(text, { dryRun = false } = {}) {
    const syncRes = shieldRewrite(text, { dryRun });
    if (getShieldMode() !== "all" || dryRun) {
      return syncRes;
    }

    try {
      const nerSpans = await requestOffscreenNer(syncRes.sanitizedPrompt);
      // Fail open, but say so: the message is still sent with IDs and amounts hidden
      if (nerSpans === null) return { ...syncRes, nerUnavailable: true };
      if (!nerSpans.length) {
        return syncRes;
      }

      let out = syncRes.sanitizedPrompt;
      let addedCount = 0;

      const validNerSpans = nerSpans.filter((s) =>
        ["PERSON", "LOCATION", "GIVEN_NAME", "SURNAME", "STREET_NAME", "CITY", "STATE", "ZIP_CODE", "SECONDARY_ADDRESS", "BUILDING_NUMBER"].includes(s.label)
      );

      if (validNerSpans.length && spanArbiter) {
        const protectedSpans = spanArbiter.extractProtectedSpans(out);
        const arbitrated = spanArbiter.arbitrate({
          text: out,
          tier0Allow: protectedSpans,
          tier1Det: [],
          tier2Ner: validNerSpans
        });

        // Join neighbouring pieces of one name/place ("Rina" + "Wijaya"), then keep only the
        // writer's own ("my wife Rina Wijaya", "saya tinggal di Bandung"). Celebrities, story
        // characters and places in essays go through unchanged.
        const kindOf = (s) => (["PERSON", "GIVEN_NAME", "SURNAME"].includes(s.label) ? "PERSON" : "LOCATION");
        const merged = [];
        for (const s of (arbitrated.resolvedSpans || []).filter((s) => s.tier === 2 && s.start < s.end && s.end <= out.length)
          .sort((a, b) => a.start - b.start)) {
          const prev = merged[merged.length - 1];
          if (prev && prev.kind === kindOf(s) && /^[\s,]*$/.test(out.slice(prev.end, s.start))) prev.end = Math.max(prev.end, s.end);
          else merged.push({ start: s.start, end: s.end, kind: kindOf(s) });
        }
        const personal = merged.filter((s) => personalBefore[s.kind].test(out.slice(Math.max(0, s.start - 60), s.start)));
        const named = personal.map((s) => ({ ...s, ph: placeholderFor(out.slice(s.start, s.end), s.kind === "PERSON" ? "NAME" : "PLACE") }));
        for (const s of named.reverse()) {
          out = out.slice(0, s.start) + s.ph + out.slice(s.end);
          addedCount++;
        }
      }

      return {
        isTransformed: syncRes.isTransformed || addedCount > 0,
        sanitizedPrompt: out,
        count: syncRes.count + addedCount
      };
    } catch (err) {
      console.warn("[SafeShare-AI] Gate 2 NER pass fallback:", err);
      return { ...syncRes, nerUnavailable: true };
    }
  }

  function initSafeShareButton() {
    if (document.getElementById("safeshare-action-pill")) return;

    const pill = document.createElement("button");
    pill.id = "safeshare-action-pill";
    pill.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span>SafeShare</span>
    `;
    pill.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 28px;
      z-index: 99999;
      background: rgba(24, 24, 27, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #f4f4f5;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 9999px;
      padding: 7px 14px;
      font-size: 13px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 7px;
      transition: all 0.15s ease;
    `;

    pill.addEventListener("mouseenter", () => {
      pill.style.transform = "translateY(-1px)";
      pill.style.borderColor = "rgba(255, 255, 255, 0.22)";
      pill.style.background = "#27272a";
    });
    pill.addEventListener("mouseleave", () => {
      pill.style.transform = "translateY(0)";
      pill.style.borderColor = "rgba(255, 255, 255, 0.12)";
      pill.style.background = "rgba(24, 24, 27, 0.92)";
    });

    pill.addEventListener("click", () => {
      handleSessionRouteChange();
      const turns = extractConversationTurns();
      if (turns.length === 0) {
        alert("SafeShare: No active conversation found in the current chat window.");
        return;
      }
      // Reading only one side means the site's layout changed: a share without your own messages
      // also stops the inversion defence from knowing which amounts were yours (see ROADMAP P0.1)
      const users = turns.filter(t => t.role === "user").length;
      const answers = turns.filter(t => t.role === "assistant").length;
      if ((!users || !answers) && !window.confirm(`SafeShare found ${users} of your messages and ${answers} AI answers in this chat. ` +
        "The site may have changed its layout, so the share could be incomplete and protection weaker. Open the share dialog anyway?")) return;
      const modal = new SafeShareModal();
      modal.open(turns);
    });

    document.body.appendChild(pill);
  }

  /**
   * Helper to check if an element is genuinely visible in the active document layout.
   * Excludes elements inside aria-hidden, inert, or display:none containers (e.g. inactive SPA chat panes).
   */
  function isVisibleElement(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest("[aria-hidden='true'], [inert], .hidden, [hidden]")) return false;
    if (typeof el.checkVisibility === "function") {
      try {
        if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false;
      } catch (_) {}
    }
    try {
      const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (s && (s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse")) {
        return false;
      }
    } catch (_) {}
    return el.offsetWidth > 0 || el.offsetHeight > 0 || (el.getClientRects && el.getClientRects().length > 0);
  }

  /**
   * Finds the active prompt input area across ChatGPT, Claude, and DeepSeek.
   * Strictly filters out sidebar items, chat rename inputs, and non-composer elements.
   */
  function findPromptInputElement() {
    const isValidInput = (el) => {
      if (!el || typeof document === "undefined" || !document.body || !document.body.contains(el)) return false;
      if (!isVisibleElement(el)) return false;
      // Exclude sidebar search, chat rename input, and elements inside modals/headers
      if (el.closest("#safeshare-modal-backdrop, aside, nav, [class*='sidebar'], header")) return false;
      return true;
    };

    const selectors = [
      "#prompt-textarea",
      "form textarea",
      "form [contenteditable='true']",
      "div.ProseMirror[contenteditable='true']",
      "[data-testid='chat-input']",
      "textarea[data-id='root']",
      "textarea[placeholder*='Message' i], textarea[placeholder*='Pesan' i], textarea[placeholder*='Ask' i]",
      "div[contenteditable='true'][data-placeholder]",
      "fieldset div[contenteditable='true']",
      "textarea"
    ];

    for (const sel of selectors) {
      const matches = document.querySelectorAll(sel);
      for (const el of matches) {
        if (isValidInput(el)) return el;
      }
    }
    return null;
  }

  /**
   * Retrieves text from the input element (handling textarea and contenteditable).
   */
  function getInputText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      return el.value || "";
    }
    return el.innerText || el.textContent || "";
  }

  /**
   * Injects rewritten symbolic text into ProseMirror/Lexical/React input element.
   */
  function setInputText(el, newText) {
    if (!el) return;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.value = newText;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    // Contenteditable (ChatGPT / Claude ProseMirror / Lexical)
    el.focus();
    let ok = false;
    if (typeof document.execCommand === "function") {
      document.execCommand("selectAll", false, null);
      ok = document.execCommand("insertText", false, newText);
    }
    if (!ok) {
      el.innerText = newText;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /**
   * Manages the subtle Privacy Shield Chip indicator near the input prompt area.
   * Enforces Active Re-Parenting Invariant: if React unmounts/replaces the composer form,
   * stale orphan bars/indicators are cleaned up and remounted directly above the active composer.
   */
  function updateShieldIndicator(inputEl) {
    if (!symbolicRewriter || !inputEl || typeof document === "undefined" || !document.body) return;

    const isEnabled = isPreInferenceEnabled();

    // 1. Locate the active prompt composer container or form
    const composerForm = inputEl.closest("form") || inputEl.closest("[class*='composer']") || inputEl.closest("fieldset") || inputEl.closest("div.relative") || inputEl.parentElement;
    if (!composerForm || !composerForm.parentElement) return;

    // 2. Active Re-Parenting Invariant for safeshare-shield-bar:
    // If bar does not exist, or is detached, or is NOT directly before the active composerForm:
    let bar = document.getElementById("safeshare-shield-bar");
    if (!bar || !document.body.contains(bar) || bar.parentElement !== composerForm.parentElement || bar.nextElementSibling !== composerForm) {
      if (bar) bar.remove(); // Remove stale or misplaced bar
      bar = document.createElement("div");
      bar.id = "safeshare-shield-bar";
      bar.style.cssText = "display: flex; justify-content: flex-end; width: 100%; margin-bottom: 6px; padding: 0 4px; pointer-events: none; z-index: 99999;";
      composerForm.parentElement.insertBefore(bar, composerForm);
    }

    // 3. Active Re-Parenting Invariant for safeshare-shield-indicator:
    // If indicator does not exist, or is detached, or is NOT a child of the active bar:
    let indicator = document.getElementById("safeshare-shield-indicator");
    if (!indicator || !document.body.contains(indicator) || indicator.parentElement !== bar) {
      if (indicator) indicator.remove(); // Remove stale indicator
      indicator = document.createElement("div");
      indicator.id = "safeshare-shield-indicator";
      indicator.title = "SafeShare: what to protect before sending (click to change)";
      indicator.addEventListener("click", (e) => {
        e.stopPropagation();
        if (extensionGone()) return; // "SafeShare was updated: refresh this tab"
        toggleShieldMenu(indicator, () => {
          updateShieldIndicator(findPromptInputElement() || inputEl);
          runHydrationPass();
        });
      });
      indicator.style.pointerEvents = "auto";
      bar.appendChild(indicator);
    }

    try { syncSiteTheme(bar.parentElement); } catch (_) {}
    if (Number(indicator.dataset.errorUntil || 0) > Date.now()) return; // a held-message notice is showing

    if (!isEnabled) {
      indicator.className = "shield-disabled";
      indicator.textContent = "🛡️ Protection off ▾";
      return;
    }

    const mode = getShieldMode();
    let count = 0;
    try { count = shieldRewrite(getInputText(inputEl), { dryRun: true }).count; } catch (_) {}
    indicator.className = "shield-active";
    indicator.textContent = count
      ? `🛡️ ${count} item${count > 1 ? "s" : ""} will be protected ▾`
      : `🛡️ ${mode === "all" ? "Protecting IDs + amounts" : "Protecting amounts"} ▾`;
  }

  /**
   * Light or dark chat site, by the site's own theme (not the OS setting): the first solid
   * background behind the chat box decides. Sets html[data-ss-theme]; modal.css has the light
   * variants of the chip, its menu and the on-screen values.
   */
  function syncSiteTheme(fromEl) {
    let rgb = null;
    for (let el = fromEl; el && !rgb; el = el.parentElement) {
      const n = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      if (n.length >= 3 && (n.length < 4 || n[3] > 0.5)) rgb = n;
    }
    // Nothing painted: the page canvas, white unless the site asks for a dark color scheme
    const light = rgb ? 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] > 140
      : !/dark/.test(getComputedStyle(document.documentElement).colorScheme || "");
    const theme = light ? "light" : "dark";
    if (document.documentElement.dataset.ssTheme !== theme) document.documentElement.dataset.ssTheme = theme;
  }

  /** Small menu under the chip to pick the before-sending protection mode. */
  function toggleShieldMenu(anchor, onChange) {
    const existing = document.getElementById("safeshare-shield-menu");
    if (existing) {
      existing.remove();
      return;
    }
    const menu = document.createElement("div");
    menu.id = "safeshare-shield-menu";
    const title = document.createElement("div");
    title.className = "shield-menu-title";
    title.textContent = "Before sending, protect:";
    menu.appendChild(title);
    const current = getShieldMode();
    for (const [mode, label] of Object.entries(SHIELD_MODES)) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "shield-menu-option" + (mode === current ? " selected" : "");
      opt.textContent = (mode === current ? "● " : "○ ") + label;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        setShieldMode(mode);
        menu.remove();
        onChange();
      });
      menu.appendChild(opt);
    }
    const debug = document.createElement("label");
    debug.className = "shield-menu-option";
    const debugBox = document.createElement("input");
    debugBox.type = "checkbox";
    debugBox.checked = keepDebugDetails();
    // Chat sites reset checkbox styles (ChatGPT hides them); draw it explicitly
    debugBox.style.cssText = "appearance: auto; -webkit-appearance: checkbox; width: 13px; height: 13px; margin: 0 6px 0 0; vertical-align: middle; opacity: 1; position: static;";
    debugBox.addEventListener("click", (e) => e.stopPropagation());
    debugBox.addEventListener("change", () => {
      if (settings) settings.set("debug_details", debugBox.checked);
      onChange();
    });
    debug.title = "IPs, hostnames, user@host and file paths are sent as typed. Passwords, keys and tokens are still replaced.";
    debug.addEventListener("click", (e) => e.stopPropagation());
    debug.append(debugBox, "Keep debug details (IPs, hosts, paths)");
    menu.appendChild(debug);
    const note = document.createElement("div");
    note.className = "shield-menu-note";
    note.textContent = "IDs + amounts also replaces your own names and places (\"my wife Rina\") " +
      "when the local model is ready (Chrome). Sharing always removes them.";
    menu.appendChild(note);
    // On the page body with a fixed position: chat boxes that clip their overflow (DeepSeek) would
    // otherwise hide the menu and swallow its clicks. Opens above the chip, or below it if no room.
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    Object.assign(menu.style, { position: "fixed", zIndex: "2147483647", right: `${Math.max(8, window.innerWidth - r.right)}px` });
    if (menu.offsetHeight + 14 < r.top) menu.style.bottom = `${window.innerHeight - r.top + 6}px`;
    else Object.assign(menu.style, { top: `${r.bottom + 6}px`, bottom: "auto" });
    setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
  }

  /**
   * Hooks prompt submission to apply Pre-Inference symbolic rewrite transparently.
   */
  function initPreInferenceInterception() {
    if (!symbolicRewriter || !symbolicVault) return;

    const inputEl = findPromptInputElement();
    if (!inputEl) return;

    // Attach typing listener to update shield indicator
    if (!inputEl.dataset.safeshareHooked) {
      inputEl.dataset.safeshareHooked = "true";
      inputEl.addEventListener("input", () => updateShieldIndicator(inputEl));
      inputEl.addEventListener("focus", () => updateShieldIndicator(inputEl));
      inputEl.addEventListener("keyup", () => updateShieldIndicator(inputEl));
    }

    installSubmitGuard();
    updateShieldIndicator(inputEl);
  }

  // Send buttons, most specific first. Checked on the live sites (Oct 2026): a loose pattern such as
  // "fieldset button" matched Claude's "+" (attach) button, so the re-send opened a menu and any
  // click on it ran the guard; DeepSeek's send arrow (a div) matched nothing, so clicking it sent
  // the message without protection.
  const SEND_BUTTONS = [
    "button[data-testid='send-button']",                       // ChatGPT (older; Oct 2026 it is aria-label "Send", below)
    "button[data-testid='chat-input-send']",                   // Claude
    "button[aria-label='Send message']", "button[aria-label='Send prompt']",
    "div[role='button'].ds-button--primary.ds-button--circle", // DeepSeek
    "button[aria-label*='Send']", "button[aria-label*='Kirim']",
    "form button[type='submit']"
  ];
  const SEND_BUTTON_SELECTOR = SEND_BUTTONS.join(", ");
  function findSendButton() {
    for (const sel of SEND_BUTTONS) {
      const btn = [...document.querySelectorAll(sel)].find((b) => !b.disabled && b.getAttribute("aria-disabled") !== "true" &&
        b.getBoundingClientRect().width > 0 && !b.closest("#safeshare-modal-backdrop"));
      if (btn) return btn;
    }
    return null;
  }
  let submitGuardInstalled = false;
  let resubmitting = false;
  let isRewriting = false;

  /**
   * Holds a send until the rewrite is in place. Listens on window in the capture phase, so it runs
   * before the chat site's own Enter / send handlers (ChatGPT handles them above the input box).
   * If the prompt needs rewriting: cancel this send, rewrite, give the editor (ProseMirror keeps
   * its own copy of the text) a moment to sync, then send again.
   */
  function installSubmitGuard() {
    if (submitGuardInstalled) return;
    submitGuardInstalled = true;

    const guard = async (e, resend) => {
      if (resubmitting) return;
      if (isRewriting) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (!isPreInferenceEnabled() || !symbolicRewriter) return;
      const inputEl = findPromptInputElement();
      if (!inputEl) return;
      const text = getInputText(inputEl);
      if (!text || !text.trim()) return;
      const sourceUrl = location.href;
      const sourceMode = getShieldMode();
      const stillCurrent = expected => location.href === sourceUrl && getShieldMode() === sourceMode &&
        inputEl.isConnected && findPromptInputElement() === inputEl && getInputText(inputEl) === expected;
      const cancelPending = () => {
        isRewriting = false;
        const indicator = document.getElementById("safeshare-shield-indicator");
        if (indicator) indicator.textContent = "Draft or chat changed — review and send again ▾";
      };

      // Fail closed: if protection itself breaks, hold the message instead of letting the site send
      // it unprotected. Switching protection off (chip) sends as typed.
      const holdOnError = (err) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        console.error("[SafeShare-AI] Protection failed; message held, not sent:", err);
        const indicator = document.getElementById("safeshare-shield-indicator");
        if (indicator) {
          indicator.textContent = "🛡️ Protection error: message NOT sent. Retry, or switch protection off ▾";
          indicator.dataset.errorUntil = String(Date.now() + 8000); // keep it readable (see updateShieldIndicator)
        }
      };
      let syncCheck;
      try {
        syncCheck = shieldRewrite(text, { dryRun: true });
      } catch (err) {
        return holdOnError(err);
      }
      if (!syncCheck.isTransformed && getShieldMode() !== "all") return;

      e.preventDefault();
      e.stopImmediatePropagation();
      isRewriting = true;

      let rewritten;
      try {
        rewritten = await shieldRewriteAsync(text);
      } catch (err) {
        // (The name model failing is handled inside as nerUnavailable; this is a real engine error)
        isRewriting = false;
        return holdOnError(err);
      }
      if (!stillCurrent(text)) return cancelPending();

      if (rewritten && rewritten.isTransformed) {
        try { setInputText(inputEl, rewritten.sanitizedPrompt); }
        catch (err) { isRewriting = false; return holdOnError(err); }
        console.log("[SafeShare-AI] Protected before sending (Hybrid Gate 1+2):", rewritten.count, "item(s)");
      }
      if (rewritten && rewritten.nerUnavailable) {
        const indicator = document.getElementById("safeshare-shield-indicator");
        if (indicator) {
          indicator.textContent = "🛡️ Sent without the name/place check (local model not ready)";
          setTimeout(() => updateShieldIndicator(findPromptInputElement() || inputEl), 6000);
        }
      }

      setTimeout(() => {
        const expected = rewritten && rewritten.isTransformed ? rewritten.sanitizedPrompt : text;
        if (!stillCurrent(expected)) return cancelPending();
        resubmitting = true;
        try { resend(inputEl); }
        finally { resubmitting = false; isRewriting = false; }
      }, rewritten && rewritten.isTransformed ? 120 : 10);
    };

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const inputEl = findPromptInputElement();
      if (!inputEl || !(e.target === inputEl || inputEl.contains(e.target))) return;
      guard(e, () => {
        const btn = findSendButton();
        if (btn) btn.click();
        else inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
      });
    }, true);

    window.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest && e.target.closest(SEND_BUTTON_SELECTOR);
      if (!btn) return;
      guard(e, () => btn.click());
    }, true);
    window.addEventListener("submit", (e) => {
      const input = findPromptInputElement();
      if (!input || input.closest("form") !== e.target) return;
      guard(e, () => {
        if (e.submitter && e.submitter.isConnected) e.target.requestSubmit(e.submitter);
        else e.target.requestSubmit();
      });
    }, true);
  }

  // Badge mounting and escaping live in engine/local_compute.js (tested in tests/fixtures/hydration_sanitize.html)
  const sanitizeAndMountHydration = (node, htmlStr) => SafeShareLocalCompute.mountSanitized(node, htmlStr);
  const escapeHtml = (s) => SafeShareLocalCompute.escapeHtml(s);

  const MESSAGE_SELECTOR = "[data-markdown-text-style='assistant-message'], [data-message-author-role='assistant'], " +
    ".font-claude-message, .font-claude-response, div.ds-markdown";

  /**
   * Shows the shield's numbered placeholders ([NIK_1], [NAME_2]) as the real values, on this
   * screen only. Each value sits in a closed shadow root (the chat site's scripts can't read it
   * through the DOM) on a span carrying the placeholder in data-expr, so reading the chat for
   * sharing (getCleanNodeContent) puts the placeholder back.
   */
  // Logged once per placeholder when it can't be shown, so a failure on a real chat site can be
  // diagnosed from the console. Never logs the value.
  const restoreDiagnosed = new Set();
  function diagnoseRestore() {
    const roots = document.querySelectorAll(MESSAGE_SELECTOR);
    for (const m of (document.body.innerText || "").matchAll(/\[([A-Z_]+)_(\d+)\]/g)) {
      if (restoreDiagnosed.has(m[0]) || restoreDiagnosed.size > 20) continue;
      restoreDiagnosed.add(m[0]);
      const why = !idMap.byPlaceholder.has(m[0])
        ? "not in this tab's map (sent from another tab, before a reload, or in another chat)"
        : !roots.length ? "no assistant message found by MESSAGE_SELECTOR on this site"
          : "only in your own message (shown as sent, by design) or outside the answer";
      console.info(`[SafeShare-AI] ${m[0]} left as is: ${why}. Map size ${idMap.byPlaceholder.size}, answer roots ${roots.length}.`);
    }
  }

  function restoreIdsOnScreen() {
    if (!idMap.byPlaceholder.size) return diagnoseRestore();
    const pattern = /\[([A-Z_]+)_(\d+)\]/g;
    setTimeout(diagnoseRestore, 0);
    for (const root of document.querySelectorAll(MESSAGE_SELECTOR)) {
      if (isPromptInputOrUIElement(root)) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.nodeValue.includes("[") && !n.parentElement.closest(".ss-local-compute, [data-expr]")
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
      });
      const nodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
      for (const node of nodes) {
        const text = node.nodeValue;
        if (![...text.matchAll(pattern)].some((m) => idMap.byPlaceholder.has(m[0]))) continue;
        const frag = document.createDocumentFragment();
        let last = 0;
        for (const m of text.matchAll(pattern)) {
          const value = idMap.byPlaceholder.get(m[0]);
          if (value === undefined) continue;
          frag.appendChild(document.createTextNode(text.slice(last, m.index)));
          const span = document.createElement("span");
          span.className = "ss-local-compute ss-id-restored";
          span.dataset.expr = encodeURIComponent(m[0]);
          span.title = `Only on your screen. The AI received ${m[0]}.`;
          span.attachShadow({ mode: "closed" }).textContent = value;
          frag.appendChild(span);
          last = m.index + m[0].length;
        }
        frag.appendChild(document.createTextNode(text.slice(last)));
        node.replaceWith(frag);
      }
    }
  }

  /**
   * Under your own messages: "🔒 2 values protected · show". The bubble itself keeps the
   * placeholders (what the AI received; the site's edit/copy and our shares use them) and is never
   * touched, since the sites redraw it. The note is a sibling with everything in a closed shadow
   * root, so the site's scripts can't read the values, and getCleanNodeContent drops it.
   */
  const SENT_PLACEHOLDER = /\[[A-Z][A-Z_]*_\d+\]|<S\d+>/g;
  const sentNoteValues = new WeakMap(); // note -> its values, in memory only (never in the page)
  function ownMessageBubbles() {
    const deepseek = [...document.querySelectorAll("div.ds-message")]
      .filter(el => !el.querySelector(".ds-assistant-message-main-content, div.ds-markdown"))
      .map(el => el.querySelector(".ds-collapsible-text") || el);
    // Innermost only: ChatGPT nests the bubble inside its role element
    return [...document.querySelectorAll(USER_BUBBLE_SELECTOR), ...deepseek]
      .filter(el => !el.querySelector(USER_BUBBLE_SELECTOR) && !isComposerOrSafeShareUI(el));
  }
  function addSentNotes() {
    const vault = symbolicVault && symbolicVault.size() ? symbolicVault.getAll() : {};
    const valueOf = (p) => idMap.byPlaceholder.get(p) ?? (vault[p] ? vault[p].raw : undefined);
    // No early return on an empty map: notes whose values are gone (other chat) must be removed
    for (const bubble of ownMessageBubbles()) {
      // Values are taken now, while known: looking them up on click could hit the map while a chat
      // switch reloads it, and the note showed "[NAME_1] = undefined"
      const pairs = [...new Set((bubble.innerText || bubble.textContent || "").match(SENT_PLACEHOLDER) || [])]
        .map(p => [p, valueOf(p)]).filter(([, v]) => v !== undefined && v !== null && v !== "");
      const key = JSON.stringify(pairs);
      const next = bubble.nextElementSibling;
      const existing = next && next.classList.contains("ss-sent-note") ? next : null;
      if (existing && sentNoteValues.get(existing) === key) continue;
      if (existing) existing.remove();
      if (!pairs.length) continue;

      const note = document.createElement("div");
      note.className = "ss-sent-note";
      sentNoteValues.set(note, key);
      const root = note.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = ":host{display:block;width:100%;margin:4px 0 0;text-align:right;font:12px/1.5 system-ui,sans-serif;color:#8a8f98}" +
        "button{all:unset;cursor:pointer}button:hover{text-decoration:underline}" +
        "ul{list-style:none;margin:2px 0 0;padding:0}ul[hidden]{display:none}li{color:#4a90e2;word-break:break-all}";
      const label = (open) => `🔒 ${pairs.length} value${pairs.length > 1 ? "s" : ""} protected · ${open ? "hide" : "show"}`;
      const btn = document.createElement("button");
      btn.textContent = label(false);
      btn.title = "Only on your screen. The AI received the placeholders shown in your message.";
      const list = document.createElement("ul");
      list.hidden = true;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Filled on first open, so the values aren't in the page until you ask for them
        if (!list.childElementCount) {
          for (const [p, v] of pairs) {
            const li = document.createElement("li");
            li.textContent = `${p} = ${v}`;
            list.appendChild(li);
          }
        }
        list.hidden = !list.hidden;
        btn.textContent = label(!list.hidden);
      });
      root.append(style, btn, list);
      bubble.after(note);
    }
  }

  /**
   * Performs an active hydration pass over all visible assistant message nodes.
   * If shield is disabled, reverts any existing local compute spans back to original expressions.
   * Resolves KaTeX math annotations, tables, code, and text containers.
   */
  function runHydrationPass() {
    if (!localCompute || !symbolicVault || typeof document === "undefined" || !document.body) return;
    const isEnabled = isPreInferenceEnabled();

    // Values that were replaced before sending stay readable on your screen even after protection
    // is switched off (the map only holds what was actually replaced)
    restoreIdsOnScreen();
    try { addSentNotes(); } catch (_) {} // a display extra: never let it stop the pass

    // If shield is disabled: un-hydrate all local compute spans so user sees raw symbols
    if (!isEnabled) {
      const hydratedSpans = document.querySelectorAll(".ss-local-compute:not(.ss-id-restored), [data-expr]:not(.ss-id-restored)");
      hydratedSpans.forEach(span => {
        const origExpr = span.getAttribute("data-expr");
        if (origExpr) {
          const txtNode = document.createTextNode(decodeURIComponent(origExpr));
          span.replaceWith(txtNode);
        }
      });
      document.querySelectorAll("[data-safeshare-hydrated]").forEach(el => {
        delete el.dataset.safeshareHydrated;
      });
      return;
    }

    if (symbolicVault.size() === 0) return;
    const vaultData = symbolicVault.getAll();
    if (!vaultData || Object.keys(vaultData).length === 0) return;

    // Helper: detect if active streaming is ongoing
    const isStreamingActive = Boolean(
      document.querySelector(
        "[data-testid='stop-button'], button[aria-label*='Stop'], [data-is-streaming='true'], .result-streaming, [aria-label*='Stop response']"
      )
    );

    const isSymbolicMathContent = (str) =>
      /<S\d+>|\\langle\s*s?\d+\s*\\rangle|⟨\s*s?\d+\s*⟩|&lt;s?\d+&gt;|<s\d+>|\b(?:VAL\d+|S\d+_[A-Za-z0-9_]+)\b|(?:\d+(?:\.\d+)?%?|[+\-*^×÷·(]|\\times|\\cdot|\\div|\b(?:Rp\.?|IDR|USD|EUR|GBP|\$)\s*`?|(?<!\/)\/(?!\/))\s*S\d+\b|\bS\d+\b\s*(?:[-+*^×÷·)]|\\times|\\cdot|\\div|(?<!\/)\/(?!\/))|<code>[^<]*\bS\d+\b[^<]*<\/code>/i.test(str);

    // PASS 1: Hydrate KaTeX LaTeX equations in-place across ChatGPT, Claude, and DeepSeek
    const katexNodes = document.querySelectorAll("span.katex, div.katex-display, div[class*='math']");
    katexNodes.forEach((kNode) => {
      if (kNode.dataset.safeshareHydrated === "true" && !isSymbolicMathContent(kNode.innerHTML)) return;
      if (isPromptInputOrUIElement(kNode)) return;

      const annot = kNode.querySelector ? (kNode.querySelector("annotation[encoding='application/x-tex']") || kNode.querySelector("annotation")) : null;
      let tex = annot ? annot.textContent : (kNode.getAttribute("data-tex") || "");
      if (!tex && isSymbolicMathContent(kNode.textContent || "")) {
        tex = kNode.textContent || "";
      }
      if (tex && isSymbolicMathContent(tex)) {
        // tex is decoded text (the AI controls it): escape it before it becomes HTML
        const res = localCompute.hydrateText(escapeHtml(tex), vaultData, true);
        if (res.computedCount > 0) {
          const wrapper = document.createElement("span");
          wrapper.className = "ss-katex-hydrated";
          wrapper.dataset.safeshareHydrated = "true";
          sanitizeAndMountHydration(wrapper, res.hydratedText);
          kNode.replaceWith(wrapper);
        }
      }
    });

    // PASS 2: Hydrate leaf text blocks (ONLY ASSISTANT MESSAGES)
    // STRICT RULE: Never query user message bubbles, prompt inputs, or code blocks (<pre>)
    // to prevent Virtual DOM collisions and self-hydration loops.
    const leafNodes = document.querySelectorAll(
      "[data-markdown-text-style='assistant-message'] p, [data-markdown-text-style='assistant-message'] li, [data-markdown-text-style='assistant-message'] td, [data-markdown-text-style='assistant-message'] th, [data-markdown-text-style='assistant-message'] div.math, " +
      "[data-message-author-role='assistant'] p, [data-message-author-role='assistant'] li, [data-message-author-role='assistant'] td, [data-message-author-role='assistant'] th, [data-message-author-role='assistant'] div.markdown > div, [data-message-author-role='assistant'] .math-inline, [data-message-author-role='assistant'] .math-display, " +
      ".font-claude-message p, .font-claude-message li, .font-claude-message td, .font-claude-message th, " +
      "div.ds-markdown p, div.ds-markdown li, div.ds-markdown td, div.ds-markdown th, " +
      ".chat-message-assistant p, .chat-message-assistant li, .chat-message-assistant td, .chat-message-assistant th, " +
      "div.markdown p, div.markdown li, div.markdown td, div.markdown th, div.markdown > div:not([class*='composer'])"
    );

    leafNodes.forEach((node) => {
      if (node.dataset.safeshareHydrated === "true" && !isSymbolicMathContent(node.innerHTML)) return;
      if (isPromptInputOrUIElement(node)) return;
      if (node.closest("pre, .ss-katex-hydrated, [data-message-author-role='user'], [data-testid='user-message']")) return;
      // Skip if leaf node contains an un-hydrated KaTeX span (Pass 1 handles KaTeX widgets)
      if (node.querySelector && node.querySelector("span.katex:not([data-safeshare-hydrated='true'])")) return;

      // Quiescence check: if node is within an active streaming block or table, defer until settled
      if (isStreamingActive) {
        const table = node.closest("table");
        if (table) {
          const assistantContainer = table.closest("[data-message-author-role='assistant'], .font-claude-message, div.ds-markdown, .chat-message-assistant");
          if (assistantContainer && assistantContainer.lastElementChild === table) return;
        }
        const block = node.closest("p, li, td, th") || node;
        const parentContainer = block.parentElement;
        if (parentContainer && parentContainer.lastElementChild === block) return;
      }

      // Check unbalanced parentheses (incomplete streaming expression)
      const rawText = node.innerText || node.textContent || "";
      const openParens = (rawText.match(/\(/g) || []).length;
      const closeParens = (rawText.match(/\)/g) || []).length;
      if (openParens !== closeParens) return;

      const text = flattenStreamSpans(node);
      if (isSymbolicMathContent(text)) {
        const res = localCompute.hydrateText(text, vaultData, true);
        if (res.computedCount > 0) {
          sanitizeAndMountHydration(node, res.hydratedText);
          node.dataset.safeshareHydrated = "true";
        }
      }
    });
  }

  /**
   * ChatGPT (2026) streams each chunk of an answer into its own <span data-d-stream-inline>, so a
   * formula like 0.25 * (<S1> + <S2>) is five separate spans and only the lone symbols would be
   * computed. Returns the node's HTML with those wrapper spans merged back into plain text.
   */
  function flattenStreamSpans(node) {
    if (!node.querySelector || !node.querySelector("span[data-d-stream-inline]")) return node.innerHTML;
    const copy = node.cloneNode(true);
    copy.querySelectorAll("span[data-d-stream-inline]").forEach((span) => span.replaceWith(...span.childNodes));
    copy.normalize();
    return copy.innerHTML;
  }

  /**
   * Hydrates formulas in AI responses with locally computed numbers in client RAM.
   * Uses debounced quiescence to avoid crashing React Fiber streaming loops.
   */
  let hydrationDebounceTimer = null;
  function initLocalHydrationObserver() {
    if (!localCompute || !symbolicVault) return;

    // Run hydration pass immediately on existing elements (e.g. after tab refresh or navigation)
    runHydrationPass();

    let wasStreaming = false;
    const observer = new MutationObserver(() => {
      if (extensionGone()) return observer.disconnect();
      const isStreamingNow = Boolean(document.querySelector("[data-testid='stop-button'], button[aria-label*='Stop'], [data-is-streaming='true'], .result-streaming, [aria-label*='Stop response']"));
      if (wasStreaming && !isStreamingNow) {
        // Active generation ended! Run an immediate sweep to catch trailing paragraphs/tables
        setTimeout(() => runHydrationPass(), 120);
      }
      wasStreaming = isStreamingNow;

      if (hydrationDebounceTimer) clearTimeout(hydrationDebounceTimer);
      hydrationDebounceTimer = setTimeout(() => {
        runHydrationPass();
      }, 350);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Safely extracts an element's text content while reverting any ephemeral local hydration badges
   * back to their raw symbolic form before exporting or sharing.
   * INVARIANT: Client-side decrypted RAM secrets MUST NEVER cross into the share payload!
   */
  function getCleanNodeContent(containerEl) {
    if (!containerEl) return "";
    // If no local compute badges exist, read layout text directly from the attached DOM node (fast & accurate)
    if (!containerEl.querySelector(".ss-local-compute, .ss-katex-hydrated, [data-expr], .ss-sent-note, .katex, table, h1, h2, h3, pre")) {
      return (containerEl.innerText || containerEl.textContent || "").trim();
    }
    try {
      // Clone container to avoid mutating the user's active reading view
      const clone = containerEl.cloneNode(true);
      // Find all hydrated local compute spans in the clone
      clone.querySelectorAll(".ss-sent-note").forEach(n => n.remove()); // "🔒 2 values protected" is ours, not the chat
      const hydratedSpans = clone.querySelectorAll(".ss-local-compute, .ss-katex-hydrated, [data-expr]");
      hydratedSpans.forEach(span => {
        const origExpr = span.getAttribute("data-expr");
        if (origExpr) {
          // Revert to original symbolic expression e.g. <S10>, <S1> / <S2>
          const textNode = document.createTextNode(decodeURIComponent(origExpr));
          span.replaceWith(textNode);
        }
      });
      const cleanText = SafeShareTranscript.extract(clone);
      return cleanText.trim() || (containerEl.innerText || containerEl.textContent || "").trim();
    } catch (_) {
      return (containerEl.innerText || containerEl.textContent || "").trim();
    }
  }

  /**
   * Identifies whether an element is inside the prompt composer, textarea, UI header/footer, or disclaimer.
   * Such elements must NEVER be extracted as chat conversation turns.
   */
  /**
   * Not part of the conversation: the composer (input box / form), SafeShare's own UI,
   * invisible nodes and the "can make mistakes" disclaimer. Used when READING the chat for
   * sharing: user and assistant messages must both pass.
   */
  function isComposerOrSafeShareUI(el) {
    if (!el) return true;
    if (!isVisibleElement(el)) return true;
    if (el.closest("form, #prompt-textarea, fieldset, textarea, [contenteditable='true'], #safeshare-modal-backdrop, #safeshare-shield-bar, #safeshare-shield-menu, #safeshare-action-pill")) {
      return true;
    }
    const txt = (el.innerText || el.textContent || "").trim();
    if (/^(?:ChatGPT can make mistakes|Free Research Preview|By messaging ChatGPT|Claude may make mistakes|DeepSeek can make mistakes)/i.test(txt)) {
      return true;
    }
    return false;
  }

  const USER_BUBBLE_SELECTOR = "[data-message-author-role='user'], [data-testid='user-message'], .chat-message-user, [data-user-message-bubble='true']";

  /**
   * Composer/UI OR a user message bubble. Used by the on-screen number display, which must never
   * rewrite the user's own messages (React re-renders them; see PASS 2 above). Do NOT use this to
   * read the chat for sharing: it would drop every user turn.
   */
  function isPromptInputOrUIElement(el) {
    return isComposerOrSafeShareUI(el) || Boolean(el.closest(USER_BUBBLE_SELECTOR));
  }

  /**
   * Scopes search to the active conversation container hosting the visible prompt composer.
   * Prevents querying background/unmounted chat session panes in React/Next.js SPAs.
   */
  function getActiveConversationRoot() {
    const inputEl = findPromptInputElement();
    if (inputEl) {
      const main = inputEl.closest("main, [role='main']");
      if (main && isVisibleElement(main)) return main;
      const form = inputEl.closest("form");
      if (form && form.parentElement) {
        const parentMain = form.parentElement.closest("main, [role='main']");
        if (parentMain && isVisibleElement(parentMain)) return parentMain;
        return form.parentElement;
      }
    }
    const mains = Array.from(document.querySelectorAll("main, [role='main']")).filter(isVisibleElement);
    if (mains.length > 0) return mains[mains.length - 1];
    return document.body;
  }

  /**
   * Universal extractor for ChatGPT, Claude, and DeepSeek conversation nodes.
   * Returns empty array [] if the active chat has no messages sent yet.
   */
  function extractConversationTurns() {
    return tidyTurns(extractRawTurns());
  }

  /**
   * Cleans extracted turns before sharing:
   *  - removes the send-time shield's "[PRIVACY PROTOCOL: ...]" instruction (meant for the model,
   *    not part of the conversation)
   *  - drops a turn that repeats the previous one (nested elements matching the same message)
   */
  function tidyTurns(turns) {
    const out = [];
    for (const t of turns) {
      const content = t.content.replace(/\s*\[(?:PRIVACY PROTOCOL|PROTOKOL PRIVASI):[^\]]*\]\s*/g, "\n").trim();
      if (!content) continue;
      const prev = out[out.length - 1];
      if (prev && prev.role === t.role && prev.content === content) continue;
      out.push({ role: t.role, content });
    }
    return out;
  }

  function extractRawTurns() {
    const root = getActiveConversationRoot();
    let turns = extractTurnsFromContainer(root);
    if (turns.length === 0 && root !== document.body) {
      // Fallback: search document.body for visible turns only
      turns = extractTurnsFromContainer(document.body);
    }
    return turns;
  }

  function extractTurnsFromContainer(container) {
    if (!container) return [];
    const turns = [];

    // Strategy A (ChatGPT, 2026 layout): user bubbles and assistant markdown carry readable
    // data attributes; class names are hashed and change between releases.
    const bubbles = Array.from(container.querySelectorAll(
      "[data-user-message-bubble='true'], [data-markdown-text-style='assistant-message']"
    )).filter(el => !isComposerOrSafeShareUI(el));
    // Do not select a partial strategy when a mixed layout still has legacy-role messages.
    const uncoveredRole = [...container.querySelectorAll("[data-message-author-role]")].some(el =>
      !isComposerOrSafeShareUI(el) && !el.matches("[data-user-message-bubble='true'], [data-markdown-text-style='assistant-message']") &&
      !el.querySelector("[data-user-message-bubble='true'], [data-markdown-text-style='assistant-message']"));
    if (bubbles.length > 0 && !uncoveredRole) {
      // A reply can be split over several markdown blocks: join blocks of the same turn
      let lastKey = null;
      for (const el of bubbles) {
        const role = el.matches("[data-user-message-bubble='true']") ? "user" : "assistant";
        const unit = el.closest("[data-chatgpt-search-unit-key], [data-chatgpt-selection-message-id]");
        const key = unit ? (unit.getAttribute("data-chatgpt-search-unit-key") || unit.getAttribute("data-chatgpt-selection-message-id")) : el;
        const content = getCleanNodeContent(el);
        if (!content) continue;
        const prev = turns[turns.length - 1];
        if (prev && prev.role === role && key === lastKey) prev.content += "\n\n" + content;
        else turns.push({ role, content });
        lastKey = key;
      }
      if (turns.length > 0) return turns;
    }

    // Strategy 0: High-accuracy ChatGPT data-message-author-role pattern
    const roleDivs = container.querySelectorAll("[data-message-author-role]");
    // Outermost only: a message element can contain another element with the same attribute
    const validRoleDivs = Array.from(roleDivs).filter(el =>
      !isComposerOrSafeShareUI(el) && !(el.parentElement && el.parentElement.closest("[data-message-author-role]")));
    if (validRoleDivs.length > 0) {
      validRoleDivs.forEach((el) => {
        const role = el.getAttribute("data-message-author-role");
        const content = getCleanNodeContent(el);
        if (content) {
          turns.push({ role, content });
        }
      });
      if (turns.length > 0) return turns;
    }

    // Strategy 1: ChatGPT conversation-turn pattern (both article and div tags)
    const chatGptTurns = container.querySelectorAll("[data-testid^='conversation-turn']");
    const validTurns = Array.from(chatGptTurns).filter(el => !isComposerOrSafeShareUI(el));
    if (validTurns.length > 0) {
      validTurns.forEach((turnEl) => {
        const isAssistant = turnEl.querySelector("[data-message-author-role='assistant'], div.markdown, [data-testid*='assistant']") !== null;
        // Prefer content subnode if present
        const contentNode = turnEl.querySelector("[data-message-author-role], div.markdown, div.whitespace-pre-wrap") || turnEl;
        const textContent = getCleanNodeContent(contentNode);
        if (textContent) {
          turns.push({
            role: isAssistant ? "assistant" : "user",
            content: textContent
          });
        }
      });
      if (turns.length > 0) return turns;
    }

    // Strategy 2: Claude DOM Pattern
    const claudeUserNodes = container.querySelectorAll("[data-testid='user-message'], div[class*='user-message']");
    const claudeAsstNodes = container.querySelectorAll(".font-claude-message, div[class*='standard-message'], div[class*='font-claude']");
    if (claudeUserNodes.length > 0 || claudeAsstNodes.length > 0) {
      const allClaude = container.querySelectorAll("[data-testid='user-message'], div[class*='user-message'], .font-claude-message, div[class*='standard-message'], div[class*='font-claude']");
      Array.from(allClaude).filter(el => !isComposerOrSafeShareUI(el)).forEach((el) => {
        const isUser = el.getAttribute("data-testid") === "user-message" || (el.className && el.className.includes("user-message"));
        const textContent = getCleanNodeContent(el);
        if (textContent) {
          turns.push({
            role: isUser ? "user" : "assistant",
            content: textContent
          });
        }
      });
      if (turns.length > 0) return turns;
    }

    // Strategy 2b: DeepSeek (Oct 2026 layout). Every turn is a div.ds-message; answers contain
    // .ds-assistant-message-main-content (DeepThink's reasoning block sits outside it), your
    // messages don't, and keep their text in .ds-collapsible-text. Only stable ds-* class names.
    const dsMessages = Array.from(container.querySelectorAll("div.ds-message")).filter(el => !isComposerOrSafeShareUI(el));
    if (dsMessages.length > 0) {
      for (const el of dsMessages) {
        const answer = el.querySelector(".ds-assistant-message-main-content") || el.querySelector("div.ds-markdown");
        const source = answer || el.querySelector(".ds-collapsible-text") || el;
        const textContent = getCleanNodeContent(source);
        if (textContent) turns.push({ role: answer ? "assistant" : "user", content: textContent });
      }
      if (turns.some(t => t.role === "user") && turns.some(t => t.role === "assistant")) return turns;
      turns.length = 0; // partial read: let the older strategies try
    }

    // Strategy 3: DeepSeek & generic markdown message turns
    const deepseekNodes = container.querySelectorAll("div.ds-markdown, div[class*='ds-markdown'], .chat-message, div[class*='message-bubble']");
    const validDeepseek = Array.from(deepseekNodes).filter(el => !isComposerOrSafeShareUI(el));
    if (validDeepseek.length > 0) {
      validDeepseek.forEach((el) => {
        const isAsst = /assistant|ai|bot|markdown/i.test(el.className) || el.querySelector("[class*='assistant'], [class*='bot']") !== null;
        const textContent = getCleanNodeContent(el);
        if (textContent) {
          turns.push({
            role: isAsst ? "assistant" : "user",
            content: textContent
          });
        }
      });
      if (turns.length > 0) return turns;
    }

    // Chat is empty (no messages have been sent yet)
    return [];
  }

  let lastRecordedUrl = (typeof location !== "undefined" ? location.href : "");
  function handleSessionRouteChange() {
    if (typeof location === "undefined" || location.href === lastRecordedUrl) return;
    const oldUrl = lastRecordedUrl;
    lastRecordedUrl = location.href;

    const getChatId = (u) => {
      const m = (u || "").match(/(?:\/c\/|\/chat\/|\/a\/chat\/s\/)([a-zA-Z0-9_-]+)/);
      return m ? m[1] : null;
    };

    const oldId = getChatId(oldUrl);
    const newId = getChatId(location.href);

    // If transitioning from root/new chat to the newly created session for the same prompt, KEEP VAULT!
    const isNewChatToSession = !oldId && !!newId;
    const isSameChat = oldId && newId && oldId === newId;

    if (isNewChatToSession && newId) {
      // Migrate secrets from "new" session to the newly assigned conversation ID
      if (symbolicVault) symbolicVault.saveToSession(newId);
      idMapKey = `safeshare_idmap_${newId}`;
      saveIdMap();
    } else if (!isSameChat) {
      // Truly different chat session: close modal and load secrets for this session (or clear)
      const existing = document.getElementById("safeshare-modal-backdrop");
      if (existing) existing.remove();

      loadIdMap(newId);
      restoreDiagnosed.clear();

      if (symbolicVault) {
        if (newId) {
          symbolicVault.loadFromSession(newId);
        } else {
          symbolicVault.clear();
        }
      }
    }

    // Re-sync input and shield indicator for new session
    const inputEl = findPromptInputElement();
    if (inputEl) updateShieldIndicator(inputEl);
  }

  window.addEventListener("popstate", handleSessionRouteChange);

  // Periodic check to inject button & prompt shield once UI is loaded and track SPA navigation
  // After the extension is reloaded or updated, the copy already running in open tabs is orphaned
  // and every extension call throws "Extension context invalidated": stop its timers then.
  const runtimeId = () => extApi && extApi.runtime && extApi.runtime.id;
  const startedInExtension = Boolean(runtimeId()); // test pages run without one: keep going there
  const extensionGone = () => startedInExtension && !runtimeId();
  const mainTimer = setInterval(() => {
    if (extensionGone()) {
      clearInterval(mainTimer);
      // Sends are still protected (the guard needs no extension calls), but values are no longer
      // shown on screen and shares can't be made: say so instead of failing quietly
      const indicator = document.getElementById("safeshare-shield-indicator");
      if (indicator) {
        indicator.textContent = "⚠️ SafeShare was updated: refresh this tab";
        indicator.className = "shield-disabled";
        indicator.dataset.errorUntil = String(Number.MAX_SAFE_INTEGER);
      }
      return;
    }
    handleSessionRouteChange();
    initSafeShareButton();
    initPreInferenceInterception();
    runHydrationPass();
  }, 500);

  // Initialize inbound streaming local hydration observer
  initLocalHydrationObserver();

  /**
   * Site health check. The chat sites change their page structure without notice (ChatGPT did in
   * Oct 2026), and SafeShare then silently stops reading messages. Every 10 s on an open chat:
   * can we find the chat box, your messages, the AI's answers? Two failed checks in a row (so a
   * reply that is still streaming doesn't count) show a warning on the chip; the status is saved
   * per site in extension storage (safeshare_health_<host>) for diagnosis. Counts only, no text.
   */
  let healthFailures = 0;
  let lastHealthKey = "";
  function checkSiteHealth() {
    if (!chatIdOf(location.href) || document.hidden) return;
    let turns = [];
    try { turns = extractRawTurns(); } catch (_) {}
    const users = turns.filter(t => t.role === "user").length;
    const answers = turns.filter(t => t.role === "assistant").length;
    const problems = [];
    if (!findPromptInputElement()) problems.push("chat box not found");
    if (!users) problems.push("your messages not found");
    if (!answers) problems.push("AI answers not found");
    if (answers && !document.querySelectorAll(MESSAGE_SELECTOR).length) problems.push("answers not found for on-screen values");
    healthFailures = problems.length ? healthFailures + 1 : 0;
    const ok = healthFailures < 2;
    const status = { site: location.hostname, ok, problems: ok ? [] : problems, users, answers, version: loadedVersion, at: Date.now() };
    const key = JSON.stringify([status.ok, status.problems]);
    if (key !== lastHealthKey && extApi && extApi.storage && extApi.storage.local) {
      lastHealthKey = key;
      Promise.resolve(extApi.storage.local.set({ [`safeshare_health_${location.hostname}`]: status })).catch(() => {});
      if (!ok) console.warn("[SafeShare-AI] Site health check failed:", problems.join(", "));
    }
    const indicator = document.getElementById("safeshare-shield-indicator");
    if (!ok && indicator) {
      indicator.textContent = `⚠️ SafeShare can't fully read this page (${problems.join(", ")}). The site may have changed; shares may be incomplete ▾`;
      indicator.dataset.errorUntil = String(Date.now() + 11000);
    }
  }
  const healthTimer = setInterval(() => (extensionGone() ? clearInterval(healthTimer) : checkSiteHealth()), 10000);

  // Listen to modal toggle events
  window.addEventListener("safeshare:shield_toggle", (e) => {
    const inputEl = findPromptInputElement();
    if (inputEl) updateShieldIndicator(inputEl);
    runHydrationPass();
  });

  // Share viewer origins (official relay, local relay); keep in sync with the manifest matches
  const VIEWER_ORIGINS = /^(?:https:\/\/safeshare-relay\.bleedguard\.workers\.dev|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/;

  // Extension bridge listener: responds to Web Viewer continuation requests
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.source === "SAFESHARE_EXTENSION_PING") {
      const respOrigin = (window && window.location && window.location.origin) ? window.location.origin : "*";
      window.postMessage({ source: "SAFESHARE_EXTENSION_PONG" }, respOrigin);
    } else if (event.data.source === "SAFESHARE_FORWARD_TO_AI") {
      // Only the share viewer may hand over a continuation prompt; any other page that posts this
      // (including the chat sites' own scripts) is ignored.
      if (!VIEWER_ORIGINS.test(location.origin)) return;
      const promptText = event.data.prompt;
      if (!promptText) return;
      const inputEl = findPromptInputElement();
      if (inputEl) {
        setInputText(inputEl, promptText);
        console.log("[SafeShare-AI] Injected continuation prompt directly into active session.");
      } else {
        // On a share page there is no chat box: open the chat site and paste it there
        const api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
        if (api && api.runtime) api.runtime.sendMessage({ action: "OPEN_CHAT_WITH_PROMPT", platform: event.data.platform, prompt: promptText });
      }
    }
  });

  // Paste a continuation prompt left by the background worker (see OPEN_CHAT_WITH_PROMPT)
  (function deliverPendingContinuation() {
    const api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
    if (!api || !api.storage || !api.storage.local) return;
    const hostFor = { ChatGPT: /chatgpt\.com|chat\.openai\.com/, Claude: /claude\.ai/, DeepSeek: /chat\.deepseek\.com/ };
    Promise.resolve(api.storage.local.get("safeshare_pending_continuation")).then((res) => {
      const pending = res && res.safeshare_pending_continuation;
      if (!pending || Date.now() - pending.at > 2 * 60 * 1000) return; // stale after 2 minutes
      if (!hostFor[pending.platform] || !hostFor[pending.platform].test(location.hostname)) return;
      api.storage.local.remove("safeshare_pending_continuation");

      const applyPrompt = (inputEl) => {
        setInputText(inputEl, pending.prompt);
        console.log("[SafeShare-AI] Pasted continuation prompt into the new chat.");
      };

      // Immediate check at t=0
      const immediateInput = findPromptInputElement();
      if (immediateInput) {
        applyPrompt(immediateInput);
        return;
      }

      // Fast-polling (40ms) so text is injected the instant the composer mounts
      let tries = 0;
      const timer = setInterval(() => {
        const inputEl = findPromptInputElement();
        if (inputEl) {
          clearInterval(timer);
          applyPrompt(inputEl);
        } else if (++tries > 100) { // ~4s max
          clearInterval(timer);
        }
      }, 40);
    });
  })();
})();
