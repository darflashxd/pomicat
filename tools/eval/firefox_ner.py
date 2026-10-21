"""Real Firefox add-on/model smoke check. Stdlib only; temporary profile, fictional text.

Run: python tools/eval/firefox_ner.py [path/to/firefox.exe]
No personal browser profile touched. Copies current extension into a temporary test add-on.
"""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = Path(__file__).resolve().parents[2]


def main():
    firefox = sys.argv[1] if len(sys.argv) > 1 else r"C:\Program Files\Mozilla Firefox\firefox.exe"
    received = {}
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            received.update(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(200)
            self.end_headers()
            done.set()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "Temp" / "opencode"
    base.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="safeshare-firefox-", dir=base) as tmp:
        tmp = Path(tmp)
        ext = tmp / "extension"
        shutil.copytree(Path(os.environ.get('SAFESHARE_EXTENSION_DIR', ROOT / 'extension')), ext)
        if os.environ.get('SAFESHARE_CANDIDATE_DIR'):
            from candidate_extension import prepare_candidate
            print('Experimental adapter:', prepare_candidate(ext, os.environ['SAFESHARE_CANDIDATE_DIR']))
        manifest_path = ext / "manifest.firefox.json"
        if not manifest_path.exists(): manifest_path = ext / "manifest.json"  # Extracted Firefox package.
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if 'scripts' not in manifest.get('background', {}):
            raise ValueError('Firefox test requires Firefox manifest/package, not Chromium service worker manifest')
        manifest["background"]["scripts"].append("ner_smoke.js")
        (ext / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        (ext / "ner_smoke.js").write_text("""
(async () => {
  let result;
  try {
    const text = "My name is Amelia Hartwell. I live at 742 Evergreen Terrace, Springfield.";
    const t = performance.now();
    const spans = await runInference(text, true);
    result = {ok: spans.length > 0,
      browser: navigator.userAgent, count: spans.length,
      labels: [...new Set(spans.map(s => s.label))], elapsedMs: Math.round(performance.now()-t)};
  } catch(e) { result = {ok:false, error:String(e), stack:e.stack}; }
  await browser.storage.local.set({smoke:result});
  await browser.tabs.create({url:browser.runtime.getURL("smoke_page.html")});
})();
""".replace("PORT", str(server.server_port)), encoding="utf-8")
        scripts = ["engine/heuristics.js", "engine/contextual.js", "engine/pseudonymizer.js", "engine/policy.js", "engine/crypto.js",
                   "engine/maybe.js", "engine/transcript.js", "engine/span_arbiter.js", "engine/ner_client.js", "ui/modal.js", "browser_review.js", "smoke_page.js"]
        shutil.copyfile(ROOT / "tools/eval/browser_review.js", ext / "browser_review.js")
        (ext / "smoke_page.html").write_text('<!doctype html><body>' + ''.join(f'<script src="{s}"></script>' for s in scripts), encoding="utf-8")
        (ext / "smoke_page.js").write_text("""
(async () => {
 const {smoke} = await browser.storage.local.get("smoke");
 try {
  const response = await browser.runtime.sendMessage({action:"RUN_NER_INFERENCE", text:"My name is Amelia Hartwell. I live in Springfield.",review:true});
  smoke.messageCount = response.spans?.length;
  smoke.ok = smoke.ok && response.success && response.spans.length > 0;
  smoke.shareDialog = await checkBrowserReview();
 } catch(e) {smoke.ok=false;smoke.error=String(e);}
 await fetch("http://127.0.0.1:PORT/result", {method:"POST",body:JSON.stringify(smoke)});
})();
""".replace("PORT", str(server.server_port)), encoding="utf-8")
        profile = tmp / "profile"
        profile.mkdir()
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        (profile / "user.js").write_text(
            f'user_pref("marionette.port", {port});\n'
            'user_pref("browser.shell.checkDefaultBrowser", false);\n'
            'user_pref("datareporting.policy.dataSubmissionEnabled", false);\n', encoding="utf-8")
        process = subprocess.Popen([firefox, "--headless", "--no-remote", "--profile", str(profile), "--marionette"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        connection = None
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    connection = socket.create_connection(("127.0.0.1", port), timeout=2)
                    break
                except OSError:
                    time.sleep(0.2)
            if connection is None:
                raise RuntimeError("Firefox Marionette did not start")
            connection.settimeout(90)

            def read():
                length = b""
                while True:
                    char = connection.recv(1)
                    if not char:
                        raise RuntimeError("Firefox connection closed")
                    if char == b":":
                        break
                    length += char
                data = b""
                while len(data) < int(length):
                    chunk = connection.recv(int(length) - len(data))
                    if not chunk:
                        raise RuntimeError("Firefox connection closed during response")
                    data += chunk
                return json.loads(data)

            read()  # handshake
            def command(number, method, params):
                data = json.dumps([0, number, method, params]).encode()
                connection.sendall(str(len(data)).encode() + b":" + data)
                response = read()
                if response[2]:
                    raise RuntimeError(response[2])
                return response[3]

            command(1, "WebDriver:NewSession", {"capabilities": {"alwaysMatch": {"acceptInsecureCerts": False}}})
            command(2, "Addon:Install", {"path": str(ext), "temporary": True})
            if not done.wait(90):
                raise RuntimeError("Add-on/model did not report within 90s")
            print(json.dumps(received, indent=2))
            if not received.get("ok"):
                raise RuntimeError("Real Firefox model smoke failed")
        finally:
            if connection:
                try:
                    command(3, "Marionette:Quit", {"flags": ["eAttemptQuit"]})
                except (OSError, RuntimeError):
                    pass  # Firefox can close the transport before sending its reply.
                connection.close()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            server.shutdown()


if __name__ == "__main__":
    main()
