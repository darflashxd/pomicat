let mediaCache = null;
let imageState = [];
let showAllFindings = false;
let wordPrefs = { reader: "public", numbers: "remove", categories: null };
let attackLeaks = 0;
let documentCurrency = null;
let appliedSignature = null;
const PAGE_SIZE = 24;

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function categoriesOf(findings) {
  return [...new Set(findings.map(f => f.category))].sort();
}

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

function matchedFindings() {
  return [...document.querySelectorAll(".finding")]
    .filter(row => row.dataset.categoryHidden !== "1")
    .map(row => ({
      value: row.querySelector("strong").textContent,
      replacement: row.dataset.replacement || "[REDACTED]",
      checked: row.querySelector(".finding-toggle").checked,
      category: row.dataset.category,
      source: row.dataset.source
    }));
}

function spanText(text, findings) {
  const spans = [];
  for (const finding of findings) {
    const needle = finding.value;
    if (!needle || needle.length < 2) continue;
    const boundary = /^[\p{L}\p{N}_]/u.test(needle) ? "(?<![\\p{L}\\p{N}_])" : "";
    const tail = /[\p{L}\p{N}_]$/u.test(needle) ? "(?![\\p{L}\\p{N}_])" : "";
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let pattern;
    try { pattern = new RegExp(boundary + escaped + tail, "giu"); } catch (_) { continue; }
    for (const match of text.matchAll(pattern)) {
      spans.push({ start: match.index, end: match.index + match[0].length, finding });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && span.start < last.end) continue;
    out.push(span);
  }
  return out;
}

function replacementFor(finding, value) {
  let replacement = finding.replacement || "[REDACTED]";
  if (wordPrefs.numbers === "range" && finding.source === "amount" && typeof SafeShareWordPolicy !== "undefined") {
    replacement = SafeShareWordPolicy.rangeFor(value, documentCurrency) || replacement;
  }
  return replacement;
}

function manualFindings() {
  const placeholder = $("placeholder-style").value || "[REDACTED]";
  return $("manual").value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(value => ({
    value, replacement: placeholder, checked: true, category: "CUSTOM", source: "manual"
  }));
}

function renderTextHtml(text, findings, sanitized) {
  const spans = spanText(text, findings);
  let html = "", cursor = 0;
  for (const span of spans) {
    html += escapeHtml(text.slice(cursor, span.start));
    const value = text.slice(span.start, span.end);
    if (sanitized) {
      html += span.finding.checked ? `<mark>${escapeHtml(replacementFor(span.finding, value))}</mark>` : escapeHtml(value);
    } else {
      html += `<mark class="${span.finding.checked ? "" : "keep"}">${escapeHtml(value)}</mark>`;
    }
    cursor = span.end;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function renderPreview(doc) {
  if (!doc) return;
  const findings = matchedFindings().concat(manualFindings());
  const source = $("document-preview"), sanitized = $("sanitized-preview");
  const keepScroll = [source.scrollTop, sanitized.scrollTop];
  source.replaceChildren();
  sanitized.replaceChildren();
  for (const block of doc.blocks) {
    if (block.rows) {
      for (const [label, target] of [["source", source], ["sanitized", sanitized]]) {
        const table = document.createElement("table");
        for (const row of block.rows) {
          const tr = document.createElement("tr");
          for (const cell of row) {
            const td = document.createElement("td");
            td.innerHTML = renderTextHtml(String(cell ?? ""), findings, label === "sanitized");
            tr.append(td);
          }
          table.append(tr);
        }
        target.append(table);
      }
    } else if (block.text) {
      for (const [label, target] of [["source", source], ["sanitized", sanitized]]) {
        const p = document.createElement("p");
        p.innerHTML = renderTextHtml(block.text, findings, label === "sanitized");
        target.append(p);
      }
    }
  }
  for (const part of doc.supplementary || []) {
    if (!part.text) continue;
    for (const [target, isSanitized] of [[source, false], [sanitized, true]]) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = part.name;
      const p = document.createElement("p");
      p.innerHTML = renderTextHtml(part.text, findings, isSanitized);
      details.append(summary, p);
      target.append(details);
    }
  }
  source.scrollTop = keepScroll[0];
  sanitized.scrollTop = keepScroll[1];
}

function setHeader(title, subtitle) {
  $("review-title").textContent = title;
  $("review-subtitle").textContent = subtitle;
}

function updateCounts() {
  if (sanitizedBytes && appliedSignature && currentSignature() !== appliedSignature) {
    sanitizedBytes = null;
    appliedSignature = null;
    $("create-link").disabled = true;
    $("download-sanitized").hidden = true;
    $("verify").hidden = true;
    $("share-panel").hidden = true;
    $("apply").hidden = false;
    $("apply-status").textContent = "Settings changed. Create the copy again to refresh the link.";
    $("publish-hint").textContent = "Settings changed. Create the sanitized DOCX again to refresh the copy.";
  }
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
  const title = sanitizedBytes ? "Sanitized copy ready" : "Create sanitized copy";
  const subtitle = sanitizedBytes
    ? `Layout kept - ${masked} of ${total} items masked. Nothing is uploaded.`
    : "Reviewed locally. Nothing is uploaded until you create a link.";
  setHeader(title, subtitle);
  renderPreview(lastDoc);
  updateLowerLabel();
}

function updateLowerLabel() {
  const media = lastDoc?.media || [];
  const unmarked = imageState.filter(state => !state.mode).length;
  const nav = $("nav-images");
  if (nav) {
    nav.textContent = media.length ? `${media.length}${unmarked ? ` · ${unmarked} unmarked` : ""}` : "0";
    nav.classList.toggle("warn", unmarked > 0);
    nav.title = media.length ? (unmarked ? `${unmarked} image(s) not marked` : "All images marked") : "No images";
  }
  const linked = typeof PublishState !== "undefined" && PublishState.last;
  const meta = $("share-meta");
  if (meta) meta.textContent = linked ? "Link live" : sanitizedBytes ? "Ready" : "Not created";
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
    row.dataset.replacement = finding.replacement || "[REDACTED]";
    row.dataset.source = finding.source || "rule";
    const keepForReader = wordPrefs.reader === "trusted" && (finding.category === "PROFILE" || finding.category === "FINANCIAL");
    const box = document.createElement("input");
    box.type = "checkbox"; box.checked = keepForReader ? false : finding.preChecked !== false;
    box.className = "finding-toggle";
    box.id = `finding-${index}`;
    const label = document.createElement("label");
    label.className = "finding-check";
    label.append(box);
    const text = document.createElement("span");
    text.className = "finding-text";
    const value = document.createElement("strong");
    value.textContent = finding.value;
    const meta = document.createElement("small");
    const score = Number.isFinite(finding.score)
      ? `Model score ${Math.round(finding.score * 100)}%`
      : (finding.source === "manual" ? "Added by you" : "Rule-based");
    meta.textContent = `${finding.ruleName || finding.name || "Finding"} · ${score}`;
    text.append(value, document.createElement("br"), meta);
    const state = document.createElement("button");
    state.type = "button"; state.className = "finding-state";
    state.textContent = box.checked ? "Redacted" : "Visible";
    state.addEventListener("click", () => {
      box.checked = !box.checked;
      state.textContent = box.checked ? "Redacted" : "Visible";
      updateCounts();
    });
    const locate = document.createElement("button");
    locate.type = "button"; locate.className = "finding-locate"; locate.textContent = "Show in preview";
    locate.addEventListener("click", () => showInPreview(finding.value));
    const actions = document.createElement("div");
    actions.className = "finding-actions";
    actions.append(state, locate);
    row.append(label, text, actions);
    row.dataset.pageHidden = index >= PAGE_SIZE ? "1" : "0";
    if (row.dataset.pageHidden === "1" && !showAllFindings) row.hidden = true;
    host.append(row);
  });
  const more = $("show-more");
  if (findings.length > PAGE_SIZE) {
    more.hidden = false;
    more.textContent = showAllFindings ? "Show fewer" : `Show ${findings.length - PAGE_SIZE} more`;
  } else more.hidden = true;
  $("findings-meta").textContent = findings.length ? `${findings.length} item${findings.length === 1 ? "" : "s"}` : "None";
  const navCount = $("nav-findings");
  if (navCount) navCount.textContent = String(findings.length);

  renderImages(doc);
  if (!sanitizedBytes) {
    $("apply").hidden = false;
    $("share-panel").hidden = true;
    $("create-link").disabled = true;
    $("download-sanitized").hidden = true;
    $("verify").hidden = true;
  }
  $("capture-section").hidden = true;
  $("read-again").hidden = false;
  const firstRender = !document.body.classList.contains("reviewing");
  document.body.classList.add("reviewing");
  if (firstRender) window.scrollTo(0, 0);
  documentCurrency = detectDocumentCurrency();
  $("review-section").hidden = false;
  $("review-summary").textContent = findings.length ? "" : "Nothing detected automatically.";
  $("apply-status").textContent = "";
  updateCounts();
}

function rerenderKeepingChoices() {
  const toggles = new Map([...document.querySelectorAll(".finding")].map(row => [row.querySelector("strong").textContent, row.querySelector(".finding-toggle").checked]));
  const chips = new Map([...document.querySelectorAll("#category-chips input")].map(box => [box.dataset.category, box.checked]));
  renderFindings(lastDoc);
  for (const row of document.querySelectorAll(".finding")) {
    const box = row.querySelector(".finding-toggle");
    const value = row.querySelector("strong").textContent;
    if (toggles.has(value)) box.checked = toggles.get(value);
    const chip = chips.get(row.dataset.category);
    row.dataset.categoryHidden = chip === false ? "1" : "0";
    row.hidden = row.dataset.categoryHidden === "1" || (row.dataset.pageHidden === "1" && !showAllFindings);
  }
  for (const box of document.querySelectorAll("#category-chips input")) {
    if (chips.has(box.dataset.category)) box.checked = chips.get(box.dataset.category);
  }
  for (const button of document.querySelectorAll(".finding-state")) {
    button.textContent = button.closest(".finding").querySelector(".finding-toggle").checked ? "Redacted" : "Visible";
  }
  updateCounts();
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
    target.classList.add("hit");
    setTimeout(() => target.classList.remove("hit"), 2200);
    return;
  }
  $("apply-status").textContent = "Not visible in the text preview (it may be inside an image).";
}

function detectDocumentCurrency() {
  const text = (lastDoc?.blocks || []).map(block => block.rows ? block.rows.flat().join(" ") : block.text).join(" ");
  if (/\bIDR\b|Rp\.?\s?\d/i.test(text)) return "IDR";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  if (/\u20AC|\bEUR\b/i.test(text)) return "EUR";
  if (/\u00A3|\bGBP\b/i.test(text)) return "GBP";
  return null;
}

function addManualCandidate(text) {
  const value = String(text).replace(/\s+/g, " ").trim();
  if (value.length < 3) return false;
  if (!providedFindings) providedFindings = findingRows(lastDoc).slice();
  if (providedFindings.some(item => item.value.toLowerCase() === value.toLowerCase())) {
    $("apply-status").textContent = "That value is already in the list.";
    return false;
  }
  providedFindings.push({
    value, category: "CUSTOM", categoryLabel: "Added by you", ruleName: "Manual selection",
    reason: "selected in preview", replacement: $("placeholder-style").value, source: "manual", preChecked: true
  });
  mediaCache = null;
  rerenderKeepingChoices();
  $("apply-status").textContent = `Added "${value}" to the redaction list.`;
  return true;
}

let selectionTimer = null;
let selectionStatusTimer = null;

function selectionContext() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const text = selection.toString().trim();
  if (text.length < 3) return null;
  const node = selection.anchorNode;
  const element = node ? (node.nodeType === 3 ? node.parentElement : node) : null;
  const pane = element && element.closest ? element.closest("#document-preview, #sanitized-preview") : null;
  if (!pane) return null;
  return { text, pane: pane.id, rect: selection.getRangeAt(0).getBoundingClientRect() };
}

function hideSelectionButton() {
  const button = $("redact-selection");
  if (button) button.hidden = true;
}

function setSelectionStatus(message, warn) {
  const status = $("selection-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("warn", Boolean(warn));
  clearTimeout(selectionStatusTimer);
  if (message) selectionStatusTimer = setTimeout(() => { status.textContent = ""; status.classList.remove("warn"); }, 4500);
}

function updateSelectionButton() {
  const info = selectionContext();
  const button = $("redact-selection");
  if (!info) { hideSelectionButton(); return; }
  const short = info.text.replace(/\s+/g, " ");
  button.textContent = `Redact "${short.length > 38 ? short.slice(0, 35) + "…" : short}"`;
  button.dataset.selection = info.text;
  button.dataset.pane = info.pane;
  button.hidden = false;
  const width = Math.min(340, window.innerWidth - 20);
  const left = Math.max(10, Math.min(window.innerWidth - width - 10, info.rect.left));
  const top = info.rect.bottom + 54 > window.innerHeight ? Math.max(10, info.rect.top - 50) : info.rect.bottom + 8;
  button.style.left = `${left}px`;
  button.style.top = `${top}px`;
  button.style.maxWidth = `${width}px`;
}

for (const id of ["document-preview", "sanitized-preview"]) {
  const pane = $(id);
  pane.addEventListener("mouseup", () => setTimeout(updateSelectionButton, 0));
  pane.addEventListener("keyup", () => setTimeout(updateSelectionButton, 0));
}
document.addEventListener("selectionchange", () => {
  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => { if (selectionContext()) updateSelectionButton(); }, 180);
});
window.addEventListener("scroll", hideSelectionButton, true);
$("redact-selection").addEventListener("pointerdown", event => event.preventDefault());
$("redact-selection").addEventListener("click", () => {
  const button = $("redact-selection");
  const raw = button.dataset.selection || "";
  const pane = button.dataset.pane || "";
  let text = raw;
  if (pane === "sanitized-preview") {
    text = text.replace(/\[REDACTED_[A-Z0-9_]*\]|\[REDACTED\]/gi, "\n");
    if (!text.replace(/\s+/g, "").length) {
      setSelectionStatus("That part is already redacted.", true);
      hideSelectionButton();
      return;
    }
  }
  const parts = text.split(/\r?\n+/).map(line => line.replace(/\s+/g, " ").trim()).filter(line => line.length >= 3);
  let added = 0;
  for (const part of parts) if (addManualCandidate(part)) added++;
  hideSelectionButton();
  if (added) {
    setSelectionStatus(added === 1 ? `Added "${parts[0]}" to findings.` : `Added ${added} phrases to findings.`);
    window.getSelection()?.removeAllRanges();
  } else if (!parts.length) {
    setSelectionStatus("Select at least three visible characters.", true);
  } else {
    setSelectionStatus("That text is already in the findings.", true);
  }
});

/* ---------- images ---------- */
function renderImages(doc) {
  const host = $("image-list");
  host.replaceChildren();
  const media = doc.media || [];
  $("image-block").hidden = media.length === 0;
  $("image-empty").hidden = media.length > 0;
  $("images-meta").textContent = media.length ? `${media.length} image${media.length === 1 ? "" : "s"}` : "None";
  updateLowerLabel();
  media.forEach((entry, index) => {
    const state = imageState[index];
    const card = document.createElement("div");
    card.className = "image-card";
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 360;
    canvas.className = "image-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Image ${index + 1}`);
    const label = document.createElement("p");
    label.className = "image-status";
    const draw = () => {
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!entry.bitmap) return;
      const scale = Math.min(canvas.width / entry.bitmap.width, canvas.height / entry.bitmap.height);
      const width = entry.bitmap.width * scale, height = entry.bitmap.height * scale;
      const left = (canvas.width - width) / 2, top = (canvas.height - height) / 2;
      context.drawImage(entry.bitmap, left, top, width, height);
      canvas.dataset.scale = String(scale);
      canvas.dataset.left = String(left);
      canvas.dataset.top = String(top);
      if (state.mode === "whole") { context.fillStyle = "#000"; context.fillRect(left, top, width, height); }
      else {
        context.fillStyle = "#000";
        for (const [x, y, w, h] of state.rects) {
          context.fillRect(left + x * scale, top + y * scale, w * scale, h * scale);
        }
      }
      label.textContent = state.mode === "whole" ? "Whole image will be replaced with black."
        : state.rects.length ? `${state.rects.length} area(s) marked.`
          : "Not redacted. Text inside this image is still visible.";
    };
    draw();
    const actions = document.createElement("div");
    actions.className = "image-actions";
    const open = document.createElement("button");
    open.type = "button"; open.textContent = "Open large";
    open.addEventListener("click", () => openImageDialog(index));
    const keep = document.createElement("button");
    keep.type = "button"; keep.textContent = "Keep";
    keep.addEventListener("click", () => { state.mode = null; state.rects = []; draw(); renderDialogState(); if (sanitizedBytes) updateCounts(); });
    const whole = document.createElement("button");
    whole.type = "button"; whole.textContent = "Redact whole";
    whole.addEventListener("click", () => { state.mode = "whole"; state.rects = []; draw(); renderDialogState(); if (sanitizedBytes) updateCounts(); });
    actions.append(open, whole, keep);
    card.append(canvas, label, actions);
    host.append(card);
  });
}

let dialogIndex = -1;
const dialog = () => $("image-dialog");
const dialogCanvas = () => $("dialog-canvas");

function renderDialogState() {
  const state = imageState[dialogIndex];
  const canvas = dialogCanvas();
  const entry = (lastDoc?.media || [])[dialogIndex];
  if (!state || !entry) return;
  const context = canvas.getContext("2d");
  const maxW = Math.min(1100, window.innerWidth * 0.86);
  const maxH = window.innerHeight * 0.66;
  const scale = Math.min(maxW / entry.bitmap.width, maxH / entry.bitmap.height, 2);
  canvas.width = Math.round(entry.bitmap.width * scale);
  canvas.height = Math.round(entry.bitmap.height * scale);
  canvas.dataset.scale = String(scale);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(entry.bitmap, 0, 0, canvas.width, canvas.height);
  if (state.mode === "whole") { context.fillStyle = "#000"; context.fillRect(0, 0, canvas.width, canvas.height); }
  context.strokeStyle = "#cfe3a8"; context.lineWidth = 2;
  for (const [x, y, w, h] of state.rects) context.strokeRect(x * scale, y * scale, w * scale, h * scale);
  if (state.pending) {
    const [x, y, w, h] = state.pending;
    context.fillStyle = "#cfe3a833";
    context.fillRect(x * scale, y * scale, w * scale, h * scale);
    context.strokeStyle = "#ffd9d4";
    context.strokeRect(x * scale, y * scale, w * scale, h * scale);
  }
  const count = $("dialog-count");
  if (state.mode === "whole") count.textContent = "Whole image will be replaced.";
  else if (state.pending) {
    const [, , pendingW, pendingH] = state.pending;
    count.textContent = `Area ${Math.round(pendingW)} x ${Math.round(pendingH)} px - release to keep it.`;
  } else count.textContent = `${state.rects.length} area(s) marked on this image.`;
}

function openImageDialog(index) {
  dialogIndex = index;
  const state = imageState[index];
  state.pending = null;
  const entry = (lastDoc?.media || [])[index];
  $("dialog-title").textContent = `Review image ${index + 1} (${entry?.bitmap ? entry.bitmap.width + "×" + entry.bitmap.height : "unknown"})`;
  renderDialogState();
  dialog().showModal();
}

(function bindDialog() {
  const canvas = dialogCanvas();
  let start = null;
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    const scale = Number(canvas.dataset.scale) || 1;
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };
  canvas.addEventListener("pointerdown", event => {
    if (imageState[dialogIndex]?.mode === "whole") return;
    start = point(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (!start) return;
    const current = point(event);
    imageState[dialogIndex].pending = [
      Math.max(0, Math.min(start.x, current.x)),
      Math.max(0, Math.min(start.y, current.y)),
      Math.abs(current.x - start.x),
      Math.abs(current.y - start.y)
    ];
    renderDialogState();
  });
  canvas.addEventListener("pointerup", event => {
    if (!start) return;
    const origin = start;
    start = null;
    const current = point(event);
    const state = imageState[dialogIndex];
    state.pending = null;
    const x = Math.max(0, Math.min(origin.x, current.x));
    const y = Math.max(0, Math.min(origin.y, current.y));
    const entry = lastDoc?.media?.[dialogIndex];
    const maxW = entry?.bitmap?.width || canvas.width;
    const maxH = entry?.bitmap?.height || canvas.height;
    const w = Math.min(Math.abs(current.x - origin.x), maxW - x);
    const h = Math.min(Math.abs(current.y - origin.y), maxH - y);
    if (w < 6 || h < 6) { renderDialogState(); return; }
    state.rects.push([x, y, w, h]);
    state.mode = "areas";
    renderDialogState();
    renderImages(lastDoc);
    if (sanitizedBytes) updateCounts();
  });
  $("dialog-whole").addEventListener("click", () => {
    const state = imageState[dialogIndex];
    state.mode = "whole"; state.rects = [];
    renderDialogState(); renderImages(lastDoc);
    if (sanitizedBytes) updateCounts();
  });
  $("dialog-clear").addEventListener("click", () => {
    const state = imageState[dialogIndex];
    state.mode = null; state.rects = [];
    renderDialogState(); renderImages(lastDoc);
    if (sanitizedBytes) updateCounts();
  });
  $("dialog-done").addEventListener("click", () => dialog().close());
  $("dialog-close").addEventListener("click", () => dialog().close());
})();

/* ---------- rules ---------- */
function activeRules() {
  const rules = [];
  for (const row of document.querySelectorAll(".finding")) {
    if (row.dataset.categoryHidden === "1") continue;
    const box = row.querySelector(".finding-toggle");
    if (!box.checked) continue;
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

function currentSignature() {
  return JSON.stringify({
    rules: activeRules(), images: activeImages(),
    revisions: $("keep-revisions").checked, metadata: $("keep-metadata").checked
  });
}

$("rescan").addEventListener("click", async () => {
  if (!lastDoc || typeof SafeShareNer === "undefined") return;
  $("apply-status").textContent = "Re-scanning names…";
  if (!providedFindings) providedFindings = findingRows(lastDoc).slice();
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
  rerenderKeepingChoices();
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
$("category-chips").addEventListener("change", () => {
  const allowed = new Set([...document.querySelectorAll("#category-chips input:checked")].map(box => box.dataset.category));
  for (const row of document.querySelectorAll(".finding")) {
    row.dataset.categoryHidden = allowed.has(row.dataset.category) ? "0" : "1";
    row.hidden = row.dataset.categoryHidden === "1" || (row.dataset.pageHidden === "1" && !showAllFindings);
  }
  updateCounts();
});
$("show-more").addEventListener("click", () => {
  showAllFindings = !showAllFindings;
  rerenderKeepingChoices();
});
$("show-original").addEventListener("change", () => {
  document.body.classList.toggle("hide-original", !$("show-original").checked);
});
let previewTimer = null;
$("manual").addEventListener("input", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { if (lastDoc && !$("review-section").hidden) updateCounts(); }, 200);
});
$("placeholder-style").addEventListener("change", () => { if (lastDoc) updateCounts(); });
for (const id of ["keep-revisions", "keep-metadata"]) $(id).addEventListener("change", updateCounts);
$("reader").addEventListener("change", async () => {
  wordPrefs.reader = $("reader").value;
  await SafeShareWordSettings.save({ reader: wordPrefs.reader });
  renderFindings(lastDoc);
});
$("numbers").addEventListener("change", async () => {
  wordPrefs.numbers = $("numbers").value;
  await SafeShareWordSettings.save({ numbers: wordPrefs.numbers });
  updateCounts();
});
$("reset-defaults").addEventListener("click", async () => {
  await SafeShareWordSettings.reset();
  wordPrefs = { ...SafeShareWordSettings.DEFAULTS };
  $("reader").value = wordPrefs.reader;
  $("numbers").value = wordPrefs.numbers;
  $("manual").value = "";
  for (const box of document.querySelectorAll("#category-chips input")) box.checked = true;
  renderFindings(lastDoc);
  $("apply-status").textContent = "Defaults restored.";
});
$("cancel-review").addEventListener("click", async () => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  try { const tab = await api.tabs.getCurrent(); if (tab && tab.id != null) await api.tabs.remove(tab.id); else window.close(); }
  catch (_) { window.close(); }
});

/* ---------- apply ---------- */
async function runAttackCheck(rules) {
  const box = $("attack");
  box.hidden = false;
  attackLeaks = 0;
  const text = [...document.querySelectorAll("#sanitized-preview p, #sanitized-preview td")].map(node => node.textContent).join("\n");
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
  attackLeaks = recoverable.size;
  if (!attackLeaks) {
    $("attack-text").textContent = "No hidden amount can be recovered from the remaining visible numbers.";
    $("attack-confirm-wrap").hidden = true;
    $("download-sanitized").disabled = false;
    return;
  }
  $("verify-details").open = true;
  $("attack-text").textContent = `${attackLeaks} hidden amount(s) can still be recomputed from the numbers left in this copy. Redact those numbers or accept the risk.`;
  $("attack-confirm-wrap").hidden = false;
  $("attack-confirm").checked = false;
  $("download-sanitized").disabled = true;
}

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
    appliedSignature = currentSignature();
    $("verify").hidden = false;
    $("verify").textContent = `Verified: ${result.replaced} text replacements across ${result.parts} parts, ${result.images} image(s) redacted, ${result.removed} revision/hidden elements removed.`;
    await runAttackCheck(rules);
    $("download-sanitized").hidden = false;
    $("create-link").disabled = false;
    $("share-panel").hidden = false;
    $("apply").hidden = true;
    $("apply-status").textContent = "";
    $("publish-hint").textContent = "Sanitized copy is current. The link is encrypted locally; the relay only receives ciphertext.";
    updateCounts();
  } catch (e) {
    $("apply-status").textContent = "Sanitization stopped. Nothing was downloaded.";
    $("error").textContent = e.message; $("error").hidden = false;
  } finally { $("apply").disabled = false; }
});

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

$("read-again").addEventListener("click", () => { if (window.__ssReadAgain) window.__ssReadAgain(); });
window.__ssLowerLabel = updateLowerLabel;
document.querySelector(".section-nav").addEventListener("click", event => {
  const button = event.target.closest("button[data-target]");
  if (!button) return;
  const target = document.getElementById(button.dataset.target);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});

SafeShareWordSettings.load().then(prefs => {
  wordPrefs = prefs;
  $("reader").value = prefs.reader;
  $("numbers").value = prefs.numbers;
}).catch(() => {});
