"""Run: python tools/test_document_viewer.py (requires Playwright Chromium)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(accept_downloads=True)
    page.route('https://audit.invalid/**', lambda route: route.fulfill(
        path=str(ROOT / 'extension' / route.request.url.split('audit.invalid/')[1].split('?')[0])))
    page.add_init_script('''document.addEventListener('DOMContentLoaded', () => {
      SafeShareCrypto.prototype.decrypt = async () => ({version:4,kind:'document',format:'docx',
        docx:'UEsDBA==',preview:'<html><body><h1>Fictional document</h1><p>Reviewed text</p></body></html>'});
    }, {capture:true});''')
    # Capture listener overrides decrypt before app.js's DOMContentLoaded listener.
    page.goto('https://audit.invalid/viewer/index.html#d=test&k=test')
    page.wait_for_selector('.document-frame')
    assert page.locator('.document-frame').get_attribute('sandbox') == ''
    assert page.frame_locator('.document-frame').locator('h1').inner_text() == 'Fictional document'
    for width, height in [(1440, 900), (768, 800), (375, 812)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        box = page.locator('.document-frame').bounding_box()
        assert box['height'] > height * .45, box
        assert box['y'] + box['height'] <= height + 2, box
    with page.expect_download() as event:
        page.get_by_role('button', name='Download DOCX', exact=True).click()
    assert Path(event.value.path()).read_bytes() == b'PK\x03\x04'
    assert 'Download requested' in page.locator('.document-status').inner_text()
    browser.close()
print('PASS document viewer: responsive workspace, sandbox, legacy preview, exact download bytes')
