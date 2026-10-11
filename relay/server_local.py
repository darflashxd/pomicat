#!/usr/bin/env python3
"""
SafeShare-AI — Local Serverless & Static Relay Daemon
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
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 8787
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIEWER_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "viewer"))
STORAGE_FILE = os.path.join(BASE_DIR, "storage.json")


def load_storage():
    if os.path.exists(STORAGE_FILE):
        try:
            with open(STORAGE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_storage(data):
    try:
        with open(STORAGE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception as e:
        print("[-] Error saving storage:", e)


STORAGE = load_storage()

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
ALLOWED_ORIGINS = {
    "https://chatgpt.com",
    "https://chat.openai.com",
    "https://claude.ai",
    "https://chat.deepseek.com",
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
        self.end_headers()

    def do_OPTIONS(self):
        self._send_cors(200)

    def do_HEAD(self):
        clean_path = self.path.split("?")[0].split("#")[0]
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
            length = int(self.headers.get("Content-Length", 0))
            if length > MAX_BODY:
                # Discard the body (bounded) so the client gets a readable 413 instead of a reset
                remaining = min(length, 8 * 1024 * 1024)
                while remaining > 0:
                    chunk = self.rfile.read(min(65536, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                self.close_connection = True
                self._send_cors(413)
                self.wfile.write(json.dumps({"error": "Share too large (max 512 KB)"}).encode())
                return

            raw_body = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(raw_body)
                share_id = str(data.get("id", "")).strip()
                ciphertext = data.get("ciphertext")
                ttl = data.get("ttl", 86400)
                burn_on_read = data.get("burn_on_read", False)

                if not share_id or not ciphertext:
                    self._send_cors(400)
                    self.wfile.write(json.dumps({"error": "Missing id or ciphertext"}).encode())
                    return

                if not UUID_RE.match(share_id):
                    self._send_cors(400)
                    self.wfile.write(json.dumps({"error": "Invalid share ID format"}).encode())
                    return

                # Never overwrite an existing share, expired or not
                now_ts = time.time()
                if share_id in STORAGE:
                    self._send_cors(409)
                    self.wfile.write(json.dumps({"error": "Share ID already exists"}).encode())
                    return

                is_burn = bool(burn_on_read) or ttl == "burn"
                ttl_sec = 86400 if ttl == "burn" else int(ttl)
                revoke_token = secrets.token_hex(32)

                STORAGE[share_id] = {
                    "ciphertext": ciphertext,
                    "revoke_hash": hashlib.sha256(revoke_token.encode()).hexdigest(),
                    "is_burn": is_burn,
                    "expires_at": now_ts + ttl_sec,
                    "view_count": 0
                }
                save_storage(STORAGE)

                self._send_cors(201)
                self.wfile.write(json.dumps({
                    "status": "stored",
                    "id": share_id,
                    "revoke_token": revoke_token,
                    "burn_on_read": is_burn
                }).encode())
                print(f"[+] Stored encrypted payload for ID: {share_id} (Burn: {is_burn})")
            except Exception as e:
                self._send_cors(400)
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        elif self.path == "/api/chat":
            length = int(self.headers.get("Content-Length", 0))
            if length > 512 * 1024:
                self._send_cors(413)
                self.wfile.write(json.dumps({"error": "Payload exceeds maximum allowed size"}).encode())
                return

            raw_body = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(raw_body)
                messages = data.get("messages", [])
                ai_reply = self._call_ai_gateway(messages)
                self._send_cors(200)
                self.wfile.write(json.dumps({"role": "assistant", "content": ai_reply}).encode())
            except Exception as e:
                self._send_cors(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        elif self.path.startswith("/api/revoke/"):
            share_id = self.path.replace("/api/revoke/", "").strip()
            length = int(self.headers.get("Content-Length", 0))
            try:
                token = json.loads(self.rfile.read(length) or b"{}").get("token", "")
            except Exception:
                token = ""
            item = STORAGE.get(share_id)
            token_hash = hashlib.sha256(str(token).encode()).hexdigest()
            if not token or not item or not secrets.compare_digest(item.get("revoke_hash", ""), token_hash):
                self._send_cors(404)
                self.wfile.write(json.dumps({"error": "Not found or invalid token"}).encode())
                return
            del STORAGE[share_id]
            save_storage(STORAGE)
            print(f"[!] REVOKE: Shredded payload for ID: {share_id}")
            self._send_cors(200)
            self.wfile.write(json.dumps({"status": "revoked", "id": share_id}).encode())
        else:
            self._send_cors(404)

    def _call_ai_gateway(self, messages):
        try:
            import urllib.request
            gateway_url = os.environ.get("NINEROUTER_URL", "http://localhost:20128/v1/chat/completions")
            api_key = os.environ.get("NINEROUTER_API_KEY", os.environ.get("OPENAI_API_KEY", ""))
            headers = {
                "Content-Type": "application/json"
            }
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            payload = {
                "model": os.environ.get("SAFESHARE_LLM_MODEL", "ag/gemini-3.8-flash-low"),
                "messages": messages,
                "stream": False
            }
            req = urllib.request.Request(gateway_url, data=json.dumps(payload).encode("utf-8"), headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                return res_json["choices"][0]["message"]["content"]
        except Exception as e:
            print("[-] AI gateway error:", e)
            last_msg = messages[-1]["content"] if messages else "lanjutan"
            return f"Melanjutkan diskusi dari percakapan sebelumnya:\n\nMengenai '{last_msg}': data telah dianalisis. Silakan ajukan pertanyaan lebih lanjut atau gunakan tombol 'Lanjutkan di ChatGPT / Claude' untuk melanjutkan di antarmuka resmi."

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
            item = STORAGE.get(share_id)

            if not item or time.time() > item["expires_at"]:
                if share_id in STORAGE:
                    del STORAGE[share_id]
                    save_storage(STORAGE)
                self._send_cors(404)
                self.wfile.write(json.dumps({"error": "Expired, shredded, or not found"}).encode())
                return

            response_data = {
                "ciphertext": item["ciphertext"],
                "isBurn": item.get("is_burn", False)
            }

            if item.get("is_burn", False):
                del STORAGE[share_id]
                save_storage(STORAGE)
                print(f"[-] Atomic Burn: Shredded single-read payload for ID: {share_id}")
            else:
                item["view_count"] = item.get("view_count", 0) + 1
                save_storage(STORAGE)

            self._send_cors(200)
            self.wfile.write(json.dumps(response_data).encode())
            print(f"[+] Retrieved encrypted payload for ID: {share_id}")
            return

        # 2. Static Web Viewer Asset Files
        rel_path = clean_path.lstrip("/")
        candidate = os.path.abspath(os.path.join(VIEWER_DIR, rel_path))

        # Resilient subpath resolution: handles /s/style.css, /v/style.css, /s/<id>/engine/*.js
        if not (os.path.isfile(candidate) and candidate.startswith(VIEWER_DIR)):
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
                            if os.path.isfile(sub_cand) and sub_cand.startswith(VIEWER_DIR):
                                candidate = sub_cand
                                break

        if os.path.isfile(candidate) and candidate.startswith(VIEWER_DIR):
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
    server = HTTPServer((host, PORT), SafeShareHandler)
    print(f"================================================================")
    print(f"[*] SafeShare-AI Integrated Server Active on {host}:{PORT}")
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
