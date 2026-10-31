#!/usr/bin/env python3
"""
PomiCat: Local Serverless & Static Relay Daemon
Provides:
1. REST API: store and retrieve ciphertext (the key never reaches the server)
2. Atomic Burn-After-Reading: Shreds payload immediately on single read
3. Static Web Server: Hosts the Web Viewer and Enclave Engines locally
4. Port: 8787
"""

import os
import re
import json
import time
import hashlib
import secrets
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

PORT = int(os.environ.get("SAFESHARE_PORT", "8787"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIEWER_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "extension", "viewer"))
STORAGE_FILE = os.environ.get("SAFESHARE_STORAGE") or os.path.join(BASE_DIR, "storage.json")
STORAGE_LOCK = threading.Lock()


def inside_viewer(path):
    """True only for files inside VIEWER_DIR. A plain prefix test let "/../viewer_redirect.js"
    through, because ".../extension/viewer_redirect.js" starts with ".../extension/viewer"."""
    try:
        return os.path.commonpath([VIEWER_DIR, os.path.abspath(path)]) == VIEWER_DIR
    except ValueError:  # different drives on Windows
        return False
VIEWER_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
              "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def load_storage():
    try:
        with open(STORAGE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or any(not isinstance(v, dict) or
                not isinstance(v.get("ciphertext"), str) or
                not isinstance(v.get("expires_at"), (int, float)) for v in data.values()):
            raise ValueError("Invalid relay storage; restore a valid copy before starting")
        return data
    except FileNotFoundError:
        return {}


def save_storage(data):
    """Raises on failure: a share that wasn't saved must not be reported as stored."""
    tmp_file = STORAGE_FILE + ".tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(data, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_file, STORAGE_FILE)


def save_or_log(data):
    """For reads: the in-memory copy is already correct, so log and carry on."""
    try:
        save_storage(data)
    except OSError as e:
        print("[-] Error saving storage:", e)


STORAGE = load_storage()

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
ALLOWED_ORIGINS = {
    "https://chatgpt.com",
    "https://chat.openai.com",
    "https://claude.ai",
    "https://chat.deepseek.com",
    "http://localhost:8787",
    "http://127.0.0.1:8787",
}

# Same limits as the Cloudflare worker: 512 KB per share, per-IP requests per minute
MAX_BODY = 512 * 1024 + 4096
LIMITS = {"upload": 10, "read": 60}
_hits = {}


def allowed(kind, ip):
    """Sliding one-minute window per (kind, ip)."""
    now = time.time()
    recent = [t for t in _hits.get((kind, ip), []) if now - t < 60]
    if len(recent) >= LIMITS[kind]:
        _hits[(kind, ip)] = recent
        return False
    recent.append(now)
    _hits[(kind, ip)] = recent
    return True


class SafeShareHandler(BaseHTTPRequestHandler):
    def read_json(self, max_bytes):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or self.headers.get("Transfer-Encoding"):
                raise ValueError("Unsupported request framing")
            if length > max_bytes:
                self.close_connection = True
                self._send_cors(413)
                self.wfile.write(b'{"error":"Request body too large"}')
                return None
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("Expected JSON object")
            return data
        except (ValueError, UnicodeError):
            self.close_connection = True
            self._send_cors(400)
            self.wfile.write(b'{"error":"Invalid JSON request"}')
            return None

    def _send_cors(self, status=200, content_type="application/json"):
        self.send_response(status)
        origin = self.headers.get("Origin")
        self.send_header("Access-Control-Allow-Origin", origin if origin in ALLOWED_ORIGINS else "null")
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("X-Robots-Tag", "noindex, noarchive, nofollow")
        self.send_header("Cache-Control", "no-store, private")
        self.send_header("Content-Type", content_type)
        if content_type == "text/html":
            self.send_header("Content-Security-Policy", VIEWER_CSP)  # same policy as relay/worker.js
            self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()

    def do_OPTIONS(self):
        self._send_cors(200)

    def do_HEAD(self):
        clean_path = self.path.split("?")[0].split("#")[0]
        if clean_path.startswith("/api/revoke/"):
            self._send_cors(405)
            return
        if clean_path.startswith("/api/share/"):
            share_id = clean_path[len("/api/share/"):].strip()
            # Metadata checks must never consume a burn share or increment its views.
            with STORAGE_LOCK:
                item = STORAGE.get(share_id)
                status = 200 if item and time.time() <= item["expires_at"] else 404
            self._send_cors(status)
            return
        if clean_path.endswith(".css"):
            self._send_cors(200, "text/css")
        elif clean_path.endswith(".js"):
            self._send_cors(200, "application/javascript")
        else:
            self._send_cors(200, "text/html")

    def do_POST(self):
        global STORAGE
        if self.path == "/api/share" or self.path == "/api/create":
            if not allowed("upload", self.client_address[0]):
                self._send_cors(429)
                self.wfile.write(json.dumps({"error": "Too many requests, try again in a minute"}).encode())
                return
            data = self.read_json(MAX_BODY)
            if data is None:
                return
            try:
                share_id = data.get("id", "")
                ciphertext = data.get("ciphertext")
                ttl = data.get("ttl", 86400)
                burn_on_read = data.get("burn_on_read", False)

                if not share_id or not ciphertext:
                    self._send_cors(400)
                    self.wfile.write(json.dumps({"error": "Missing id or ciphertext"}).encode())
                    return

                if not isinstance(share_id, str) or not UUID_RE.fullmatch(share_id):
                    self._send_cors(400)
                    self.wfile.write(json.dumps({"error": "Invalid share ID format"}).encode())
                    return

                if not isinstance(ciphertext, str) or len(ciphertext) > 512 * 1024:
                    self._send_cors(413)
                    self.wfile.write(b'{"error":"Invalid or oversized ciphertext"}')
                    return

                # Never overwrite an existing share, expired or not
                now_ts = time.time()
                with STORAGE_LOCK:
                    if share_id in STORAGE:
                        self._send_cors(409)
                        self.wfile.write(json.dumps({"error": "Share ID already exists"}).encode())
                        return

                    is_burn = burn_on_read is True or burn_on_read == 1 or ttl == "burn"
                    ttl_sec = 86400 if ttl == "burn" else min(max(int(ttl), 300), 604800)
                    revoke_token = secrets.token_hex(32)

                    STORAGE[share_id] = {
                        "ciphertext": ciphertext,
                        "revoke_hash": hashlib.sha256(revoke_token.encode()).hexdigest(),
                        "is_burn": is_burn,
                        "expires_at": now_ts + ttl_sec,
                        "view_count": 0
                    }
                    try:
                        save_storage(STORAGE)
                    except OSError as e:
                        del STORAGE[share_id]
                        self._send_cors(500)
                        self.wfile.write(json.dumps({"error": f"Could not save the share: {e}"}).encode())
                        return

                self._send_cors(201)
                self.wfile.write(json.dumps({
                    "status": "stored",
                    "id": share_id,
                    "revoke_token": revoke_token,
                    "burn_on_read": is_burn
                }).encode())
                print(f"[+] Stored encrypted payload for ID: {share_id} (Burn: {is_burn})")
            except Exception:
                self._send_cors(400)
                self.wfile.write(json.dumps({"error": "Invalid share request: expected JSON object and valid TTL"}).encode())
        elif self.path.startswith("/api/revoke/"):
            share_id = self.path.replace("/api/revoke/", "").strip()
            data = self.read_json(4096)
            if data is None:
                return
            token = data.get("token", "")
            with STORAGE_LOCK:
                item = STORAGE.get(share_id)
                token_hash = hashlib.sha256(str(token).encode()).hexdigest()
                if not isinstance(token, str) or not token or not item or not secrets.compare_digest(item.get("revoke_hash", ""), token_hash):
                    self._send_cors(404)
                    self.wfile.write(json.dumps({"error": "Not found or invalid token"}).encode())
                    return
                del STORAGE[share_id]
                try:
                    save_storage(STORAGE)
                except OSError as e:
                    STORAGE[share_id] = item
                    self._send_cors(500)
                    self.wfile.write(b'{"error":"Could not persist revocation; retry"}')
                    return
            print(f"[!] REVOKE: Shredded payload for ID: {share_id}")
            self._send_cors(200)
            self.wfile.write(json.dumps({"status": "revoked", "id": share_id}).encode())
        else:
            self._send_cors(404)

    def do_GET(self):
        global STORAGE
        clean_path = self.path.split("?")[0].split("#")[0]

        # Revoke is POST-only so link previewers and prefetchers can't delete shares
        if clean_path.startswith("/api/revoke/"):
            self._send_cors(405)
            self.wfile.write(json.dumps({"error": "Method not allowed"}).encode())
            return

        # 1. REST API: Get encrypted payload
        if clean_path.startswith("/api/share/"):
            if not allowed("read", self.client_address[0]):
                self._send_cors(429)
                self.wfile.write(json.dumps({"error": "Too many requests, try again in a minute"}).encode())
                return
            share_id = clean_path.replace("/api/share/", "").strip()
            with STORAGE_LOCK:
                item = STORAGE.get(share_id)

                if not item or time.time() > item["expires_at"]:
                    if share_id in STORAGE:
                        del STORAGE[share_id]
                        save_or_log(STORAGE)
                    self._send_cors(404)
                    self.wfile.write(json.dumps({"error": "Expired, shredded, or not found"}).encode())
                    return

                response_data = {
                    "ciphertext": item["ciphertext"],
                    "isBurn": item.get("is_burn", False)
                }

                if item.get("is_burn", False):
                    del STORAGE[share_id]
                    try:
                        save_storage(STORAGE)
                    except OSError:
                        STORAGE[share_id] = item
                        self._send_cors(500)
                        self.wfile.write(b'{"error":"Could not consume share; retry"}')
                        return
                    print(f"[-] Atomic Burn: Shredded single-read payload for ID: {share_id}")
                else:
                    item["view_count"] = item.get("view_count", 0) + 1
                    save_or_log(STORAGE)

            self._send_cors(200)
            self.wfile.write(json.dumps(response_data).encode())
            print(f"[+] Retrieved encrypted payload for ID: {share_id}")
            return

        # 2. Static Web Viewer Asset Files
        rel_path = clean_path.lstrip("/")
        candidate = os.path.abspath(os.path.join(VIEWER_DIR, rel_path))

        # Resilient subpath resolution: handles /s/style.css, /v/style.css, /s/<id>/engine/*.js
        if not (os.path.isfile(candidate) and inside_viewer(candidate)):
            for prefix in ["s/", "v/"]:
                if rel_path.startswith(prefix):
                    stripped = rel_path[len(prefix):]
                    parts = stripped.split("/")
                    candidates_to_try = [stripped]
                    if len(parts) > 1:
                        candidates_to_try.append("/".join(parts[1:]))
                    for sub in candidates_to_try:
                        if sub:
                            sub_cand = os.path.abspath(os.path.join(VIEWER_DIR, sub))
                            if os.path.isfile(sub_cand) and inside_viewer(sub_cand):
                                candidate = sub_cand
                                break

        if os.path.isfile(candidate) and inside_viewer(candidate):
            file_path = candidate
            if candidate.endswith(".css"):
                content_type = "text/css"
            elif candidate.endswith(".js"):
                content_type = "application/javascript"
            elif candidate.endswith(".json"):
                content_type = "application/json"
            else:
                content_type = "text/html"
        else:
            # HTML page fallback (Root, /s/*, /v/*, /index.html)
            file_path = os.path.join(VIEWER_DIR, "index.html")
            content_type = "text/html"

        if os.path.exists(file_path):
            with open(file_path, "rb") as f:
                content = f.read()
            self._send_cors(200, content_type)
            self.wfile.write(content)
        else:
            self._send_cors(404, "text/plain")
            self.wfile.write(b"File Not Found")

    def log_message(self, format, *args):
        pass


def run():
    host = os.environ.get("SAFESHARE_HOST", "127.0.0.1")
    server = ThreadedHTTPServer((host, PORT), SafeShareHandler)
    print(f"================================================================")
    print(f"[*] Blackline relay active on {host}:{PORT}")
    print(f"[*] Web Viewer: http://{host}:{PORT}")
    print(f"[*] Relay API : http://{host}:{PORT}/api/share")
    print(f"================================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Shutting down server.")
        server.server_close()


if __name__ == "__main__":
    run()
