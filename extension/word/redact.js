/* OOXML redaction: rewrite text inside the original package so tables, styles and
   equations survive. Runs in an extension page (DOMParser + Web streams available). */
(function (root) {
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();
  const TEXT_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/;
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  function crc32(bytes) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function deflate(bytes) {
    if (typeof CompressionStream === "undefined") return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0 || view.getUint16(end + 4,true) || view.getUint16(end + 6,true)) throw new Error("Unsupported DOCX archive.");
  const count = view.getUint16(end + 10,true);
  let offset = view.getUint32(end + 16,true), total = 0;
  if (count > 1000 || offset + view.getUint32(end + 12,true) !== end) throw new Error("DOCX archive limit exceeded.");
  const parts = new Map();
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset,true) !== 0x02014b50) throw new Error("Invalid DOCX directory.");
    const flags = view.getUint16(offset + 8,true), method = view.getUint16(offset + 10,true);
    const packed = view.getUint32(offset + 20,true), size = view.getUint32(offset + 24,true);
    const nameSize = view.getUint16(offset + 28,true), local = view.getUint32(offset + 42,true);
    const next = offset + 46 + nameSize + view.getUint16(offset+30,true) + view.getUint16(offset+32,true);
    if (next > end) throw new Error("Invalid DOCX entry.");
    const name = decoder.decode(bytes.subarray(offset+46,offset+46+nameSize));
    if (parts.has(name) || /(^\/|\.\.|\\)/.test(name) || flags & 1 || ![0,8].includes(method) || size > 8*1024*1024 || total+size > 24*1024*1024) throw new Error("Unsupported or oversized DOCX part.");
    if (local+30 > end || view.getUint32(local,true) !== 0x04034b50 || view.getUint16(local+8,true)!==method || view.getUint16(local+6,true)!==flags) throw new Error("Invalid DOCX local header.");
    const start = local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if (start+packed > view.getUint32(end+16,true)) throw new Error("Invalid DOCX part bounds.");
    const localName = decoder.decode(bytes.subarray(local+30,local+30+view.getUint16(local+26,true)));
    if (localName!==name) throw new Error("Mismatched DOCX entry.");
    const compressed = bytes.slice(start,start+packed);
    const stream = method===8 ? new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw")) : new Blob([compressed]).stream();
    const reader = stream.getReader(), chunks = []; let length=0;
    try {
      while (true) {
        const chunk=await reader.read(); if(chunk.done)break;
        length+=chunk.value.length;
        if(length>size || length>8*1024*1024 || total+length>24*1024*1024)throw new Error("DOCX decompression limit exceeded.");
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); }
    if(length!==size)throw new Error("DOCX part size mismatch.");
    total+=length;
    const data=new Uint8Array(length);let cursor=0;for(const chunk of chunks){data.set(chunk,cursor);cursor+=chunk.length;}
    if (crc32(data) !== view.getUint32(offset + 16, true)) throw new Error("DOCX checksum mismatch.");
    parts.set(name,data);offset=next;
  }
  if(offset!==end || !parts.has("word/document.xml"))throw new Error("Missing DOCX document.");
  return parts;
  }

  function dosTime(date) {
    return {
      time: ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff,
      date: (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff,
    };
  }

  async function zip(parts) {
    const chunks = [], central = [], stamp = dosTime(new Date(2026, 0, 1, 0, 0, 0));
    let offset = 0;
    for (const [name, data] of parts) {
      const nameBytes = encoder.encode(name);
      const packed = (await deflate(data)) || data;
      const method = packed === data ? 0 : 8;
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true);
      lv.setUint16(8, method, true); lv.setUint16(10, stamp.time, true); lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, packed.length, true); lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      chunks.push(local, packed);
      const entry = new Uint8Array(46 + nameBytes.length);
      const ev = new DataView(entry.buffer);
      ev.setUint32(0, 0x02014b50, true); ev.setUint16(4, 20, true); ev.setUint16(6, 20, true);
      ev.setUint16(8, 0, true); ev.setUint16(10, method, true);
      ev.setUint16(12, stamp.time, true); ev.setUint16(14, stamp.date, true);
      ev.setUint32(16, crc, true); ev.setUint32(20, packed.length, true); ev.setUint32(24, data.length, true);
      ev.setUint16(28, nameBytes.length, true); ev.setUint32(42, offset, true);
      entry.set(nameBytes, 46);
      central.push(entry);
      offset += local.length + packed.length;
    }
    const directory = central.reduce((sum, entry) => sum + entry.length, 0);
    const endRecord = new Uint8Array(22);
    const ev = new DataView(endRecord.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true);
    ev.setUint32(12, directory, true); ev.setUint32(16, offset, true);
    const total = chunks.reduce((sum, c) => sum + c.length, 0) + directory + 22;
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of [...chunks, ...central, endRecord]) { out.set(chunk, at); at += chunk.length; }
    return out;
  }

  const tag = (text, tagName) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(new RegExp(`<${tagName}(\\s[^>]*)?/>`, "g"), `<${tagName}$1></${tagName}>`);

  function escapePattern(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function spansFor(text, rules) {
    const spans = [];
    for (const rule of rules) {
      if (!rule.value) continue;
      const boundary = /^[\p{L}\p{N}_]/u.test(rule.value) ? "(?<![\\p{L}\\p{N}_])" : "";
      const tail = /[\p{L}\p{N}_]$/u.test(rule.value) ? "(?![\\p{L}\\p{N}_])" : "";
      const pattern = new RegExp(boundary + escapePattern(rule.value) + tail, "giu");
      for (const match of text.matchAll(pattern)) {
        if ((rule.excludeValues || []).some(value => [...text.matchAll(new RegExp(escapePattern(value), "giu"))]
          .some(outer => match.index >= outer.index && match.index + match[0].length <= outer.index + outer[0].length))) continue;
        spans.push({ start: match.index, end: match.index + match[0].length, replacement: rule.replacement || "[REDACTED]", finding: rule });
      }
    }
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (last && span.start < last.end) {
        if (span.end > last.end) {
          last.end = span.end;
          last.replacement = "[REDACTED]";
          last.finding = null;
        }
        continue;
      }
      merged.push({ ...span });
    }
    return merged;
  }

  function replaceInParagraph(paragraph, rules) {
    const MATH = "http://schemas.openxmlformats.org/officeDocument/2006/math";
    const isMath = node => node.namespaceURI === MATH;
    const isText = node => (node.namespaceURI === W || node.namespaceURI === MATH) && node.localName === "t";
    // Word keeps a line break as <w:br/> inside the paragraph. Joining only <w:t> glued the last
    // word of a line to the first word of the next one, so a selected value that ended a line
    // failed the word-boundary check, stayed in the copy, and verifyDocx blocked the export.
    const isBreak = node => node.namespaceURI === W && ["br", "cr", "tab", "ptab"].includes(node.localName);
    const ordered = [];
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (isText(node) || isBreak(node)) ordered.push(node);
    }
    if (!ordered.some(isText)) return 0;
    let text = "";
    const map = [];
    let previousMath = false;
    let afterBreak = true;
    for (const node of ordered) {
      if (isBreak(node)) {
        text += "\n";
        map.push(null);
        previousMath = false;
        afterBreak = true;
        continue;
      }
      // Keep the math boundary marker, but only between pieces of text on the same line.
      if (!afterBreak && (previousMath || isMath(node))) { text += "\u0000"; map.push(null); }
      const value = node.textContent;
      for (let i = 0; i < value.length; i++) {
        text += value[i];
        map.push({ node, offset: i });
      }
      previousMath = isMath(node);
      afterBreak = false;
    }
    const spans = spansFor(text, rules);
    if (!spans.length) return 0;
    for (let s = spans.length - 1; s >= 0; s--) {
      const { start, end, replacement } = spans[s];
      const first = map[start], last = map[end - 1];
      if (!first || !last) continue;
      if (first.node === last.node) {
        const value = first.node.textContent;
        first.node.textContent = value.slice(0, first.offset) + replacement + value.slice(last.offset + 1);
      } else {
        first.node.textContent = first.node.textContent.slice(0, first.offset) + replacement;
        const from = ordered.indexOf(first.node);
        const to = ordered.indexOf(last.node);
        for (let i = from + 1; i < to; i++) {
          if (isText(ordered[i])) ordered[i].textContent = "";
        }
        last.node.textContent = last.node.textContent.slice(last.offset + 1);
      }
      for (const node of ordered) if (isText(node)) node.setAttribute("xml:space", "preserve");
    }
    return spans.length;
  }

  /**
   * A selected phrase can itself be split by an explicit line break. The first pass treats the
   * break as a boundary; this pass matches the same text with breaks removed and replaces across
   * it. The break element stays in place, but the private characters on both sides are gone.
   */
  function replaceAcrossBreaks(paragraph, rules) {
    const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
    const nodes = [...paragraph.getElementsByTagNameNS("*", "t")].filter(node => node.namespaceURI === W || node.namespaceURI === MATH_NS);
    if (!nodes.length) return 0;
    const isMath = node => node.namespaceURI === MATH_NS;
    let text = "";
    const map = [];
    nodes.forEach((node, index) => {
      if (index && (isMath(nodes[index - 1]) || isMath(node))) { text += "\u0000"; map.push(null); }
      for (let i = 0; i < node.textContent.length; i++) {
        text += node.textContent[i];
        map.push({ index, offset: i });
      }
    });
    const spans = spansFor(text, rules);
    if (!spans.length) return 0;
    for (let s = spans.length - 1; s >= 0; s--) {
      const { start, end, replacement } = spans[s];
      const first = map[start], last = map[end - 1];
      if (!first || !last) continue;
      if (first.index === last.index) {
        const node = nodes[first.index], value = node.textContent;
        node.textContent = value.slice(0, first.offset) + replacement + value.slice(last.offset + 1);
      } else {
        nodes[first.index].textContent = nodes[first.index].textContent.slice(0, first.offset) + replacement;
        for (let i = first.index + 1; i < last.index; i++) nodes[i].textContent = "";
        nodes[last.index].textContent = nodes[last.index].textContent.slice(last.offset + 1);
      }
      for (const node of nodes) node.setAttribute("xml:space", "preserve");
    }
    return spans.length;
  }

  async function burnImage(data, name, spec) {
    const type = /\.jpe?g$/i.test(name) ? "image/jpeg" : "image/png";
    const bitmap = await createImageBitmap(new Blob([data], { type }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    context.fillStyle = "#000000";
    if (spec.mode === "whole") context.fillRect(0, 0, bitmap.width, bitmap.height);
    else for (const [x, y, width, height] of spec.rects || []) {
      context.fillRect(Math.max(0, x), Math.max(0, y), Math.max(1, width), Math.max(1, height));
    }
    const blob = await canvas.convertToBlob({ type, quality: type === "image/jpeg" ? 0.92 : undefined });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: bitmap.width, height: bitmap.height };
  }

  async function verifyPixels(bytes, name, spec) {
    const type = /\.jpe?g$/i.test(name) ? "image/jpeg" : "image/png";
    const bitmap = await createImageBitmap(new Blob([bytes], { type }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const zones = spec.mode === "whole" ? [[0, 0, bitmap.width, bitmap.height]] : (spec.rects || []);
    for (const [x, y, width, height] of zones) {
      const left = Math.max(0, Math.round(x)) + 1, top = Math.max(0, Math.round(y)) + 1;
      const w = Math.max(1, Math.round(width) - 2), h = Math.max(1, Math.round(height) - 2);
      const data = context.getImageData(left, top, w, h).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 12 || data[i + 1] > 12 || data[i + 2] > 12) return false;
      }
    }
    return true;
  }

  function sanitizeXml(xmlText, rules, options) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Unsupported Word XML.");
    let removed = 0;
    if (options.removeRevisions) {
      for (const node of [...doc.getElementsByTagNameNS(W, "del"), ...doc.getElementsByTagNameNS(W, "moveFrom")]) {
        node.remove(); removed++;
      }
      for (const node of [...doc.getElementsByTagNameNS(W, "ins"), ...doc.getElementsByTagNameNS(W, "moveTo")]) {
        const parent = node.parentNode;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        node.remove();
      }
    }
    for (const node of [...doc.getElementsByTagNameNS(W, "commentRangeStart"), ...doc.getElementsByTagNameNS(W, "commentRangeEnd"), ...doc.getElementsByTagNameNS(W, "commentReference")]) node.remove();
    if (options.removeHidden) {
      for (const run of [...doc.getElementsByTagNameNS(W, "r")]) {
        if (run.getElementsByTagNameNS(W, "vanish").length) { run.remove(); removed++; }
      }
    }
    let replaced = 0;
    for (const paragraph of [...doc.getElementsByTagNameNS(W, "p")]) {
      replaced += replaceInParagraph(paragraph, rules);
      replaced += replaceAcrossBreaks(paragraph, rules);
    }
    return { xml: new XMLSerializer().serializeToString(doc), replaced, removed };
  }

  function cleanCore(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) return xmlText;
    const cleared = ["title", "subject", "description", "keywords", "category", "contentStatus", "Company", "Manager", "HyperlinkBase"];
    for (const local of cleared) {
      for (const node of [...doc.getElementsByTagNameNS("*", local)]) node.textContent = "";
    }
    for (const local of ["creator", "lastModifiedBy"]) {
      for (const node of [...doc.getElementsByTagNameNS("*", local)]) node.textContent = "PomiCat";
    }
    for (const local of ["created", "modified", "lastPrinted"]) {
      for (const node of [...doc.getElementsByTagNameNS("*", local)]) node.textContent = "2026-01-01T00:00:00Z";
    }
    return new XMLSerializer().serializeToString(doc);
  }

  function removePackageParts(parts, removed) {
    for (const name of removed) parts.delete(name);
    for (const [name, data] of parts) {
      if (!name.endsWith('.rels') && name !== '[Content_Types].xml') continue;
      const xml = new DOMParser().parseFromString(decoder.decode(data), 'application/xml');
      if (xml.querySelector('parsererror')) throw new Error('Malformed package relationships.');
      const owner = name === '_rels/.rels' ? '' : name.replace(/_rels\/[^/]+\.rels$/, '');
      for (const child of [...xml.documentElement.children]) {
        if (child.getAttribute('TargetMode') === 'External') continue;
        const target = child.getAttribute('Target');
        const resolved = target ? new URL(target, 'https://package.invalid/' + owner).pathname.slice(1) : '';
        if (removed.has(resolved) || removed.has((child.getAttribute('PartName') || '').replace(/^\//, ''))) child.remove();
      }
      parts.set(name, encoder.encode(new XMLSerializer().serializeToString(xml)));
    }
  }

  // Custom XML is metadata Word does not display: SharePoint and OneDrive add content-type and
  // library properties (owners, IDs) to almost every document. A cleaned copy drops all of it.
  // Content bound to it is refused separately (dataBinding check in sanitizeDocx). Keeping
  // metadata keeps the old strict rule: only an empty bibliography may stay, anything else stops.
  function removeCustomXml(parts, removeMetadata) {
    const names = [...parts.keys()].filter(name => /^customXml\//i.test(name));
    if (!names.length) return;
    if (removeMetadata) {
      removePackageParts(parts, new Set(names));
      return;
    }
    const allowed = new Set();
    for (const name of names.filter(name => /^customXml\/item\d+\.xml$/.test(name))) {
      const xml = new DOMParser().parseFromString(decoder.decode(parts.get(name)), 'application/xml');
      const root = xml.documentElement;
      if (xml.querySelector('parsererror') || root.namespaceURI !== 'http://schemas.openxmlformats.org/officeDocument/2006/bibliography'
        || root.localName !== 'Sources' || root.children.length || root.textContent.trim()
        || [...root.attributes].some(attr => attr.namespaceURI !== 'http://www.w3.org/2000/xmlns/' && !['SelectedStyle', 'StyleName'].includes(attr.name))) continue;
      allowed.add(name);
      const number = /item(\d+)\.xml$/.exec(name)[1];
      const props = `customXml/itemProps${number}.xml`;
      const rels = `customXml/_rels/item${number}.xml.rels`;
      if (parts.has(props)) {
        const propXml = new DOMParser().parseFromString(decoder.decode(parts.get(props)), 'application/xml');
        const propRoot = propXml.documentElement;
        const ns = 'http://schemas.openxmlformats.org/officeDocument/2006/customXml';
        if (propXml.querySelector('parsererror') || propRoot.namespaceURI !== ns || propRoot.localName !== 'datastoreItem'
          || propRoot.textContent.trim()
          || [...propRoot.attributes].some(attr => attr.namespaceURI !== 'http://www.w3.org/2000/xmlns/' && !(attr.namespaceURI === ns && attr.localName === 'itemID' && /^\{[0-9a-f-]{36}\}$/i.test(attr.value)))
          || [...propRoot.getElementsByTagName('*')].some(node => node.namespaceURI !== ns || !['schemaRefs','schemaRef'].includes(node.localName)
            || [...node.attributes].some(attr => attr.namespaceURI !== 'http://www.w3.org/2000/xmlns/' && !(node.localName === 'schemaRef' && attr.namespaceURI === ns && attr.localName === 'uri' && attr.value === 'http://schemas.openxmlformats.org/officeDocument/2006/bibliography')))) continue;
        allowed.add(props);
      }
      if (parts.has(rels)) {
        const relXml = new DOMParser().parseFromString(decoder.decode(parts.get(rels)), 'application/xml');
        if (relXml.querySelector('parsererror') || [...relXml.documentElement.children].some(node => node.getAttribute('Target') !== `itemProps${number}.xml`
          || node.getAttribute('TargetMode') === 'External' || !node.getAttribute('Type').endsWith('/customXmlProps'))) continue;
        allowed.add(rels);
      }
    }
    if (names.some(name => !allowed.has(name))) throw new Error('Custom XML contains data or unsupported bindings. Untick "Keep document metadata" to remove it, or export stops; the original document is unchanged.');
    removePackageParts(parts, new Set(names));
  }

  async function sanitizeDocx(buffer, options = {}) {
    const parts = await unzip(buffer);
    removeCustomXml(parts, options.removeMetadata !== false);
    const unsupported = [...parts.keys()].find(name => /^word\/(?:embeddings|charts|activeX)\//i.test(name) || /^word\/.*(?:afchunk|vbaProject)/i.test(name)
      || /^word\/media\//i.test(name) && !/\.(?:png|jpe?g|gif|bmp)$/i.test(name));
    if (unsupported) throw new Error("Unsupported embedded content: " + unsupported + ". Export stopped.");
    for (const [name, data] of parts) {
      if (TEXT_PART.test(name) && /<(?:\w+:)?(?:altChunk|dataBinding)\b/.test(decoder.decode(data))) {
        throw new Error("Unsupported linked or data-bound content in " + name + ". Export stopped.");
      }
    }
    const rules = (options.rules || []).filter(rule => rule && rule.value);
    const images = (options.images || []).filter(image => image && image.mode);
    if (!rules.length && !images.length) throw new Error("Select a finding, add private text, or redact an image.");
    for (const [name, data] of parts) {
      if (!TEXT_PART.test(name)) continue;
      const xml = new DOMParser().parseFromString(decoder.decode(data), "application/xml");
      const values = [
        ...[...xml.getElementsByTagNameNS(W, "fldSimple")].map(field => field.getAttributeNS(W, "instr") || ""),
        ...[...xml.getElementsByTagNameNS(W, "instrText")].map(node => node.textContent || "")
      ];
      if (values.some(value => rules.some(rule => value.includes(rule.value)))) {
        throw new Error("Unsupported field instruction contains selected private text. Export stopped; the original document is unchanged.");
      }
    }
    let replaced = 0, removed = 0, burned = 0;
    const touched = [];
    for (const [name, data] of [...parts]) {
      if (!TEXT_PART.test(name)) continue;
      if (name.endsWith("comments.xml")) { parts.set(name, encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W}"/>`)); continue; }
      const result = sanitizeXml(decoder.decode(data), rules, {
        removeRevisions: options.removeRevisions !== false,
        removeHidden: options.removeHidden !== false
      });
      replaced += result.replaced; removed += result.removed;
      parts.set(name, encoder.encode(result.xml));
      touched.push(name);
    }
    for (const image of images) {
      if (!parts.has(image.name)) continue;
      const burnedImage = await burnImage(parts.get(image.name), image.name, image);
      if (!await verifyPixels(burnedImage.bytes, image.name, image)) throw new Error("Image verification failed: redacted pixels are not solid.");
      parts.set(image.name, burnedImage.bytes);
      burned++;
    }
    if (options.removeMetadata !== false) {
      if (parts.has("docProps/custom.xml")) {
        parts.set("docProps/custom.xml", encoder.encode('<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"/>'));
      }
      for (const name of ["docProps/core.xml", "docProps/app.xml"]) {
        if (parts.has(name)) parts.set(name, encoder.encode(cleanCore(decoder.decode(parts.get(name)))));
      }
      const removedParts = new Set([...parts.keys()].filter(name => name.startsWith("docProps/thumbnail") || name === "word/thumbnail.jpeg"));
      removePackageParts(parts, removedParts);
    }
    for (const [name, data] of parts) {
      if (!name.endsWith('.rels')) continue;
      const xml = new DOMParser().parseFromString(decoder.decode(data), 'application/xml');
      if (xml.querySelector('parsererror')) throw new Error('Malformed relationships: ' + name);
      for (const node of [...xml.documentElement.children]) {
        const target = node.getAttribute('Target') || '';
        let decoded = target;
        try { decoded = decodeURIComponent(target); } catch (_) {}
        if (rules.some(rule => rule.value && [target, decoded].some(value => value.toLowerCase().includes(rule.value.toLowerCase())))) {
          if (node.getAttribute('TargetMode') !== 'External') throw new Error('Selected private text remains in an internal relationship. Export stopped.');
          node.setAttribute('Target', 'about:blank');
          node.setAttribute('TargetMode', 'External');
        }
      }
      parts.set(name, encoder.encode(new XMLSerializer().serializeToString(xml)));
    }
    const output = await zip(parts);
    return { bytes: output, replaced, removed, images: burned, parts: touched.length };
  }

  /* Check text and semantic attributes in XML/relationships. Namespace, color and
     revision identifiers are not document content. Explicitly visible occurrences are excluded. */
  const VERIFY_PART = /\.(?:xml|rels)$/i;
  async function verifyDocx(bytes, rules) {
    const parts = await unzip(bytes);
    const leftovers = [];
    for (const [name, data] of parts) {
      if (!VERIFY_PART.test(name)) continue;
      const raw = decoder.decode(data);
      let text = raw;
      // Node's ZIP-only regression has no XML DOM; browser export always parses XML.
      if (typeof DOMParser !== "undefined") {
        const xml = new DOMParser().parseFromString(raw, "application/xml");
        if (xml.querySelector("parsererror")) throw new Error("Malformed XML during verification: " + name);
        text = xml.documentElement.textContent + "\n" + [...xml.getElementsByTagNameNS('*', 't')].map(node => node.textContent).join('\n') + "\n" + [...xml.getElementsByTagName('*')]
          .flatMap(node => [...node.attributes].filter(attr => !/xmlns|rsid|color|fill/i.test(attr.name)).map(attr => attr.value)).join("\n");
        try { text += "\n" + decodeURIComponent(text); } catch (_) {}
      }
      for (const rule of rules) {
        if (!rule.value) continue;
        if (spansFor(text, [rule]).length) {
          leftovers.push({ part: name, value: rule.value });
        }
      }
    }
    return { clean: leftovers.length === 0, leftovers, parts: parts.size };
  }

  /* Visible text of every text-bearing part, for the attack check. Headers, footers and notes are
     included: they are shared content even when the preview shows only the document body. */
  async function documentText(bytes) {
    const parts = await unzip(bytes);
    const out = [];
    for (const [name, data] of parts) {
      if (!TEXT_PART.test(name)) continue;
      const raw = decoder.decode(data);
      if (typeof DOMParser !== "undefined") {
        const xml = new DOMParser().parseFromString(raw, "application/xml");
        if (xml.querySelector("parsererror")) throw new Error("Malformed XML during attack check: " + name);
        // Runs are formatting boundaries, not sentence boundaries. Keep paragraph order and tabs.
        const paragraphs = [...xml.getElementsByTagNameNS(W, "p")];
        for (const paragraph of paragraphs) {
          const collect = node => {
            if (node.nodeType !== 1) return "";
            if (node.localName === "t" && [W, "http://schemas.openxmlformats.org/officeDocument/2006/math"].includes(node.namespaceURI)) return node.textContent || "";
            if (node.namespaceURI === W && ["tab", "br", "cr"].includes(node.localName)) return " ";
            return [...node.children].map(collect).join("");
          };
          out.push(collect(paragraph));
        }
      } else {
        // Node has no XML DOM; the archive regression only needs the text nodes.
        out.push([...raw.matchAll(/<(?:w|m):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:w|m):t>/g)]
          .map(match => match[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
          .join("\n"));
      }
    }
    return out.join("\n");
  }

  const api = { sanitizeDocx, verifyDocx, documentText, unzip, zip, burnImage, spansFor, replaceInParagraph };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SafeShareWordRedact = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
