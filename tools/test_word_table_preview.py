"""Run: python tools/test_word_table_preview.py. Basic table layout regression."""
import io
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, 'w') as z:
    z.writestr('word/document.xml', f'''<w:document xmlns:w="{ns}"><w:body>
    <w:tbl><w:tblPr><w:tblStyle w:val="Borderless"/></w:tblPr><w:tblGrid><w:gridCol w:w="1000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>To</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Committee</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8" w:color="000000"/></w:tblBorders></w:tblPr><w:tr><w:tc><w:p><w:r><w:t>Salary</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    </w:body></w:document>''')
    z.writestr('word/styles.xml', f'<w:styles xmlns:w="{ns}"><w:style w:styleId="Borderless"><w:tblPr><w:tblBorders><w:top w:val="nil"/></w:tblBorders></w:tblPr></w:style></w:styles>')
with sync_playwright() as p:
    for engine in [p.chromium, p.firefox]:
        browser = engine.launch()
        page = browser.new_page()
        page.goto('https://example.com')
        for script in ['redact.js', 'docx.js']:
            page.add_script_tag(content=(ROOT / 'extension/word' / script).read_text(encoding='utf-8'))
        result = page.evaluate('async bytes => (await inspectWordFile(new Uint8Array(bytes))).blocks', list(buffer.getvalue()))
        assert result[0]['layout']['widths'] == [1000, 4000]
        assert result[0]['layout']['borders']['top'] == 'none'
        assert result[1]['layout']['borders']['top'] == '1pt solid #000000'
        assert result[0]['rows'] == [['To', 'Committee']]
        browser.close()
        print(engine.name + ': PASS table grid, style border, direct border, unchanged text')
