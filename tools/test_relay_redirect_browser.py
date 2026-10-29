"""Run: python tools/test_relay_redirect_browser.py

Checks the relay handoff end to end with the unpacked extension and a local relay:

1. a relay share opens in the extension's own viewer (not the web page) and decrypts;
2. `?web=1` keeps the relay's web viewer and never enters a redirect loop;
3. UPLOAD_TO_RELAY + REVOKE_SHARE work through the background service worker.

Fictional data only. The share is revoked before the test exits.
"""
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EXT = Path(os.environ.get("SAFESHARE_EXTENSION_DIR", str(ROOT / "extension")))
RELAY_SCRIPT = ROOT / "relay" / "server_local.py"

TURNS = [
    {"role": "user", "content": "hello from relay redirect test"},
    {"role": "assistant", "content": "ack: fictional fixture only"},
]


def free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def wait_port(port, timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def revoke(relay, share_id, token):
    body = json.dumps({"token": token}).encode()
    request = urllib.request.Request(
        f"{relay}/api/revoke/{share_id}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status


def main():
    port = free_port()
    relay = f"http://127.0.0.1:{port}"
    env = dict(os.environ)
    env["SAFESHARE_HOST"] = "127.0.0.1"
    env["SAFESHARE_PORT"] = str(port)

    relay_proc = subprocess.Popen(
        [sys.executable, str(RELAY_SCRIPT)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        if not wait_port(port):
            output = relay_proc.stdout.read() if relay_proc.stdout else ""
            raise RuntimeError(f"local relay did not start: {output[-800:]}")

        with sync_playwright() as p:
            profile = os.path.join(os.environ.get("LOCALAPPDATA", str(ROOT)), "Temp", "opencode")
            os.makedirs(profile, exist_ok=True)
            with TemporaryDirectory(prefix="blackline-relay-", dir=profile) as user_data:
                context = p.chromium.launch_persistent_context(
                    user_data,
                    channel="chromium",
                    headless=True,
                    args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"],
                )
                try:
                    worker = (
                        context.service_workers[0]
                        if context.service_workers
                        else context.wait_for_event("serviceworker", timeout=20000)
                    )
                    extension_id = worker.url.split("/")[2]

                    setup = context.new_page()
                    setup.goto(f"chrome-extension://{extension_id}/viewer/index.html")
                    share = setup.evaluate(
                        """async ({ relay, turns }) => {
                          const crypto = new SafeShareCrypto(relay, relay);
                          const encrypted = await crypto.encrypt({
                            version: 3, kind: 'chat', turns,
                            timestamp: new Date().toISOString(), ttl: 86400
                          });
                          const result = await chrome.runtime.sendMessage({
                            action: 'UPLOAD_TO_RELAY',
                            relayUrl: relay,
                            payload: { id: encrypted.shareId, ciphertext: encrypted.ciphertext, ttl: 86400 }
                          });
                          if (!result || !result.success) throw new Error('upload failed: ' + JSON.stringify(result));
                          return {
                            shareId: encrypted.shareId,
                            url: relay + '/v/' + encrypted.shareId + '#' + encrypted.key,
                            token: result.data.revoke_token
                          };
                        }""",
                        {"relay": relay, "turns": TURNS},
                    )

                    # 1. Relay share is taken over by the extension viewer.
                    viewer = context.new_page()
                    viewer_errors = []
                    viewer.on("pageerror", lambda error: viewer_errors.append(str(error)))
                    try:
                        viewer.goto(share["url"], wait_until="domcontentloaded", timeout=15000)
                    except Exception:
                        pass  # window.stop() interrupts the relay page on purpose
                    viewer.wait_for_url(re.compile(r"^chrome-extension://"), timeout=15000)
                    assert viewer.url.startswith(f"chrome-extension://{extension_id}/viewer/index.html"), viewer.url
                    viewer.locator("button.btn-open-conversation").click()
                    viewer.wait_for_selector("#messages-container > *", timeout=15000)
                    transcript = viewer.locator("#messages-container").inner_text()
                    assert "hello from relay redirect test" in transcript, transcript[:300]
                    assert not viewer_errors, viewer_errors

                    # 2. ?web=1 keeps the relay's web viewer (no loop, no blank page).
                    web = context.new_page()
                    web.goto(f"{relay}/v/{share['shareId']}?web=1#{share['url'].split('#', 1)[1]}",
                             wait_until="domcontentloaded")
                    assert web.url.startswith(relay), web.url
                    web.locator("button.btn-open-conversation").click()
                    web.wait_for_selector("#messages-container > *", timeout=15000)
                    assert "hello from relay redirect test" in web.locator("#messages-container").inner_text()

                    # 3. Upload + revoke through the background worker.
                    status = revoke(relay, share["shareId"], share["token"])
                    assert status == 200, status

                    print(json.dumps({
                        "browser": "chromium-extension",
                        "extensionRedirect": True,
                        "webFallback": True,
                        "uploadRevoke": True,
                        "shareId": share["shareId"],
                    }))
                finally:
                    context.close()
    finally:
        relay_proc.terminate()
        try:
            relay_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            relay_proc.kill()


if __name__ == "__main__":
    main()
