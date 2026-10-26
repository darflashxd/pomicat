/**
 * SafeShare viewer: a small, dependency-free Markdown renderer.
 *
 * The viewer shows text written by an AI chat. That text is untrusted, so every
 * character is HTML-escaped before any tag is added. Only a fixed set of block
 * and inline constructs is supported; anything else stays plain text.
 *
 * Supported: headings (# to ######), bold, italic, inline code, fenced code,
 * unordered and ordered lists, blockquotes, horizontal rules, http(s) links,
 * pipe tables and tab-separated tables.
 *
 * Not supported: raw HTML, images, nested lists, reference-style links.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SafeShareMarkdown = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Only absolute http(s) links become anchors; everything else stays text. */
  function safeHref(url) {
    const trimmed = String(url).trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }

  function formatInline(text) {
    // Escape first: after this point the only tags in the string are ours.
    let s = escapeHtml(text);

    // Inline code is pulled out first so its contents are not bolded or linked.
    const code = [];
    s = s.replace(/`([^`\n]+)`/g, (_, inner) => {
      code.push(inner);
      return `\u0000CODE${code.length - 1}\u0000`;
    });

    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
      const href = safeHref(url);
      if (!href) return match;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    // Single asterisks only when they wrap a word and sit on word boundaries, so
    // arithmetic such as "0.25 * <S1>" is left alone.
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");

    s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => `<code>${code[Number(index)]}</code>`);
    return s.replace(/\n/g, "<br>");
  }

  // The viewer appends an invisible forensic watermark to the end of a message.
  // Ignore it when deciding whether a line is a table row; it stays in the text.
  const INVISIBLE_TAIL = /[\u200B-\u200F\u2060\uFEFF]+$/;
  function withoutInvisibleTail(line) {
    return String(line).replace(INVISIBLE_TAIL, "");
  }

  function isPipeRow(line) {
    const t = withoutInvisibleTail(line.trim());
    return t.length > 1 && t.startsWith("|") && t.endsWith("|");
  }

  function isSeparatorRow(line) {
    const t = withoutInvisibleTail(line.trim());
    return isPipeRow(t) && /^\|[\s:|-]+\|$/.test(t) && t.includes("-");
  }

  function isTabRow(line) {
    const t = withoutInvisibleTail(line);
    return t.includes("\t") && t.split("\t").filter((cell) => cell.trim()).length >= 2;
  }

  function splitPipeRow(line) {
    const raw = line.trim();
    const tail = (raw.match(INVISIBLE_TAIL) || [""])[0];
    const body = tail ? raw.slice(0, raw.length - tail.length) : raw;
    const cells = body.split("|").slice(1, -1).map((cell) => cell.trim());
    // Put the watermark back into the last cell so it stays in the rendered text.
    if (tail && cells.length) cells[cells.length - 1] += tail;
    return cells;
  }

  function renderTable(rows) {
    if (!rows.length) return "";
    const header = rows[0];
    let html = `<div class="table-wrapper"><table><thead><tr>` +
      header.map((cell) => `<th>${formatInline(cell)}</th>`).join("") +
      `</tr></thead>`;
    if (rows.length > 1) {
      html += "<tbody>" + rows.slice(1).map((row) =>
        "<tr>" + row.map((cell) => `<td>${formatInline(cell)}</td>`).join("") + "</tr>"
      ).join("") + "</tbody>";
    }
    return html + "</table></div>";
  }

  function startsBlock(lines, index) {
    const line = lines[index];
    if (line === undefined) return false;
    const t = line.trim();
    if (!t) return true;
    if (/^#{1,6}\s+/.test(t)) return true;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) return true;
    if (/^>\s?/.test(t)) return true;
    if (/^[-*+]\s+/.test(t)) return true;
    if (/^\d+[.)]\s+/.test(t)) return true;
    if (isPipeRow(t)) return true;
    return false;
  }

  function formatBlocks(text) {
    const lines = String(text).replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (!trimmed) { i++; continue; }

      const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        out.push(`<h${level}>${formatInline(heading[2].trim())}</h${level}>`);
        i++;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        out.push("<hr>");
        i++;
        continue;
      }

      // Pipe table: consecutive rows that start and end with a pipe.
      if (isPipeRow(trimmed)) {
        const rows = [];
        while (i < lines.length && isPipeRow(lines[i])) {
          if (!isSeparatorRow(lines[i])) rows.push(splitPipeRow(lines[i]));
          i++;
        }
        if (rows.length) out.push(renderTable(rows));
        continue;
      }

      // Tab-separated table: the format some AI tools emit for copy/paste.
      if (isTabRow(lines[i])) {
        const rows = [];
        while (i < lines.length && isTabRow(lines[i])) {
          rows.push(lines[i].split("\t").map((cell) => cell.trim()).filter(Boolean));
          i++;
        }
        if (rows.length) out.push(renderTable(rows));
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        const quoted = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quoted.push(lines[i].trim().replace(/^>\s?/, ""));
          i++;
        }
        out.push(`<blockquote>${formatInline(quoted.join("\n"))}</blockquote>`);
        continue;
      }

      if (/^[-*+]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*+]\s+/, ""));
          i++;
        }
        out.push("<ul>" + items.map((item) => `<li>${formatInline(item)}</li>`).join("") + "</ul>");
        continue;
      }

      if (/^\d+[.)]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
          i++;
        }
        out.push("<ol>" + items.map((item) => `<li>${formatInline(item)}</li>`).join("") + "</ol>");
        continue;
      }

      // Paragraph: collect lines until a blank line or the start of another block.
      const paragraph = [trimmed];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
        paragraph.push(lines[i].trim());
        i++;
      }
      out.push(`<p>${formatInline(paragraph.join("\n"))}</p>`);
    }

    return out;
  }

  function format(raw) {
    if (!raw) return "";
    const blocks = [];
    const parts = String(raw).split(/(```[a-zA-Z0-9_-]*[\s\S]*?```)/g);

    for (const part of parts) {
      if (part.startsWith("```") && part.endsWith("```")) {
        const match = part.match(/^```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```$/);
        if (match) {
          const lang = match[1] || "text";
          blocks.push(`<pre><code class="language-${lang}">${escapeHtml(match[2].trim())}</code></pre>`);
        }
      } else {
        blocks.push(...formatBlocks(part));
      }
    }

    return blocks.join("\n");
  }

  return { format, escapeHtml };
});
