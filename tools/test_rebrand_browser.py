"""Run: python tools/test_rebrand_browser.py. Local UI/upgrade smoke, no relay."""
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EXT = Path(os.environ.get('SAFESHARE_EXTENSION_DIR', str(ROOT / 'extension')))

with sync_playwright() as p:
    for engine in [p.chromium, p.firefox]:
        browser = engine.launch()
        page = browser.new_page()
        page.add_init_script('''window.chrome={storage:{local:{get:async()=>({}),set:async()=>{},remove:async()=>{}}},runtime:{}};''')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://audit.invalid/**', lambda route: route.fulfill(path=str(EXT / route.request.url.split('audit.invalid/')[1])))
        page.goto('https://audit.invalid/word/index.html')
        assert page.title() == 'PomiCat for Word Online'
        assert page.locator('header a').inner_text() == 'PomiCat'
        page.goto('https://audit.invalid/viewer/index.html')
        assert page.title() == 'PomiCat · Private conversation'
        assert page.locator('.brand-title').inner_text() == 'PomiCat'
        assert not errors, errors
        print(json.dumps({'browser': engine.name, 'wordBrand': True, 'viewerBrand': True, 'pageErrors': errors}))
        browser.close()

    temp_root = Path(os.environ.get('LOCALAPPDATA', str(ROOT))) / 'Temp/opencode'
    temp_root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='blackline-upgrade-', dir=temp_root) as profile:
        context = p.chromium.launch_persistent_context(profile, channel='chromium', headless=True,
            args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'])
        worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
        before = worker.evaluate('''async () => {
          const data={safeshare_settings:{profile:'trusted'},safeshare_relay:'http://127.0.0.1:8788',
            safeshare_own_synthetic:{ct:'synthetic-ciphertext',expMs:4102444800000},
            document_share_revoke_synthetic:{shareId:'synthetic',token:'fictional-token'},
            chat_share_revoke_synthetic_chat:{shareId:'synthetic_chat',token:'fictional-chat-token',expiresAt:4102444800000}};
          await chrome.storage.local.set(data);
          return {id:chrome.runtime.id,data};
        }''')
        extension_id = before['id']
        context.close()
        context = p.chromium.launch_persistent_context(profile, channel='chromium', headless=True,
            args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'])
        page = context.new_page()
        page.goto(f'chrome-extension://{extension_id}/word/index.html')
        assert page.title() == 'PomiCat for Word Online'
        after = page.evaluate('''async () => ({id:chrome.runtime.id,version:chrome.runtime.getManifest().version,
          name:chrome.runtime.getManifest().name,data:await chrome.storage.local.get(null)})''')
        assert before['id'] == after['id'] and before['data'] == after['data'], after
        assert after['name'] == 'PomiCat'
        page.locator('#legacy button').filter(has_text='Revoke synthetic_chat').wait_for(state='attached')
        print(json.dumps({'browser':'chromium-extension','name':after['name'],'version':after['version'],
            'sameId':True,'legacyStorageSurvivesRestart':True}))
        context.close()
