"""Run: python tools/test_word_confidential_docx.py

Regression test for a realistic four-page confidential DOCX (fictional data):
detection coverage for table-labelled addresses and named bank accounts, sanitization across
every XML part, structure preservation, and hidden/metadata cleanup.

Offline only: no relay upload, no Word Online login.
"""
import base64
import io
import json
import os
import re
import sys
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_confidential_fixture import SECRETS, build  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = [
    "engine/heuristics.js",
    "engine/contextual.js",
    "engine/pseudonymizer.js",
    "engine/maybe.js",
    "word/textmap.js",
    "word/redact.js",
    "word/detect.js",
    "word/docx.js",
]

MANUAL_RULES = [
    {"value": name, "replacement": "[REDACTED_NAME]"} for name in SECRETS["names"]
]


def main():
    data = build()
    assert len(data) > 20000, len(data)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        for script in SCRIPTS:
            page.add_script_tag(path=str(ROOT / "extension" / script))
        result = page.evaluate(
            """async ({b64, manual}) => {
              const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
              const doc = await inspectWordFile(bytes.buffer);
              const map = SafeShareTextMap.flatten(doc);
              const findings = await SafeShareWordDetect.detect({
                doc, map, heuristics: new HeuristicsRedactor(), TextMap: SafeShareTextMap
              });
              const rules = findings.map(f => ({value: f.value, replacement: f.replacement}));
              const known = new Set(rules.map(r => r.value.toLowerCase()));
              for (const rule of manual) {
                if (!known.has(rule.value.toLowerCase())) rules.push(rule);
              }
              const out = await SafeShareWordRedact.sanitizeDocx(bytes.buffer, {rules});
              const verify = await SafeShareWordRedact.verifyDocx(out.bytes, rules);
              const cleaned = await inspectWordFile(out.bytes);
              const bytesOut = new Uint8Array(out.bytes);
              let binary = "";
              for (let i = 0; i < bytesOut.length; i += 8192) {
                binary += String.fromCharCode(...bytesOut.subarray(i, i + 8192));
              }
              return {
                inventory: {tables: doc.tables, images: doc.images, blocks: doc.blocks.length, paragraphs: doc.paragraphs.length},
                findings: findings.map(f => ({value: f.value, category: f.category, rule: f.ruleName, replacement: f.replacement})),
                replacements: out.replaced, parts: out.parts, removed: out.removed, imagesRemoved: out.images,
                clean: verify.clean,
                cleaned: {tables: cleaned.tables, images: cleaned.images, blocks: cleaned.blocks.length},
                sanitizedB64: btoa(binary)
              };
            }""",
            {"b64": base64.b64encode(data).decode(), "manual": MANUAL_RULES},
        )
        browser.close()

    findings = result["findings"]
    values = [item["value"] for item in findings]
    rules = [item["rule"] for item in findings]

    def has_value(fragment):
        return any(fragment.lower() in value.lower() for value in values)

    assert has_value(SECRETS["address"]), "labelled or street address not detected"
    assert has_value(SECRETS["bank"]), "named bank account not detected"
    assert has_value(SECRETS["nik"]), "NIK not detected"
    assert has_value(SECRETS["npwp"]), "NPWP not detected"
    assert has_value(SECRETS["phone"]), "phone not detected"
    assert has_value(SECRETS["email"]), "email not detected"
    assert has_value(SECRETS["password"]), "password not detected"
    assert has_value(SECRETS["dsn"]), "connection string not detected"
    assert any("HEALTH" == item["category"] for item in findings), "health context not detected"
    assert any("HR_DISCIPLINARY" in (item["replacement"] or "") for item in findings), "PIP context not detected"
    assert sum(1 for item in findings if item["category"] == "FINANCIAL") >= 6, "money amounts missing"
    assert result["clean"], result

    sanitized = base64.b64decode(result["sanitizedB64"])
    with zipfile.ZipFile(io.BytesIO(sanitized)) as package:
        names = package.namelist()
        parts = {name: package.read(name) for name in names if name.endswith((".xml", ".rels"))}
        document_xml = parts["word/document.xml"].decode("utf-8", "ignore")
        page_breaks = len(re.findall(r'<w:br[^>]*w:type="page"', document_xml))
        tables = len(re.findall(r"<w:tbl[ >]", document_xml))
        media = [name for name in names if name.startswith("word/media/")]

    planted = (
        SECRETS["names"]
        + [SECRETS["nik"], SECRETS["npwp"], SECRETS["address"], SECRETS["phone"],
           SECRETS["email"], SECRETS["bank"], SECRETS["password"], SECRETS["dsn"]]
        + SECRETS["amounts"]
        + SECRETS["health"]
    )
    leaks = {}
    for value in planted:
        needle = value.strip()
        if not needle:
            continue
        for name, blob in parts.items():
            if needle.lower() in blob.decode("utf-8", "ignore").lower():
                leaks.setdefault(needle, []).append(name)

    assert not leaks, f"leaked values: {leaks}"
    assert page_breaks == 3, f"expected 4 pages via 3 page breaks, got {page_breaks}"
    assert tables == 4, f"table count changed: {tables}"
    assert len(media) == 1, f"image count changed: {media}"
    assert "Hidden note" not in document_xml, "hidden text survived"
    assert "<w:vanish" not in document_xml, "hidden formatting survived"
    assert not any(name.startswith("customXml/") for name in names), "custom XML survived"
    assert "docProps/thumbnail.jpeg" not in names, "thumbnail survived"

    print(json.dumps({
        "fixture_bytes": len(data),
        "findings": len(findings),
        "rules": len(values) + len(MANUAL_RULES),
        "replacements": result["replacements"],
        "parts_removed": result["removed"],
        "pages": page_breaks + 1,
        "tables": tables,
        "images": len(media),
        "sanitized_bytes": len(sanitized),
        "address_rule": next((r for r in rules if "address" in r.lower()), None),
        "bank_rule": next((r for r in rules if "bank" in r.lower()), None),
    }))


if __name__ == "__main__":
    main()
