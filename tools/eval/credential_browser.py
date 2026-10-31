"""Production content-script regression, local fixture only; no relay uploads.
Run: python tools/eval/credential_browser.py (requires Playwright Chromium).
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit
import argparse

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--browser', choices=['chromium','firefox'], default='chromium')
args = parser.parse_args()
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = getattr(p, args.browser).launch()
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
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on("dialog", lambda dialog: dialog.dismiss())
            for round_number in range(3):
                page.goto(f"http://127.0.0.1:{server.server_port}/tests/fixtures/credential_review.html?round={round_number}")
                page.wait_for_function("document.getElementById('result').textContent !== 'Running'", timeout=15000)
                result = page.locator("#result").inner_text()
                assert result.startswith("PASS:"), result
                assert not errors, 'Unexpected page JavaScript error: ' + str(errors)
                print(f"Round {round_number + 1}: {result}")
            for fixture in ["submit_lifecycle.html", "extraction_integrity.html", "model_lifecycle.html", "maybe_review.html", "range_review.html", "hydration_sanitize.html", "progressive_share.html"]:
                page.goto(f"http://127.0.0.1:{server.server_port}/tests/fixtures/{fixture}")
                page.wait_for_function("/^(PASS|FAIL):/.test(document.getElementById('result').textContent)", timeout=30000)
                result = page.locator("#result").inner_text()
                assert result.startswith("PASS:"), result
                assert not errors, 'Unexpected page JavaScript error: ' + str(errors)
                print(f"{fixture}: {result}")
            assert not blocked, "Unexpected network request in local fixture (blocked)"
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
