"""Production Word UI regression in local Chromium/Firefox. No relay traffic."""
import json
import os
import hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = Path(os.environ.get('SAFESHARE_EXTENSION_DIR', str(ROOT / 'extension')))


def run(browser_type):
    browser = browser_type.launch()
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://audit.invalid/**', lambda route: route.fulfill(
        path=str(EXTENSION / 'word/index.html') if route.request.url.endswith('index.html')
        else str(EXTENSION / route.request.url.split('audit.invalid/')[1])))
    page.add_init_script('''window.chrome = {storage:{local:{get:async()=>({}),set:async()=>{},remove:async()=>{}}},runtime:{sendMessage:async()=>({success:true,data:{revoke_token:'synthetic'}})}};''')
    page.goto('https://audit.invalid/word/index.html')
    page.evaluate('''() => {
      sourceBytes = new Uint8Array([80,75]);
      lastDoc = {blocks:[{text:'Alice Carter earns 4,800. Alice Carter called Carter.'}], supplementary:[],media:[]};
      providedFindings = [
        {value:'Alice Carter',category:'PROFILE',source:'model',modelLabel:'PERSON',score:0.8,preChecked:true,replacement:'[REDACTED_NAME]'},
        {value:'Carter',category:'PROFILE',source:'model',modelLabel:'SURNAME',score:0.7,preChecked:true,replacement:'[REDACTED_NAME]'},
        {value:'4,800',category:'FINANCIAL',source:'amount',preChecked:true,replacement:'[REDACTED_FINANCIAL]'}];
      renderFindings(lastDoc);
    }''')
    assert page.locator('.finding').count() == 2
    page.locator('#document-preview mark').filter(has_text='4,800').click()
    assert '4,800' in page.locator('#sanitized-preview').inner_text()
    page.locator('#sanitized-preview mark.keep').filter(has_text='4,800').click()
    assert '4,800' not in page.locator('#sanitized-preview').inner_text()
    page.evaluate('''() => {
      SafeShareWordRedact.sanitizeDocx = () => new Promise(resolve => window.finishApply = () => resolve({bytes:new Uint8Array([1,2,3]),replaced:3,parts:1,images:0,removed:0}));
      SafeShareWordRedact.verifyDocx = async () => ({clean:true});
    }''')
    page.locator('#apply').click()
    page.wait_for_function('!!window.finishApply')
    page.locator('.manual-panel summary').click()
    page.locator('#manual').fill('private change')
    page.evaluate('finishApply()')
    page.wait_for_function('!document.getElementById("apply").disabled')
    assert page.evaluate('sanitizedBytes === null')
    assert page.locator('#create-link').is_disabled()
    page.locator('#manual').fill('')
    page.locator('#apply').click()
    page.evaluate('finishApply()')
    page.wait_for_function('!!appliedSnapshot')
    with page.expect_download() as download_event:
        page.locator('#download-sanitized').click()
    download = download_event.value
    actual = Path(download.path()).read_bytes()
    assert hashlib.sha256(actual).digest() == hashlib.sha256(bytes([1,2,3])).digest()
    # The attack check reads the exported package, so a header figure the preview never shows is caught.
    page.evaluate('''() => {
      const E = new TextEncoder();
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const doc = '<w:document xmlns:w="'+W+'"><w:body><w:p><w:r><w:t>Salary [REDACTED_FINANCIAL]</w:t></w:r></w:p></w:body></w:document>';
      const header = '<w:hdr xmlns:w="'+W+'"><w:p><w:r><w:t>20% of your monthly salary is 1,000.</w:t></w:r></w:p></w:hdr>';
      SafeShareWordRedact.sanitizeDocx = async () => ({bytes: await SafeShareWordRedact.zip(new Map([
        ['word/document.xml', E.encode(doc)], ['word/header1.xml', E.encode(header)]])), replaced: 1, parts: 2, images: 0, removed: 0});
      appliedSnapshot = null; sanitizedBytes = null; document.getElementById('apply').hidden = false;
    }''')
    page.locator('#apply').click()
    page.wait_for_function('!!appliedSnapshot')
    assert 'reconstruction finding' in page.locator('#attack-text').inner_text()
    assert page.locator('#download-sanitized').is_disabled()
    page.evaluate('''() => {
      appliedSnapshot = null; sanitizedBytes = null;
      document.getElementById('apply').hidden = false;
      SafeShareWordRedact.sanitizeDocx = async () => {throw new Error('Synthetic unsupported content');};
    }''')
    page.locator('#apply').click()
    page.wait_for_function('!document.getElementById("apply").disabled')
    assert page.locator('#error').is_visible()
    assert 'Synthetic unsupported content' in page.locator('#apply-status').inner_text()
    page.evaluate('''() => {SafeShareWordRedact.sanitizeDocx = async () => ({bytes:new Uint8Array([1,2,3]),replaced:3,parts:1,images:0,removed:0});}''')
    page.locator('#manual').fill('')
    page.locator('#apply').click()
    page.wait_for_function('!!appliedSnapshot')
    page.locator('#manual').fill('edit before debounce')
    page.evaluate('publishSanitized()')
    assert page.locator('#create-link').is_disabled()
    page.evaluate('''() => {
      lastDoc = {blocks:[{text:'Salary 4,800; total USD 4,800.'}], supplementary:[], media:[]};
      providedFindings = [
        {value:'4,800',category:'FINANCIAL',source:'amount',replacement:'[REDACTED_FINANCIAL]',preChecked:true,ruleName:'Money amount'},
        {value:'USD 4,800',category:'FINANCIAL',source:'derived',replacement:'[REDACTED_FINANCIAL_1]',preChecked:true,ruleName:'Derived amount'}
      ];
      renderFindings(lastDoc);
    }''')
    page.locator('#sanitized-preview mark[data-finding-key="FINANCIAL|usd 4,800"]').click()
    grouped = page.evaluate('''() => ({
      values: findingRows(lastDoc).map(item => ({value:item.value, checked:findingState.get(findingKey(item))})),
      text: document.getElementById('sanitized-preview').innerText
    })''')
    assert all(not item['checked'] for item in grouped['values']), grouped
    assert '[REDACTED_FINANCIAL' not in grouped['text'], grouped
    page.locator('#document-preview mark[data-finding-key="FINANCIAL|usd 4,800"]').focus()
    page.keyboard.press('Space')
    regrouped = page.evaluate('''() => ({
      values: findingRows(lastDoc).map(item => ({value:item.value, checked:findingState.get(findingKey(item))})),
      text: document.getElementById('sanitized-preview').innerText
    })''')
    assert all(item['checked'] for item in regrouped['values']), regrouped
    assert '[REDACTED_FINANCIAL' in regrouped['text'], regrouped
    page.evaluate('''() => {
      lastDoc = {blocks:[{text:'Salary USD 4,800; record 4800; unknown; pending; EUR 4,800.'}], supplementary:[], media:[]};
      providedFindings = [
        {value:'USD 4,800',category:'FINANCIAL',source:'amount',replacement:'[REDACTED_FINANCIAL]',preChecked:true},
        {value:'4800',category:'FINANCIAL',source:'rule',replacement:'[REDACTED_RECORD_ID]',preChecked:true},
        {value:'unknown',category:'FINANCIAL',source:'amount',replacement:'[REDACTED_FINANCIAL]',preChecked:true},
        {value:'pending',category:'FINANCIAL',source:'derived',replacement:'[REDACTED_FINANCIAL]',preChecked:true},
        {value:'EUR 4,800',category:'FINANCIAL',source:'amount',replacement:'[REDACTED_FINANCIAL]',preChecked:true}
      ];
      renderFindings(lastDoc);
    }''')
    page.locator('#sanitized-preview mark[data-finding-key="FINANCIAL|usd 4,800"]').click()
    assert page.evaluate("findingRows(lastDoc).filter(f => f.value !== 'USD 4,800').every(findingChecked)")
    page.locator('#sanitized-preview mark[data-finding-key="FINANCIAL|unknown"]').click()
    assert page.evaluate("findingRows(lastDoc).filter(f => ['4800','pending','EUR 4,800'].includes(f.value)).every(findingChecked)")
    assert '[REDACTED_RECORD_ID]' in page.locator('#sanitized-preview').inner_text()
    assert not errors, errors
    browser.close()
    return {'browser':browser_type.name,'inlineToggle':True,'applyRaceRejected':True,'debouncePublishRejected':True,'downloadHashMatches':True,'failureReasonVisible':True,'groupedFinancialToggle':True,'pageErrors':errors}


with sync_playwright() as p:
    results = []
    for engine in [p.chromium, p.firefox]:
        try:
            results.append(run(engine))
        except Exception as error:
            results.append({'browser':engine.name,'failed':str(error)})
    print(json.dumps(results, indent=2))
    assert all('failed' not in result for result in results), results
