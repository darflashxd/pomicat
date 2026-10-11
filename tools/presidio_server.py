"""Usage: python tools/presidio_server.py [port]   (default 5002)

Minimal Presidio analyzer service for `safeshare --presidio http://127.0.0.1:5002`.
Speaks the same API as the official presidio-analyzer Docker image:

    POST /analyze {"text": "...", "language": "en", "entities": [...], "score_threshold": 0.5}
    -> [{"entity_type": "PERSON", "start": 0, "end": 8, "score": 0.85}, ...]

Needs: pip install presidio-analyzer && the en_core_web_lg spaCy model.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from presidio_analyzer import AnalyzerEngine

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5002
analyzer = AnalyzerEngine()


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/analyze":
            self.send_error(404)
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            results = analyzer.analyze(
                text=body["text"],
                language=body.get("language", "en"),
                entities=body.get("entities"),
                score_threshold=body.get("score_threshold", 0),
            )
            out = [{"entity_type": r.entity_type, "start": r.start, "end": r.end, "score": r.score} for r in results]
            status, payload = 200, json.dumps(out)
        except Exception as e:  # bad input should not kill the server
            status, payload = 400, json.dumps({"error": str(e)})
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload.encode())

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Presidio analyzer on http://127.0.0.1:{PORT}/analyze")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
