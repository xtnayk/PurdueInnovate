"""Loopback-only HTTP server for the Fieldwork demonstration."""
from __future__ import annotations

import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .planner import Planner

WEB_ROOT = Path(__file__).resolve().parent.parent / "web"


def create_server(port=8765):
    engine = Planner()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

        def log_message(self, _format, *args):
            # Avoid recording raw free-text update content in local logs.
            pass

        def _json(self, status, value):
            data = json.dumps(value, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/api/demo":
                self._json(200, engine.metadata())
            elif path.startswith("/api/"):
                self._json(404, {"error": "Unknown API endpoint."})
            else:
                super().do_GET()

        def do_POST(self):
            origin = self.headers.get("Origin")
            if origin:
                parsed = urlsplit(origin)
                if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost") or parsed.port != self.server.server_port:
                    self._json(403, {"error": "Only this local app may submit changes."})
                    return
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                self._json(415, {"error": "Expected application/json."})
                return
            path = urlsplit(self.path).path
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > 131072:
                    raise ValueError("Request must contain 1–131,072 bytes of JSON.")
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError("Expected a JSON object.")
                if path == "/api/replan":
                    result = engine.replan(body.get("scenario", "baseline"), body.get("priority"),
                                           body.get("update", ""), body.get("completed_fields"),
                                           body.get("profile"), body.get("feedback_constraints"), body.get("incidents"))
                elif path == "/api/profile/preview":
                    result = engine.preview_profile(body.get("profile"))
                elif path == "/api/parse":
                    result = engine.parse(body.get("text", ""), body.get("profile"))
                elif path == "/api/approve":
                    result = engine.approve(body.get("run_id"), body.get("plan_id"))
                else:
                    self._json(404, {"error": "Unknown API endpoint."})
                    return
                self._json(200, result)
            except (ValueError, TypeError, UnicodeDecodeError) as error:
                self._json(409 if path == "/api/approve" else 400, {"error": str(error)})

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    server = create_server()
    print("Fieldwork local demo: http://127.0.0.1:8765", flush=True)
    print("Synthetic inputs only. Approval is local and never dispatches equipment.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
