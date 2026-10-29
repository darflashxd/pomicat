"""Real Chromium extension: isolate two drafts/providers, migrate SPA chat and reload. Local only."""
import json
import os
from pathlib import Path
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = b'''<!doctype html><meta charset="utf-8"><body><main>
<div data-message-author-role="user"><div id="sent" class="whitespace-pre-wrap"></div></div>
<div data-message-author-role="assistant"><div class="markdown">Fictional reply</div></div>
<form><div id="prompt-textarea" contenteditable="true"></div>
<button id="send" type="button" data-testid="send-button">Send</button></form></main>
<script>document.getElementById('send').onclick=()=>{
document.getElementById('sent').textContent=document.getElementById('prompt-textarea').innerText;
document.getElementById('prompt-textarea').innerText='';};</script>'''

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(HTML)

    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
base = Path(os.environ.get('LOCALAPPDATA', tempfile.gettempdir())) / 'Temp/opencode'
base.mkdir(parents=True, exist_ok=True)
try:
    with tempfile.TemporaryDirectory(prefix='blackline-mapping-', dir=base) as tmp, sync_playwright() as p:
        ext = ROOT / 'extension'
        context = p.chromium.launch_persistent_context(tmp, channel='chromium', headless=True,
            args=[f'--disable-extensions-except={ext}', f'--load-extension={ext}'])
        try:
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            worker.evaluate("chrome.storage.local.set({safeshare_settings:{shield_mode:'amounts'}})")
            pages = [context.new_page() for _ in range(3)]
            origins = [f'http://127.0.0.1:{server.server_port}'] * 2 + [f'http://localhost:{server.server_port}']
            def send(page, origin, value):
                page.goto(origin)
                page.wait_for_selector('#safeshare-shield-indicator')
                page.locator('#prompt-textarea').fill(f'My salary is ${value:,} per month.')
                page.locator('#send').click()
                page.wait_for_function("document.getElementById('sent').textContent.includes('<S1>')")
            for page, origin, value in zip(pages, origins, [5000, 9000, 12000]):
                send(page, origin, value)
            stored = worker.evaluate('chrome.storage.session.get(null)')
            drafts = {k: json.loads(v) for k, v in stored.items() if k.startswith('safeshare_vault_') and '_pending_' in k}
            assert len(drafts) == 3, list(drafts)
            assert sorted(v['<S1>']['numericValue'] for v in drafts.values()) == [5000, 9000, 12000]
            for page in [pages[0], pages[2]]:
                page.evaluate("history.pushState({},'', '/c/same-chat-id')")
            pages[0].wait_for_timeout(700)
            stored = worker.evaluate('chrome.storage.session.get(null)')
            chats = {k: json.loads(v) for k, v in stored.items() if k.endswith('_data_same-chat-id')}
            assert sorted(v['<S1>']['numericValue'] for v in chats.values()) == [5000, 12000]
            pages[0].reload()
            pages[0].wait_for_selector('#safeshare-shield-indicator')
            pages[0].locator('#prompt-textarea').fill('My rent is $700 per month.')
            pages[0].locator('#send').click()
            pages[0].wait_for_function("document.getElementById('sent').textContent.includes('<S2>')")
            # Navigation cannot assign an unrelated old draft to the destination chat.
            pages[1].goto(origins[1] + '/c/unrelated-chat')
            pages[1].wait_for_selector('#safeshare-shield-indicator')
            pages[1].locator('#prompt-textarea').fill('My rent is $800 per month.')
            pages[1].locator('#send').click()
            pages[1].wait_for_function("document.getElementById('sent').textContent.includes('<S1>')")
            stored = worker.evaluate('chrome.storage.session.get(null)')
            unrelated = [json.loads(v) for k, v in stored.items() if k.endswith('_data_unrelated-chat')]
            assert len(unrelated) == 1 and unrelated[0]['<S1>']['numericValue'] == 800
            print('PASS: real extension session storage; two same-origin drafts, two origins, SPA migration, reload counters.')
        finally:
            context.close()
finally:
    server.shutdown()
    server.server_close()
