"""
HTTP API + web UI server (port 8001).

Flow:
  Browser → GET/POST /api/*  → JSON (status, start server, upload file, etc.)
  Browser → other paths      → React app from frontend/dist
  Upload  → background thread → TCP send to user-entered host:port
  Start   → background thread → tcp_server.py listens on port 9999
"""

import json          # JSON API responses
import mimetypes     # Guess Content-Type for static files
import os            # Files, paths, remove temp uploads
import re            # Parse multipart boundaries, filter temp filenames
import socket        # TCP client for sending files; detect local IP
import threading     # TCP server thread + send threads + locks
import time          # Pause after header; timeouts
import uuid          # Unique job IDs for transfer tracking
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from tcp_server import (
    DEFAULT_SAVE_DIR,       # ~/Downloads/received_files
    DEFAULT_PORT as TCP_PORT,  # 9999
    get_tcp_bind_error,     # Error if port bind failed
    run_automated_server,   # TCP receiver main loop
    stop_tcp_server,        # Close listener on Stop button
    wait_tcp_ready,         # Wait until bind succeeds
)

# --- HTTP server settings ---
HTTP_HOST = "0.0.0.0"   # Listen on all interfaces
HTTP_PORT = 8001        # Web UI + API port
BUFFER_SIZE = 4096      # Chunk size when sending files
STATIC_DIR = Path(__file__).resolve().parent / "frontend" / "dist"  # Built React app

# --- TCP receiver on THIS PC (one thread) ---
server_thread: threading.Thread | None = None
server_running = False
servers_lock = threading.Lock()  # Prevent race between start/stop

# --- Outbound send jobs (UI polls GET /api/transfer/{id}) ---
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
    """Read raw POST body using Content-Length header."""
    length = int(handler.headers.get("Content-Length", 0))
    return handler.rfile.read(length) if length else b""


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


CONNECT_TIMEOUT = 10    # Seconds to establish TCP connection to receiver
TRANSFER_TIMEOUT = 120  # Seconds for full file send after connected
PROBE_TIMEOUT = 5       # Quick check before starting a transfer


def _probe_tcp_receiver(host: str, port: int, timeout: float = PROBE_TIMEOUT) -> tuple[bool, str]:
    """Verify the TCP receiver is listening before starting a file send."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.settimeout(timeout)
        sock.connect((host, port))
        return True, f"TCP receiver reachable at {host}:{port}"
    except socket.timeout:
        return False, (
            f"No response from {host}:{port} within {int(timeout)} seconds. "
            f"On the receiver PC ({host}): open the dashboard, click Start on TCP Receiver, "
            f"and allow port {port} through the firewall."
        )
    except ConnectionRefusedError:
        return False, (
            f"Connection refused at {host}:{port}. "
            "TCP receiver is not running on that PC — click Start in the TCP Receiver panel."
        )
    except OSError as e:
        return False, f"Cannot reach {host}:{port}: {e}"
    finally:
        sock.close()


def _send_file_tcp(job_id: str, host: str, port: int, filepath: str, filename: str):
    """
    Background worker: connect to receiver and send one file.
    Updates transfer_jobs[job_id] for UI progress polling.
    """
    filesize = os.path.getsize(filepath)

    with jobs_lock:
        transfer_jobs[job_id].update(
            {
                "status": "connecting",
                "filename": filename,
                "filesize": filesize,
                "sent": 0,
                "progress": 0,
            }
        )

    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    connected = False
    try:
        client.settimeout(CONNECT_TIMEOUT)
        client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        client.connect((host, port))  # User-entered receiver IP from send panel
        connected = True
        client.settimeout(TRANSFER_TIMEOUT)

        header = f"{filename}|{filesize}"
        client.sendall(header.encode("utf-8"))
        time.sleep(0.15)  # Let receiver parse header

        sent = 0
        with open(filepath, "rb") as f:
            while True:
                chunk = f.read(BUFFER_SIZE)
                if not chunk:
                    break
                client.sendall(chunk)
                sent += len(chunk)
                progress = round((sent / filesize) * 100, 1) if filesize else 100
                with jobs_lock:
                    transfer_jobs[job_id].update(
                        {"status": "transferring", "sent": sent, "progress": progress}
                    )

        with jobs_lock:
            transfer_jobs[job_id].update(
                {
                    "status": "completed",
                    "sent": sent,
                    "progress": 100,
                    "completed_at": datetime.now().isoformat(),
                }
            )
    except socket.timeout:
        if not connected:
            err = (
                f"Timed out connecting to {host}:{port}. "
                "Start the TCP receiver on that PC and verify the IP and firewall."
            )
        else:
            err = f"Transfer to {host}:{port} stalled while sending data. Try again."
        with jobs_lock:
            transfer_jobs[job_id].update({"status": "failed", "error": err})
    except OSError as e:
        with jobs_lock:
            transfer_jobs[job_id].update(
                {
                    "status": "failed",
                    "error": f"Cannot reach {host}:{port} — start the TCP receiver first. ({e})",
                }
            )
    except Exception as e:
        with jobs_lock:
            transfer_jobs[job_id].update({"status": "failed", "error": str(e)})
    finally:
        client.close()
        try:
            os.remove(filepath)  # Delete temp upload copy
        except OSError:
            pass


def _is_listable_file(name: str) -> bool:
    """Skip hidden files and temp upload artifacts in received-files list."""
    if name.startswith(".") or name.startswith("_"):
        return False
    if re.match(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_",
        name,
        re.IGNORECASE,
    ):
        return False
    return True


def _collect_received_files() -> tuple[list[dict], str]:
    """Scan DEFAULT_SAVE_DIR for files tcp_server saved."""
    save_path = Path(DEFAULT_SAVE_DIR)
    if not save_path.exists():
        return [], str(save_path)

    files = []
    for entry in sorted(save_path.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if entry.is_file() and _is_listable_file(entry.name):
            stat = entry.stat()
            files.append(
                {
                    "name": entry.name,
                    "size": stat.st_size,
                    "size_formatted": _format_size(stat.st_size),
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                }
            )
    return files, str(save_path)


def _transfer_stats() -> dict:
    """Count send jobs by status for history panel."""
    with jobs_lock:
        jobs = list(transfer_jobs.values())
    return {
        "total": len(jobs),
        "completed": sum(1 for j in jobs if j.get("status") == "completed"),
        "failed": sum(1 for j in jobs if j.get("status") == "failed"),
        "active": sum(
            1
            for j in jobs
            if j.get("status") in ("queued", "connecting", "transferring")
        ),
    }


def _session_stats() -> dict:
    """Combined sent + received counts for dashboard."""
    received_files, _ = _collect_received_files()
    sent = _transfer_stats()
    return {
        "sent_total": sent["total"],
        "sent_completed": sent["completed"],
        "sent_failed": sent["failed"],
        "sent_active": sent["active"],
        "received_total": len(received_files),
    }


def _tcp_running() -> bool:
    """True if TCP receiver thread is alive on this PC."""
    global server_running, server_thread
    if not server_thread or not server_thread.is_alive():
        server_running = False
        return False
    return server_running


def _run_tcp_server():
    """Thread target: runs tcp_server accept loop until stopped."""
    global server_running
    try:
        run_automated_server()
    finally:
        server_running = False


def _stop_tcp_unlocked() -> None:
    """Stop TCP server (caller must hold servers_lock)."""
    global server_running, server_thread
    stop_tcp_server()
    if server_thread and server_thread.is_alive():
        server_thread.join(timeout=3.0)
    server_running = False
    server_thread = None


def _stop_tcp() -> dict:
    """API: stop TCP receiver on this PC only."""
    with servers_lock:
        _stop_tcp_unlocked()

    return {
        "running": False,
        "message": "TCP server stopped on this PC",
    }


def _start_tcp() -> dict:
    """API: start TCP receiver thread on this PC only."""
    global server_running, server_thread
    local_ip = get_local_ip()
    address = f"{local_ip}:{TCP_PORT}"

    with servers_lock:
        if _tcp_running():
            return {
                "running": True,
                "local_ip": local_ip,
                "address": address,
                "message": f"TCP server already running on this PC at {address}",
            }

        if server_thread and server_thread.is_alive():
            _stop_tcp_unlocked()

        server_thread = threading.Thread(target=_run_tcp_server, daemon=True)
        server_thread.start()

        if not wait_tcp_ready(5.0):
            _stop_tcp_unlocked()
            return {
                "running": False,
                "local_ip": local_ip,
                "address": address,
                "message": "TCP server failed to start on this PC (timed out)",
            }

        bind_error = get_tcp_bind_error()
        if bind_error:
            _stop_tcp_unlocked()
            return {
                "running": False,
                "local_ip": local_ip,
                "address": address,
                "message": f"TCP server failed to start on this PC: {bind_error}",
            }

        server_running = True
        return {
            "running": True,
            "local_ip": local_ip,
            "address": address,
            "message": f"TCP server started on this PC at {address}",
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
                        "running": _tcp_running(),
                        "port": TCP_PORT,
                        "address": f"{detected_ip}:{TCP_PORT}",
                        "save_dir": DEFAULT_SAVE_DIR,
                    },
                    "active_transfers": stats["sent_active"],
                    "stats": stats,
                },
            )

        if path == "/api/receiver/check":
            qs = parse_qs(urlparse(self.path).query)
            host = qs.get("host", [""])[0].strip()
            port_raw = qs.get("port", [str(TCP_PORT)])[0].strip()
            if not host:
                return _error(self, "Missing host query parameter")
            try:
                port = int(port_raw) if port_raw else TCP_PORT
            except ValueError:
                return _error(self, "Invalid port")
            ok, message = _probe_tcp_receiver(host, port)
            return _json_response(
                self, {"reachable": ok, "host": host, "port": port, "message": message}
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
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
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
            if path.endswith("/start"):
                result = _start_tcp()
                return _json_response(
                    self,
                    {
                        "message": result["message"],
                        "running": result["running"],
                        "local_ip": result["local_ip"],
                        "address": result["address"],
                        "api_running": True,
                    },
                    status=200 if result["running"] else 409,
                )

            result = _stop_tcp()
            return _json_response(
                self,
                {
                    "message": result["message"],
                    "running": result["running"],
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

            host = fields.get("host", {}).get("content", b"127.0.0.1").decode().strip()
            if not host:
                host = "127.0.0.1"
            port_raw = fields.get("port", {}).get("content", b"").decode().strip()
            try:
                port = int(port_raw) if port_raw else TCP_PORT
            except ValueError:
                return _error(self, "Invalid port number")

            reachable, probe_msg = _probe_tcp_receiver(host, port)
            if not reachable:
                return _error(self, probe_msg, 503)

            file_data = fields["file"]["content"]
            safe_name = os.path.basename(fields["file"].get("filename") or "upload.bin")

            os.makedirs(DEFAULT_SAVE_DIR, exist_ok=True)
            upload_dir = os.path.join(DEFAULT_SAVE_DIR, "_uploads")
            os.makedirs(upload_dir, exist_ok=True)

            job_id = str(uuid.uuid4())
            temp_path = os.path.join(upload_dir, f"{job_id}_{safe_name}")

            with open(temp_path, "wb") as f:
                f.write(file_data)

            with jobs_lock:
                transfer_jobs[job_id] = {
                    "id": job_id,
                    "status": "queued",
                    "protocol": "tcp",
                    "host": host,
                    "port": port,
                    "filename": safe_name,
                    "filesize": len(file_data),
                    "sent": 0,
                    "progress": 0,
                    "created_at": datetime.now().isoformat(),
                }

            threading.Thread(
                target=_send_file_tcp, args=(job_id, host, port, temp_path, safe_name), daemon=True
            ).start()

            return _json_response(self, {"job_id": job_id, "message": "Transfer started"})

        return _error(self, "Not found", 404)


def run_http_server():
    """Entry point: start HTTP server on port 8001."""
    os.makedirs(DEFAULT_SAVE_DIR, exist_ok=True)
    server = ThreadingHTTPServer((HTTP_HOST, HTTP_PORT), TransferAPIHandler)
    ui_status = "built" if STATIC_DIR.is_dir() else "not built (see GUI_README.md)"
    print(f"[API] Transfer System running on http://127.0.0.1:{HTTP_PORT}")
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
