"""Fictional hosted-viewer end-to-end check, local relay and temporary storage only.
Run: python tools/eval/relay_browser.py [--browser chromium|firefox]
"""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', choices=['chromium', 'firefox'], default='chromium')
    args = parser.parse_args()
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    origin = f'http://127.0.0.1:{port}'
    base = Path(os.environ.get('LOCALAPPDATA', tempfile.gettempdir())) / 'Temp/opencode'
    base.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='safeshare-link-check-', dir=base) as tmp:
        process = subprocess.Popen([os.sys.executable, str(ROOT/'relay/server_local.py')],
            env={**os.environ, 'SAFESHARE_PORT': str(port), 'SAFESHARE_STORAGE': str(Path(tmp)/'storage.json')},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(50):
                try:
                    with urlopen(origin, timeout=1) as response:
                        assert response.status == 200
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('Local relay did not start')

            def make_share(burn, mismatch=False):
                script = """
                const Crypto=require('./extension/engine/crypto');
                const {redactTurns}=require('./bin/pomicat');
                (async()=>{const c=new Crypto(process.argv[1],process.argv[1]);
                const turns=redactTurns([{role:'user',content:'My email password is QuasarSecret782.'},
                {role:'assistant',content:'Store credentials in a password manager.'}]);
                console.log(JSON.stringify(await c.encrypt({turns,ttl:3600})));})().catch(e=>{console.error(e);process.exitCode=1;});
                """
                enc = json.loads(subprocess.run(['node', '-e', script, origin], cwd=ROOT,
                    capture_output=True, text=True, encoding='utf-8', check=True, timeout=30).stdout)
                if mismatch:
                    import uuid
                    enc['shareId'] = str(uuid.uuid4())
                    enc['fullShareUrl'] = origin + '/v/' + enc['shareId'] + '#' + enc['key']
                body = json.dumps({'id': enc['shareId'], 'ciphertext': enc['ciphertext'],
                                   'ttl': 3600, 'burn_on_read': burn}).encode()
                with urlopen(Request(origin+'/api/share', data=body, headers={'Content-Type':'application/json'}), timeout=5) as res:
                    assert res.status == 201
                    enc['revoke_token'] = json.load(res)['revoke_token']
                return enc

            burn, normal, mismatch = make_share(True), make_share(False), make_share(False, True)
            with sync_playwright() as p:
                browser = getattr(p, args.browser).launch()
                try:
                    context = browser.new_context(service_workers='block')
                    blocked, errors, api_reads = [], [], []
                    def route_local(route):
                        if not route.request.url.startswith(origin+'/'):
                            blocked.append(True)
                            route.abort()
                        else:
                            route.continue_()
                    context.route('**/*', route_local)
                    page = context.new_page()
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('request', lambda r: api_reads.append(r.url) if '/api/share/' in r.url else None)

                    page.goto(burn['fullShareUrl'])
                    button = page.get_by_role('button', name='Open conversation', exact=True)
                    button.wait_for()
                    assert not api_reads, 'Viewer fetched ciphertext before explicit open'
                    assert 'QuasarSecret782' not in page.locator('body').inner_text()
                    # JS .click() is not a trusted opening gesture.
                    button.evaluate('(el)=>el.click()')
                    page.wait_for_timeout(100)
                    assert not api_reads, 'Synthetic click consumed burn link'
                    button.click()
                    page.locator('#messages-container .chat-bubble').nth(1).wait_for()
                    assert page.locator('#messages-container .chat-bubble').count() == 2
                    assert len(api_reads) == 1
                    assert 'QuasarSecret782' not in page.locator('#messages-container').text_content()
                    assert 'password manager' in page.locator('#messages-container').text_content()

                    page.goto(burn['fullShareUrl'])  # Full original link, not the fragment-stripped URL.
                    page.reload()  # Fragment-only navigation does not rerun the viewer.
                    page.get_by_role('button', name='Open conversation', exact=True).click()
                    page.get_by_role('heading', name='⏱️ Link Expired or Revoked').wait_for()

                    page.goto(normal['fullShareUrl'])
                    page.get_by_role('button', name='Open conversation', exact=True).click()
                    page.locator('#messages-container .chat-bubble').nth(1).wait_for()
                    token_body = json.dumps({'token': normal['revoke_token']}).encode()
                    with urlopen(Request(origin+'/api/revoke/'+normal['shareId'], data=token_body,
                                         headers={'Content-Type':'application/json'}), timeout=5) as res:
                        assert res.status == 200
                    page.goto(normal['fullShareUrl'])
                    page.reload()
                    page.get_by_role('button', name='Open conversation', exact=True).click()
                    page.get_by_role('heading', name='⏱️ Link Expired or Revoked').wait_for()
                    page.goto(mismatch['fullShareUrl'])
                    page.get_by_role('button', name='Open conversation', exact=True).click()
                    page.get_by_role('heading', name='Decryption Failed').wait_for()
                    assert page.locator('#messages-container .chat-bubble').count() == 0
                    assert not blocked, 'Unexpected external request blocked'
                    assert not errors, errors
                    print(f'PASS {args.browser}: hosted local viewer, no pre-click read, untrusted click ignored, decrypted redacted turns, burn, revoke. No public relay used.')
                finally:
                    browser.close()
        finally:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)

if __name__ == '__main__':
    main()
