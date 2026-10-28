"""Run: python tools/test_hr_toggle_browser.py. Fictional local fixture; no relay."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

with sync_playwright() as p:
    for engine in [p.chromium, p.firefox]:
        browser = engine.launch()
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://audit.invalid/**', lambda route: route.fulfill(path=str(ROOT / route.request.url.split('audit.invalid/')[1])))
        page.goto('https://audit.invalid/tests/fixtures/fake_chat.html')
        page.evaluate('''() => {
          window.hrModal = new SafeShareModal();
          hrModal.open([
            {role:'user', content:'My manager put me on a performance improvement plan last week.'},
            {role:'assistant', content:'Absolutely. Keep your message to HR focused on your performance improvement plan (PIP), potential severance, and next steps. The PIP needs review. My written warning needs review.'}
          ]);
        }''')
        key = page.evaluate("hrModal.candidates.find(c => c.raw.toLowerCase() === 'performance improvement plan (pip)').id")
        badge = page.locator(f'#diff-box-sanitized [data-cand-id="{key}"]')
        badge.click()
        state = page.evaluate("hrModal.candidates.filter(c => /^(performance improvement plan( \\(pip\\))?|pip)$/i.test(c.raw)).map(c => c.enabled)")
        assert len(state) == 3 and not any(state), state
        text = page.locator('#diff-box-sanitized').inner_text()
        assert 'performance improvement plan (PIP)' in text, text
        assert '[HR_DISCIPLINARY_RECORD_1]' not in text, text
        assert '[HR_DISCIPLINARY_RECORD_2]' not in text, text
        assert 'written warning' not in text, text
        assert 'performance improvement plan (PIP)' in page.evaluate('hrModal.sanitizedTurns[1].content')
        badge.focus()
        page.keyboard.press('Enter')
        assert page.evaluate("hrModal.candidates.filter(c => /^(performance improvement plan( \\(pip\\))?|pip)$/i.test(c.raw)).every(c => c.enabled)")
        assert 'performance improvement plan (PIP)' not in page.evaluate('hrModal.sanitizedTurns[1].content')
        page.evaluate('''() => {
          clearTimeout(hrModal.autoScanTimer);
          window.pendingNer = [];
          window.SafeShareNer = {analyze: () => new Promise(resolve => pendingNer.push(resolve))};
          hrModal.modelReview.clear();
          window.lateScan = hrModal.checkLocalModel(true);
        }''')
        page.wait_for_function('pendingNer.length > 0')
        badge.click()
        for _ in range(2):
            page.wait_for_function('pendingNer.length > 0 || !hrModal.modelBusy')
            page.evaluate('''() => { const resolve = pendingNer.shift(); if (resolve) resolve({success:true,spans:[]}); }''')
        page.wait_for_function('!hrModal.modelBusy')
        assert page.evaluate("hrModal.candidates.filter(c => /^(performance improvement plan( \\(pip\\))?|pip)$/i.test(c.raw)).every(c => !c.enabled)")
        assert 'performance improvement plan (PIP)' in page.evaluate('hrModal.sanitizedTurns[1].content')
        assert not errors, errors
        print(json.dumps({'browser': engine.name, 'pointerUnredact': True, 'keyboardRedact': True, 'unrelatedRecordProtected': True, 'lateModelPreservesChoice': True}))
        browser.close()
