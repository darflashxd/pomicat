"""Production content-script regression, local fixture only; no relay uploads.
Run: python tools/eval/credential_browser.py (requires Playwright Chromium).
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            context = browser.new_context(service_workers="block")
            blocked = []
            def local_only(route):
                url = urlsplit(route.request.url)
                if url.scheme in ("http", "https") and (url.hostname != "127.0.0.1" or url.port != server.server_port or url.path.startswith("/api/")):
                    blocked.append(route.request.url)
                    route.abort()
                else:
                    route.continue_()
            context.route("**/*", local_only)
            page = context.new_page()
            page.on("dialog", lambda dialog: dialog.dismiss())
            for round_number in range(3):
                page.goto(f"http://127.0.0.1:{server.server_port}/tests/fixtures/credential_review.html?round={round_number}")
                page.wait_for_function("document.getElementById('result').textContent !== 'Running'", timeout=15000)
                result = page.locator("#result").inner_text()
                assert result.startswith("PASS:"), result
                print(f"Round {round_number + 1}: {result}")
            for fixture in ["maybe_review.html", "range_review.html", "hydration_sanitize.html"]:
                page.goto(f"http://127.0.0.1:{server.server_port}/tests/fixtures/{fixture}")
                page.wait_for_function("/^(PASS|FAIL):/.test(document.getElementById('result').textContent)", timeout=15000)
                result = page.locator("#result").inner_text()
                assert result.startswith("PASS:"), result
                print(f"{fixture}: {result}")
            assert not blocked, "Unexpected network request in local fixture (blocked)"
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
