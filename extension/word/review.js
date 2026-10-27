let mediaCache = null;
let imageState = [];
let showAllFindings = false;
let wordPrefs = { reader: "public", numbers: "remove", categories: null };
let attackLeaks = 0;
let documentCurrency = null;
const PAGE_SIZE = 12;

function collectFindings(doc) {
  const seen = new Map();
  const consider = (text) => {
    if (!text) return;
    for (const detection of scanner.scan(text).detections) {
      const value = (detection.secretToken || detection.raw || "").trim();
      if (!value || value.length < 3 || seen.has(value.toLowerCase())) continue;
      const tag = /\[REDACTED_[A-Z0-9_]+\]|\[REDACTED\]/.exec(detection.replacement || "");
      seen.set(value.toLowerCase(), {
        value, category: detection.category || "GENERAL", ruleName: detection.name || "Sensitive value",
        replacement: tag ? tag[0] : "[REDACTED]", source: "rule", preChecked: true
      });
    }
  };
  for (const block of doc.blocks) {
    if (block.rows) for (const row of block.rows) for (const cell of row) consider(cell);
    else consider(block.text);
  }
  for (const part of doc.supplementary) consider(part.text);
  return [...seen.values()];
}

function categoriesOf(findings) {
  return [...new Set(findings.map(f => f.category))].sort();
}

function findingRows(doc) {
  if (providedFindings) {
    if (!mediaCache || mediaCache.doc !== doc) {
      mediaCache = { doc, findings: providedFindings };
      imageState = (doc.media || []).map(entry => ({ name: entry.name, mode: null, rects: [] }));
    }
    return mediaCache.findings;
  }
  if (!mediaCache || mediaCache.doc !== doc) {
    mediaCache = { doc, findings: collectFindings(doc) };
    imageState = (doc.media || []).map(entry => ({ name: entry.name, mode: null, rects: [] }));
  }
  return mediaCache.findings;
}

function setHeader(title, subtitle) {
  $("review-title").textContent = title;
  $("review-subtitle").textContent = subtitle;
}

function updateCounts() {
  const rows = [...document.querySelectorAll(".finding")].filter(row => row.dataset.categoryHidden !== "1");
  const total = rows.length;
  const masked = rows.filter(row => row.querySelector(".finding-toggle").checked).length;
  const host = $("review-counts");
  host.replaceChildren();
  const label = document.createElement("span");
  label.className = "count-main";
  label.textContent = `${masked} of ${total} items masked`;
  const protectedChip = document.createElement("span");
  protectedChip.className = "count-chip";
  protectedChip.textContent = `${masked} protected`;
  const openChip = document.createElement("span");
  openChip.className = "count-chip open";
  openChip.textContent = `${total - masked} unmasked`;
  host.append(label, protectedChip, openChip);
  setHeader(titleForState(masked, total), subtitleForState(masked, total));
}

function titleForState() {
  return sanitizedBytes ? "Sanitized copy ready" : "Create sanitized copy";
}

function subtitleForState(masked, total) {
  if (sanitizedBytes) return `Layout kept - ${masked} of ${total} items masked. Nothing is uploaded.`;
  return "Reviewed locally. Nothing is uploaded until you create a link.";
}

function statusText(checked) {
  return checked ? "Redacted" : "Visible";
}

function resetCompare() {
  $("compare-toggle").checked = true;
  $("compare").classList.remove("single");
}

function syncCompareScroll() {
  const panes = [...document.querySelectorAll(".compare-pane")];
  if (panes.length < 2) return;
  let locked = false;
  for (const pane of panes) {
    pane.addEventListener("scroll", () => {
      if (locked) return;
      locked = true;
      const ratio = pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight);
      for (const other of panes) if (other !== pane) other.scrollTop = ratio * Math.max(1, other.scrollHeight - other.clientHeight);
      requestAnimationFrame(() => { locked = false; });
    });
  }
}

function renderFindings(doc) {
  const findings = findingRows(doc);
  const host = $("findings");
  host.replaceChildren();
  const chips = $("category-chips");
  chips.replaceChildren();
  for (const category of categoriesOf(findings)) {
    const label = document.createElement("label");
    label.className = "chip";
    const box = document.createElement("input");
    box.type = "checkbox"; box.checked = true; box.dataset.category = category;
    const text = document.createElement("span");
    text.textContent = `${category.toLowerCase()} (${findings.filter(f => f.category === category).length})`;
    label.append(box, text);
    chips.append(label);
  }
  findings.forEach((finding, index) => {
    const row = document.createElement("div");
    row.className = "finding";
    row.dataset.category = finding.category;
    const box = document.createElement("input");
    const keepForReader = wordPrefs.reader === "trusted" && (finding.category === "PROFILE" || finding.category === "FINANCIAL");
    box.type = "checkbox"; box.checked = keepForReader ? false : finding.preChecked !== false;
    box.className = "finding-toggle";
    box.id = `finding-${index}`;
    const text = document.createElement("span");
    text.className = "finding-text";
    const value = document.createElement("strong");
    value.textContent = finding.value;
    const meta = document.createElement("small");
    if (finding.aliasOf) finding.ruleName = `${finding.ruleName} (alias of ${finding.aliasOf})`;
    meta.textContent = `${finding.ruleName || finding.name || "Finding"} - ${finding.replacement} - ${finding.source || "rule"}`;
    row.dataset.replacement = finding.replacement || "[REDACTED]";
    row.dataset.source = finding.source || "rule";
    text.append(value, document.createElement("br"), meta);
    const state = document.createElement("button");
    state.type = "button"; state.className = "finding-state";
    state.textContent = statusText(box.checked);
    state.addEventListener("click", () => {
      box.checked = !box.checked;
      state.textContent = statusText(box.checked);
      updateCounts();
    });
    const locate = document.createElement("button");
    locate.type = "button"; locate.className = "finding-locate"; locate.textContent = "Show in preview";
    locate.addEventListener("click", () => showInPreview(finding.value));
    const label = document.createElement("label");
    label.className = "finding-check";
    label.append(box);
    row.append(label, text, state, locate);
    row.dataset.pageHidden = index >= PAGE_SIZE ? "1" : "0";
    if (row.dataset.pageHidden === "1" && !showAllFindings) row.hidden = true;
    host.append(row);
  });
  const more = $("show-more");
  if (findings.length > PAGE_SIZE) {
    more.hidden = false;
    more.textContent = showAllFindings ? "Show fewer" : `Show ${findings.length - PAGE_SIZE} more`;
  } else more.hidden = true;

  renderImages(doc);
  $("capture-section").hidden = true;
  $("read-again").hidden = false;
  document.body.classList.add("reviewing");
  documentCurrency = detectDocumentCurrency();
  resetCompare();
  $("review-section").hidden = false;
  $("review-summary").textContent = findings.length ? "" : "Nothing detected automatically.";
  updateCounts();
  $("apply-status").textContent = "";
}

function showInPreview(value) {
  const host = $("document-preview");
  const needle = String(value).toLowerCase();
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const at = node.nodeValue.toLowerCase().indexOf(needle);
    if (at < 0) continue;
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + String(value).length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const target = node.parentElement;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("preview-hit");
    setTimeout(() => target.classList.remove("preview-hit"), 2200);
    return;
  }
  $("apply-status").textContent = "Not visible in the text preview (it may be inside an image).";
}

function addManualCandidate(text) {
  const value = String(text).replace(/\s+/g, " ").trim();
  if (value.length < 3) return;
  if (!providedFindings) providedFindings = findingRows(lastDoc).slice();
  if (providedFindings.some(item => item.value.toLowerCase() === value.toLowerCase())) {
    $("apply-status").textContent = "That value is already in the list.";
    return;
  }
  providedFindings.push({
    value, category: "CUSTOM", categoryLabel: "Added by you", ruleName: "Manual selection",
    reason: "selected in preview", replacement: $("placeholder-style").value, source: "manual", preChecked: true
  });
  mediaCache = null;
  renderFindings(lastDoc);
  $("apply-status").textContent = `Added "${value}" to the redaction list.`;
}

$("document-preview").addEventListener("mouseup", () => {
  const selection = window.getSelection();
  const text = selection ? selection.toString() : "";
  $("redact-selection").hidden = text.trim().length < 3;
});
$("redact-selection").addEventListener("click", () => {
  const selection = window.getSelection();
  const text = selection ? selection.toString() : "";
  if (text.trim().length >= 3) addManualCandidate(text);
  $("redact-selection").hidden = true;
});

function renderImages(doc) {
  const host = $("image-list");
  host.replaceChildren();
  const media = doc.media || [];
  $("image-block").hidden = media.length === 0;
  media.forEach((entry, index) => {
    const state = imageState[index];
    const card = document.createElement("div");
    card.className = "image-card";
    const canvas = document.createElement("canvas");
    canvas.width = 260; canvas.height = 150;
    canvas.className = "image-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Image ${index + 1} of the document`);
    const label = document.createElement("p");
    label.className = "image-status";
    const draw = () => {
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      const image = entry.bitmap;
      if (!image) return;
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
      const width = image.width * scale, height = image.height * scale;
      const left = (canvas.width - width) / 2, top = (canvas.height - height) / 2;
      context.drawImage(image, left, top, width, height);
      canvas.dataset.scale = String(scale);
      canvas.dataset.left = String(left);
      canvas.dataset.top = String(top);
      context.strokeStyle = "#d7e6b4"; context.lineWidth = 2;
      for (const [x, y, w, h] of state.rects) context.strokeRect(left + x * scale, top + y * scale, w * scale, h * scale);
      if (state.mode === "whole") { context.fillStyle = "#000"; context.fillRect(left, top, width, height); }
      label.textContent = state.mode === "whole" ? "Whole image will be replaced with black."
        : state.rects.length ? `${state.rects.length} area(s) will be blacked out on the full-resolution image.`
          : "Not redacted. Text inside this image is still visible.";
    };
    draw();
    const actions = document.createElement("div");
    actions.className = "image-actions";
    for (const [text, handler] of [
      ["Redact whole", () => { state.mode = "whole"; state.rects = []; draw(); }],
      ["Clear areas", () => { state.mode = null; state.rects = []; draw(); }],
      ["Keep", () => { state.mode = null; state.rects = []; draw(); }]
    ]) {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = text;
      button.addEventListener("click", handler);
      actions.append(button);
    }
    card.append(canvas, label, actions);
    host.append(card);
    bindDrag(canvas, state, draw);
  });
}

function bindDrag(canvas, state, draw) {
  let start = null;
  const toImage = event => {
    const rect = canvas.getBoundingClientRect();
    const scale = Number(canvas.dataset.scale), left = Number(canvas.dataset.left), top = Number(canvas.dataset.top);
    return { x: (event.clientX - rect.left - left) / scale, y: (event.clientY - rect.top - top) / scale };
  };
  canvas.addEventListener("pointerdown", event => {
    if (state.mode === "whole") return;
    start = toImage(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", event => {
    if (!start) return;
    const end = toImage(event);
    const x = Math.max(0, Math.min(start.x, end.x)), y = Math.max(0, Math.min(start.y, end.y));
    const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
    start = null;
    if (w < 8 || h < 8) return;
    state.rects.push([x, y, w, h]);
    state.mode = "areas";
    draw();
  });
}

function categoryFilter() {
  const allowed = new Set([...document.querySelectorAll("#category-chips input:checked")].map(box => box.dataset.category));
  for (const row of document.querySelectorAll(".finding")) {
    row.dataset.categoryHidden = allowed.has(row.dataset.category) ? "0" : "1";
    const pageHidden = row.dataset.pageHidden === "1" && !showAllFindings;
    row.hidden = row.dataset.categoryHidden === "1" || pageHidden;
  }
  updateCounts();
}

function applyPagination() {
  for (const row of document.querySelectorAll(".finding")) {
    const pageHidden = row.dataset.pageHidden === "1" && !showAllFindings;
    row.hidden = row.dataset.categoryHidden === "1" || pageHidden;
  }
}

function detectDocumentCurrency() {
  const text = (lastDoc?.blocks || []).map(block => block.rows ? block.rows.flat().join(" ") : block.text).join(" ");
  if (/\bIDR\b|Rp\.?\s?\d/i.test(text)) return "IDR";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  if (/\u20AC|\bEUR\b/i.test(text)) return "EUR";
  if (/\u00A3|\bGBP\b/i.test(text)) return "GBP";
  return null;
}

function activeRules() {
  const rules = [];
  for (const box of document.querySelectorAll(".finding-toggle")) {
    if (!box.checked) continue;
    const row = box.closest(".finding");
    if (row.dataset.categoryHidden === "1") continue;
    const value = row.querySelector("strong").textContent;
    let replacement = row.dataset.replacement || "[REDACTED]";
    if (wordPrefs.numbers === "range" && row.dataset.source === "amount" && typeof SafeShareWordPolicy !== "undefined") {
      replacement = SafeShareWordPolicy.rangeFor(value, documentCurrency) || replacement;
    }
    rules.push({ value, replacement });
  }
  const placeholder = $("placeholder-style").value;
  for (const value of $("manual").value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    rules.push({ value, replacement: placeholder });
  }
  return rules;
}

function activeImages() {
  return imageState.filter(state => state.mode)
    .map(state => ({ name: state.name, mode: state.mode, rects: state.mode === "areas" ? state.rects : [] }))
    .filter(state => state.mode === "whole" || state.rects.length);
}

$("rescan").addEventListener("click", async () => {
  if (!lastDoc || typeof SafeShareNer === "undefined") return;
  $("apply-status").textContent = "Re-scanning names?";
  const map = SafeShareTextMap.flatten(lastDoc);
  const extra = await SafeShareWordDetect.nerCandidates(map, SafeShareNer);
  const known = new Set((providedFindings || []).map(item => item.value.toLowerCase()));
  let added = 0;
  for (const item of extra) {
    if (known.has(item.value.toLowerCase())) continue;
    providedFindings.push({ ...item, categoryLabel: "Contact & profile" });
    known.add(item.value.toLowerCase());
    added++;
  }
  renderFindings(lastDoc);
  $("apply-status").textContent = added ? `Model found ${added} more name(s).` : "Model found no additional names.";
});

$("select-all").addEventListener("click", () => {
  for (const box of document.querySelectorAll(".finding-toggle")) if (!box.closest(".finding").hidden) box.checked = true;
  for (const button of document.querySelectorAll(".finding-state")) button.textContent = "Redacted";
  updateCounts();
});
$("select-none").addEventListener("click", () => {
  for (const box of document.querySelectorAll(".finding-toggle")) box.checked = false;
  for (const button of document.querySelectorAll(".finding-state")) button.textContent = "Visible";
  updateCounts();
});
$("category-chips").addEventListener("change", categoryFilter);
$("reader").addEventListener("change", async () => {
  wordPrefs.reader = $("reader").value;
  await SafeShareWordSettings.save({ reader: wordPrefs.reader });
  renderFindings(lastDoc);
});
$("numbers").addEventListener("change", async () => {
  wordPrefs.numbers = $("numbers").value;
  await SafeShareWordSettings.save({ numbers: wordPrefs.numbers });
  $("apply-status").textContent = wordPrefs.numbers === "range"
    ? "Amounts you stated become approximate ranges; derived figures stay removed."
    : "";
});
$("reset-defaults").addEventListener("click", async () => {
  await SafeShareWordSettings.reset();
  wordPrefs = { ...SafeShareWordSettings.DEFAULTS };
  $("reader").value = wordPrefs.reader;
  $("numbers").value = wordPrefs.numbers;
  $("terms").value = "";
  $("manual").value = "";
  for (const box of document.querySelectorAll("#category-chips input")) box.checked = true;
  renderFindings(lastDoc);
  $("apply-status").textContent = "Defaults restored: public reader, amounts removed, all categories.";
});
$("cancel-review").addEventListener("click", async () => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  try { const tab = await api.tabs.getCurrent(); if (tab && tab.id != null) await api.tabs.remove(tab.id); else window.close(); }
  catch (_) { window.close(); }
});
$("findings").addEventListener("change", updateCounts);
$("show-more").addEventListener("click", () => { showAllFindings = !showAllFindings; applyPagination(); renderFindings(lastDoc); });
$("compare-toggle").addEventListener("change", () => {
  const compare = $("compare");
  compare.classList.toggle("single", !$("compare-toggle").checked);
});

$("apply").addEventListener("click", async () => {
  if (!sourceBytes) return;
  if (wordPrefs.reader === "trusted" && !window.confirm("Reader is set to \"Someone I trust\": names and amounts will stay visible in this copy. Continue?")) return;
  $("apply").disabled = true; $("error").hidden = true; $("verify").hidden = true;
  $("apply-status").textContent = "Rewriting the document package…";
  try {
    const rules = activeRules();
    const images = activeImages();
    if (!rules.length && !images.length) throw new Error("Select a finding, add private text, or redact an image.");
    const result = await SafeShareWordRedact.sanitizeDocx(sourceBytes.buffer.slice(0), {
      rules, images,
      removeRevisions: $("keep-revisions").checked === false,
      removeHidden: true,
      removeMetadata: $("keep-metadata").checked === false
    });
    const check = await SafeShareWordRedact.verifyDocx(result.bytes, rules);
    if (!check.clean) {
      const parts = [...new Set(check.leftovers.map(item => item.part))].join(", ");
      throw new Error("Verification failed; original text remains in: " + parts);
    }
    sanitizedBytes = result.bytes;
    $("verify").hidden = false;
    $("verify").textContent = `Verified: ${result.replaced} text replacements across ${result.parts} parts, ${result.images} image(s) redacted, ${result.removed} revision/hidden elements removed. No selected value remains in any XML part.`;
    const preview = await inspectWordFile(result.bytes);
    const compare = $("compare");
    compare.replaceChildren();
    const before = document.createElement("div"), after = document.createElement("div");
    before.className = after.className = "compare-pane";
    before.innerHTML = "<h3>Original (sender only)</h3>";
    after.innerHTML = "<h3>Sanitized</h3>";
    const plain = block => block.rows ? block.rows.map(row => row.join(" | ")).join("\n") : block.text;
    for (const block of preview.blocks) {
      const p = document.createElement("p"); p.textContent = plain(block); after.append(p);
    }
    for (const block of lastDoc.blocks) {
      const p = document.createElement("p"); p.textContent = plain(block); before.append(p);
    }
    compare.append(before, after);
    syncCompareScroll();
    compare.hidden = false;
    compare.classList.toggle("single", !$("compare-toggle").checked);
    await runAttackCheck(preview, rules);
    $("download-sanitized").hidden = false;
    $("create-link").disabled = false;
    $("apply-status").textContent = "Sanitized DOCX ready. Tables, styles and equations come from the original package.";
    updateCounts();
  } catch (e) {
    $("apply-status").textContent = "Sanitization stopped. Nothing was downloaded.";
    $("error").textContent = e.message; $("error").hidden = false;
  } finally { $("apply").disabled = false; }
});

async function runAttackCheck(preview, rules) {
  const box = $("attack");
  box.hidden = false;
  attackLeaks = 0;
  try {
    const text = preview.blocks.map(block => block.rows ? block.rows.map(r => r.join(" ")).join("\n") : block.text).join("\n");
    const visibleNumbers = [...new Set((text.match(/\d[\d.,]*/g) || [])
      .map(raw => SafeShareWordPolicy.valueOf(raw))
      .filter(value => Number.isFinite(value) && value >= 10))];
    const hiddenNumbers = rules
      .map(rule => SafeShareWordPolicy.valueOf(rule.value))
      .filter(value => Number.isFinite(value) && value >= 10);
    const ratios = [0.2, 0.25, 0.3, 0.5, 1.2, 1.25, 1.5, 2, 3, 4, 12, 1 / 12, 52, 1 / 52];
    const recoverable = new Set();
    for (const hidden of hiddenNumbers) {
      for (const visible of visibleNumbers) {
        if (Math.abs(visible - hidden) / hidden <= 0.015) continue;
        if (ratios.some(ratio => Math.abs(visible * ratio - hidden) / hidden <= 0.015)) recoverable.add(hidden);
      }
    }
    let textBased = 0;
    if (typeof SafeSharePolicy !== "undefined") {
      try {
        textBased = (SafeSharePolicy.invert(text) || [])
          .filter(finding => hiddenNumbers.some(value => Math.abs(finding.value - value) / value <= 0.015))
          .filter(finding => !visibleNumbers.some(value => Math.abs(value - finding.value) <= 1)).length;
      } catch (_) {}
    }
    attackLeaks = Math.max(recoverable.size, textBased);
    if (!attackLeaks) {
      $("attack-text").textContent = "No hidden amount can be recovered from the remaining visible numbers.";
      $("attack-confirm-wrap").hidden = true;
      $("download-sanitized").disabled = false;
      return;
    }
    $("attack-text").textContent = `${attackLeaks} hidden amount(s) can still be recomputed from the numbers left in this copy. Redact those numbers or accept the risk.`;
    $("attack-confirm-wrap").hidden = false;
    $("attack-confirm").checked = false;
    $("download-sanitized").disabled = true;
  } catch (_) {
    $("attack-text").textContent = "Attack check could not run on this document.";
  }
}

$("attack-confirm").addEventListener("change", () => {
  $("download-sanitized").disabled = attackLeaks > 0 && !$("attack-confirm").checked;
});

$("download-sanitized").addEventListener("click", () => {
  if (!sanitizedBytes) return;
  if (attackLeaks > 0 && !$("attack-confirm").checked) return;
  const url = URL.createObjectURL(new Blob([sanitizedBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a");
  a.href = url; a.download = "sanitized-document.docx"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});


SafeShareWordSettings.load().then(prefs => {
  wordPrefs = prefs;
  $("reader").value = prefs.reader;
  $("numbers").value = prefs.numbers;
  if (Array.isArray(prefs.categories)) {
    for (const box of document.querySelectorAll("#category-chips input")) {
      box.checked = prefs.categories.includes(box.dataset.category);
    }
  }
}).catch(() => {});

$("read-again").addEventListener("click", () => { if (window.__ssReadAgain) window.__ssReadAgain(); });
