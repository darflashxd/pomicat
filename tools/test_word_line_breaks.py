"""Line-break handling in the Word redactor. Run: python tools/test_word_line_breaks.py

Word stores a line break as <w:br/>. Joining only <w:t> glued the end of one line to the start of
the next, so a selected value that ended a line failed the word-boundary check and verifyDocx
blocked the export. A value that really spans a break cannot be redacted safely and must be
refused instead of silently left in the copy.
"""
import base64
import io
import json
from pathlib import Path

from docx import Document
from lxml import etree
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
A, B, C = "SECRET-LINE-A", "SECRET-TAB-B", "SECRET-PLAIN-C"
SPAN = "SPLIT-VALUE-E"


def add(doc, pieces):
    paragraph = doc.add_paragraph()
    for kind, text in pieces:
        if kind == "text":
            paragraph.add_run(text)
        else:
            paragraph.add_run()._r.append(etree.fromstring(f'<w:{kind} xmlns:w="{W}"/>'))


def build():
    doc = Document()
    add(doc, [("text", f"Nama: {A}"), ("br", None), ("text", "Status: aktif")])
    add(doc, [("text", "Kode:"), ("tab", None), ("text", B)])
    add(doc, [("text", f"Catatan: {C} selesai")])
    add(doc, [("text", "Gabungan: SPLIT-"), ("br", None), ("text", "VALUE-E")])
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def main():
    data = build()
    rules = [{"value": value, "replacement": "[REDACTED]"} for value in (A, B, C)]
    span_rule = [{"value": SPAN, "replacement": "[REDACTED]"}]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("about:blank")
        for script in ["docx.js", "redact.js"]:
            page.add_script_tag(content=(ROOT / "extension/word" / script).read_text(encoding="utf-8"))
        result = page.evaluate(
            """async ({b64, rules}) => {
              const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
              const output = await SafeShareWordRedact.sanitizeDocx(bytes.buffer, {rules});
              const check = await SafeShareWordRedact.verifyDocx(output.bytes, rules);
              const parts = await SafeShareWordRedact.unzip(output.bytes.buffer);
              const xml = new TextDecoder().decode(parts.get('word/document.xml'));
              return {replaced: output.replaced, clean: check.clean, leftovers: check.leftovers.length, xml,
                      breaks: (xml.match(/<w:br\\b/g) || []).length};
            }""",
            {"b64": base64.b64encode(data).decode(), "rules": rules},
        )
        assert result["replaced"] >= 3, result
        assert result["clean"] and result["leftovers"] == 0, result
        for value in (A, B, C):
            assert value not in result["xml"], f"{value} survived"
        assert result["breaks"] >= 2, "line breaks must be preserved"
        refused = page.evaluate(
            """async ({b64, rules}) => {
              const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
              try {
                const output = await SafeShareWordRedact.sanitizeDocx(bytes.buffer, {rules});
                const check = await SafeShareWordRedact.verifyDocx(output.bytes, rules);
                const parts = await SafeShareWordRedact.unzip(output.bytes.buffer);
                const xml = new TextDecoder().decode(parts.get('word/document.xml'));
                return {accepted: true, replaced: output.replaced, clean: check.clean, leftovers: check.leftovers.length, xml};
              } catch (e) { return {accepted: false, error: e.message}; }
            }""",
            {"b64": base64.b64encode(data).decode(), "rules": span_rule},
        )
        browser.close()
    assert refused["accepted"] is True, refused
    assert refused["clean"] and refused["leftovers"] == 0, refused
    assert refused["replaced"] >= 1, refused
    assert "SPLIT-" not in refused["xml"] and "VALUE-E" not in refused["xml"], "split value survived"
    print(json.dumps({
        "lineEnd": A,
        "tab": B,
        "plain": C,
        "replaced": result["replaced"],
        "breaksPreserved": result["breaks"],
        "crossBreakReplaced": refused["replaced"],
    }, indent=2))
    print("PASS: line-end, tab and cross-break values redacted; line breaks preserved; no leftovers.")


if __name__ == "__main__":
    main()
