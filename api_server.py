"""
HTTP API + web UI server (port 8001) — centralized file server.

Flow:
  Browser → GET/POST /api/*  → JSON (status, upload file, list/download)
  Browser → other paths      → React app from frontend/dist
  Upload  → saved to shared storage on THIS server
  All clients connected to the same server URL see and download the same files
"""

import json          # JSON API responses
import mimetypes     # Guess Content-Type for static files
import os            # Files, paths
import re            # Parse multipart boundaries
import socket        # Detect local IP
import threading     # Upload threads + locks
import uuid          # Unique job IDs and stored filenames
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from tcp_server import DEFAULT_SAVE_DIR  # Shared storage: ~/Downloads/received_files

# --- HTTP server settings ---
HTTP_HOST = "0.0.0.0"   # Listen on all interfaces
HTTP_PORT = 8001        # Web UI + API port
BUFFER_SIZE = 4096      # Chunk size when writing uploads
STATIC_DIR = Path(__file__).resolve().parent / "frontend" / "dist"  # Built React app

# --- Upload jobs (UI polls GET /api/transfer/{id}) ---
transfer_jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


def get_local_ip() -> str:
    """Detect LAN IP hint for UI (users still type server/client IPs separately)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))  # No data sent; kernel picks route
            return s.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"


def _json_response(handler: BaseHTTPRequestHandler, data: dict, status: int = 200):
    """Send a JSON HTTP response with CORS headers."""
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    _send_cors(handler)
    handler.end_headers()
    handler.wfile.write(body)


def _error(handler: BaseHTTPRequestHandler, message: str, status: int = 400):
    """Send JSON error: {"detail": "message"}."""
    _json_response(handler, {"detail": message}, status)


def _send_cors(handler: BaseHTTPRequestHandler):
    """Allow browser UI on Vercel or other origins to call this API."""
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header(
        "Access-Control-Allow-Headers", "Content-Type, ngrok-skip-browser-warning"
    )


def _read_body(handler: BaseHTTPRequestHandler) -> bytes:
    """Read raw POST body using Content-Length, with fallback for missing length."""
    raw_length = handler.headers.get("Content-Length")
    if raw_length is not None:
        return handler.rfile.read(int(raw_length))

    # Some proxies omit Content-Length; read until the handler closes the stream.
    chunks: list[bytes] = []
    while True:
        chunk = handler.rfile.read(BUFFER_SIZE)
        if not chunk:
            break
        chunks.append(chunk)
    return b"".join(chunks)


def _read_json(handler: BaseHTTPRequestHandler) -> dict:
    """Parse JSON POST body; empty body → {}."""
    body = _read_body(handler)
    if not body:
        return {}
    return json.loads(body.decode("utf-8"))


def _format_size(size: int) -> str:
    """Human-readable file size for UI."""
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f} {unit}" if unit != "B" else f"{size} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def _parse_multipart(content_type: str, body: bytes) -> dict[str, dict]:
    """Parse multipart/form-data from browser file upload (no external libs)."""
    match = re.search(r'boundary=(?P<b>[^;]+)', content_type)
    if not match:
        raise ValueError("Missing multipart boundary")

    boundary = match.group("b").strip('"').encode()
    parts = body.split(b"--" + boundary)
    fields: dict[str, dict] = {}

    for part in parts:
        if not part or part in (b"--\r\n", b"--"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        header_end = part.find(b"\r\n\r\n")
        if header_end == -1:
            continue

        headers = part[:header_end].decode("utf-8", errors="replace")
        content = part[header_end + 4 :]
        if content.endswith(b"\r\n"):
            content = content[:-2]

        name = None
        filename = None
        for line in headers.split("\r\n"):
            if not line.lower().startswith("content-disposition:"):
                continue
            name_match = re.search(r'name="([^"]+)"', line)
            file_match = re.search(r'filename="([^"]*)"', line)
            if name_match:
                name = name_match.group(1)
            if file_match:
                filename = file_match.group(1) or None

        if name:
            fields[name] = {"content": content, "filename": filename}

    return fields


CONNECT_TIMEOUT = 10    # Reserved for legacy compatibility
TRANSFER_TIMEOUT = 120  # Max seconds for large upload writes


def _stored_display_name(stored_name: str) -> str:
    """Strip upload prefix (8 hex chars + _) to show original filename."""
    match = re.match(r"^[0-9a-f]{8}_(.+)$", stored_name, re.IGNORECASE)
    return match.group(1) if match else stored_name


def _unique_stored_name(original: str) -> str:
    """Return a collision-safe filename for shared server storage."""
    safe = os.path.basename(original) or "upload.bin"
    return f"{uuid.uuid4().hex[:8]}_{safe}"


def _store_upload(job_id: str, stored_path: str, file_data: bytes, display_name: str):
    """
    Background worker: write uploaded bytes to shared server storage.
    Updates transfer_jobs[job_id] for UI progress polling.
    """
    filesize = len(file_data)

    with jobs_lock:
        transfer_jobs[job_id].update(
            {
                "status": "uploading",
                "filename": display_name,
                "stored_name": os.path.basename(stored_path),
                "filesize": filesize,
                "sent": 0,
                "progress": 0,
            }
        )

    try:
        written = 0
        with open(stored_path, "wb") as f:
            while written < filesize:
                chunk = file_data[written : written + BUFFER_SIZE]
                f.write(chunk)
                written += len(chunk)
                progress = round((written / filesize) * 100, 1) if filesize else 100
                with jobs_lock:
                    transfer_jobs[job_id].update(
                        {"status": "uploading", "sent": written, "progress": progress}
                    )

        with jobs_lock:
            transfer_jobs[job_id].update(
                {
                    "status": "completed",
                    "sent": written,
                    "progress": 100,
                    "completed_at": datetime.now().isoformat(),
                }
            )
    except OSError as e:
        with jobs_lock:
            transfer_jobs[job_id].update(
                {
                    "status": "failed",
                    "error": f"Failed to save file on server: {e}",
                }
            )
        try:
            os.remove(stored_path)
        except OSError:
            pass
    except Exception as e:
        with jobs_lock:
            transfer_jobs[job_id].update({"status": "failed", "error": str(e)})


def _is_listable_file(name: str) -> bool:
    """Skip hidden files and temp artifacts in shared-files list."""
    return not (name.startswith(".") or name.startswith("_"))


def _collect_received_files() -> tuple[list[dict], str]:
    """Scan shared storage for files all connected clients can access."""
    save_path = Path(DEFAULT_SAVE_DIR)
    if not save_path.exists():
        return [], str(save_path)

    files = []
    for entry in sorted(save_path.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not entry.is_file() or not _is_listable_file(entry.name):
            continue
        stat = entry.stat()
        files.append(
            {
                "name": entry.name,
                "display_name": _stored_display_name(entry.name),
                "size": stat.st_size,
                "size_formatted": _format_size(stat.st_size),
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            }
        )
    return files, str(save_path)


def _transfer_stats() -> dict:
    """Count upload jobs by status for history panel."""
    with jobs_lock:
        jobs = list(transfer_jobs.values())
    return {
        "total": len(jobs),
        "completed": sum(1 for j in jobs if j.get("status") == "completed"),
        "failed": sum(1 for j in jobs if j.get("status") == "failed"),
        "active": sum(
            1
            for j in jobs
            if j.get("status") in ("queued", "uploading")
        ),
    }


def _session_stats() -> dict:
    """Combined upload + shared file counts for dashboard."""
    received_files, _ = _collect_received_files()
    sent = _transfer_stats()
    return {
        "sent_total": sent["total"],
        "sent_completed": sent["completed"],
        "sent_failed": sent["failed"],
        "sent_active": sent["active"],
        "received_total": len(received_files),
    }


def _serve_static(handler: BaseHTTPRequestHandler, rel_path: str):
    """Serve built React files from frontend/dist."""
    if not STATIC_DIR.is_dir():
        _error(
            handler,
            "UI not built yet. Run: cd frontend && npm install && npm run build",
            503,
        )
        return

    if not rel_path or rel_path.endswith("/"):
        rel_path = "index.html"

    file_path = (STATIC_DIR / rel_path).resolve()

    if not str(file_path).startswith(str(STATIC_DIR.resolve())):
        _error(handler, "Forbidden", 403)
        return

    if not file_path.is_file():
        file_path = STATIC_DIR / "index.html"
        if not file_path.is_file():
            _error(handler, "Not found", 404)
            return

    content_type, _ = mimetypes.guess_type(str(file_path))
    content_type = content_type or "application/octet-stream"
    data = file_path.read_bytes()

    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(data)))
    _send_cors(handler)
    handler.end_headers()
    handler.wfile.write(data)


class TransferAPIHandler(BaseHTTPRequestHandler):
    """HTTP request router: /api/* → JSON, else → static UI."""

    def log_message(self, fmt, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.address_string()} - {fmt % args}")

    def do_OPTIONS(self):
        """CORS preflight for browser clients."""
        self.send_response(204)
        _send_cors(self)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/health":
            return _json_response(
                self, {"status": "ok", "timestamp": datetime.now().isoformat()}
            )

        if path == "/api/status":
            detected_ip = get_local_ip()
            stats = _session_stats()
            return _json_response(
                self,
                {
                    "local_ip": detected_ip,
                    "detected_ip": detected_ip,
                    "server": {
                        "running": True,
                        "port": HTTP_PORT,
                        "address": f"http://{detected_ip}:{HTTP_PORT}",
                        "save_dir": DEFAULT_SAVE_DIR,
                    },
                    "active_transfers": stats["sent_active"],
                    "stats": stats,
                },
            )

        if path == "/api/files":
            files, directory = _collect_received_files()
            return _json_response(
                self, {"files": files, "directory": directory, "count": len(files)}
            )

        if path.startswith("/api/files/download/"):
            filename = os.path.basename(unquote(path.split("/api/files/download/", 1)[1]))
            filepath = os.path.join(DEFAULT_SAVE_DIR, filename)
            if not os.path.isfile(filepath):
                return _error(self, "File not found", 404)

            data = Path(filepath).read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{_stored_display_name(filename)}"')
            self.send_header("Content-Length", str(len(data)))
            _send_cors(self)
            self.end_headers()
            self.wfile.write(data)
            return

        if path.startswith("/api/transfer/"):
            job_id = path.split("/api/transfer/", 1)[1].strip("/")
            with jobs_lock:
                job = transfer_jobs.get(job_id)
            if not job:
                return _error(self, "Transfer job not found", 404)
            return _json_response(self, job)

        if path == "/api/transfers":
            with jobs_lock:
                jobs = list(transfer_jobs.values())
            received_files, _ = _collect_received_files()
            return _json_response(
                self,
                {
                    "transfers": sorted(
                        jobs, key=lambda j: j.get("created_at", ""), reverse=True
                    ),
                    "stats": _transfer_stats(),
                    "received_count": len(received_files),
                },
            )

        rel = path.lstrip("/")
        return _serve_static(self, rel)

    def do_POST(self):
        path = urlparse(self.path).path

        if path in ("/api/server/start", "/api/server/stop"):
            detected_ip = get_local_ip()
            return _json_response(
                self,
                {
                    "message": "Central server is always running with python start.py — no separate start needed.",
                    "running": True,
                    "local_ip": detected_ip,
                    "address": f"http://{detected_ip}:{HTTP_PORT}",
                    "api_running": True,
                },
            )

        if path == "/api/transfer":
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type:
                return _error(self, "Expected multipart/form-data")

            try:
                fields = _parse_multipart(content_type, _read_body(self))
            except ValueError as e:
                return _error(self, str(e))

            if "file" not in fields:
                return _error(self, "No file uploaded")

            file_data = fields["file"]["content"]
            display_name = os.path.basename(fields["file"].get("filename") or "upload.bin")
            stored_name = _unique_stored_name(display_name)

            os.makedirs(DEFAULT_SAVE_DIR, exist_ok=True)
            stored_path = os.path.join(DEFAULT_SAVE_DIR, stored_name)

            job_id = str(uuid.uuid4())

            with jobs_lock:
                transfer_jobs[job_id] = {
                    "id": job_id,
                    "status": "queued",
                    "protocol": "http",
                    "host": "central",
                    "port": HTTP_PORT,
                    "filename": display_name,
                    "stored_name": stored_name,
                    "filesize": len(file_data),
                    "sent": 0,
                    "progress": 0,
                    "created_at": datetime.now().isoformat(),
                }

            threading.Thread(
                target=_store_upload,
                args=(job_id, stored_path, file_data, display_name),
                daemon=True,
            ).start()

            return _json_response(self, {"job_id": job_id, "message": "Upload started"})

        return _error(self, "Not found", 404)


def run_http_server():
    """Entry point: start HTTP server on port 8001."""
    os.makedirs(DEFAULT_SAVE_DIR, exist_ok=True)
    server = ThreadingHTTPServer((HTTP_HOST, HTTP_PORT), TransferAPIHandler)
    ui_status = "built" if STATIC_DIR.is_dir() else "not built (see GUI_README.md)"
    print(f"[API] Central file server on http://127.0.0.1:{HTTP_PORT}")
    print(f"[API] UI status: {ui_status}")
    print(f"[API] Save directory: {DEFAULT_SAVE_DIR}")
    print("[API] No pip packages required — Python standard library only")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[API] Shutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":
    run_http_server()
