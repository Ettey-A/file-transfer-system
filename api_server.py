"""
HTTP API for the file transfer system.
Uses only Python standard library — no pip packages required.

Run: python api_server.py
Then open: http://127.0.0.1:8001
"""

import json
import mimetypes
import os
import re
import socket
import threading
import time
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from tcp_server import (
    DEFAULT_SAVE_DIR,
    DEFAULT_PORT as TCP_PORT,
    get_tcp_bind_error,
    run_automated_server,
    stop_tcp_server,
    wait_tcp_ready,
)
from udp_server import (
    DEFAULT_PORT as UDP_PORT,
    get_udp_bind_error,
    run_udp_server,
    stop_udp_server,
    wait_udp_ready,
)

HTTP_HOST = "0.0.0.0"
HTTP_PORT = 8001
BUFFER_SIZE = 4096
STATIC_DIR = Path(__file__).resolve().parent / "frontend" / "dist"

server_threads: dict[str, threading.Thread] = {}
server_running: dict[str, bool] = {"tcp": False, "udp": False}
transfer_jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


def get_local_ip() -> str:
    """Detect this PC's LAN IP address (stdlib only, no backend changes)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"


def _json_response(handler: BaseHTTPRequestHandler, data: dict, status: int = 200):
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    _send_cors(handler)
    handler.end_headers()
    handler.wfile.write(body)


def _error(handler: BaseHTTPRequestHandler, message: str, status: int = 400):
    _json_response(handler, {"detail": message}, status)


def _send_cors(handler: BaseHTTPRequestHandler):
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


def _read_body(handler: BaseHTTPRequestHandler) -> bytes:
    length = int(handler.headers.get("Content-Length", 0))
    return handler.rfile.read(length) if length else b""


def _read_json(handler: BaseHTTPRequestHandler) -> dict:
    body = _read_body(handler)
    if not body:
        return {}
    return json.loads(body.decode("utf-8"))


def _format_size(size: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f} {unit}" if unit != "B" else f"{size} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def _parse_multipart(content_type: str, body: bytes) -> dict[str, dict]:
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


CONNECT_TIMEOUT = 10
TRANSFER_TIMEOUT = 120


def _send_file_tcp(job_id: str, host: str, port: int, filepath: str, filename: str):
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
    try:
        client.settimeout(CONNECT_TIMEOUT)
        client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        client.connect((host, port))
        client.settimeout(TRANSFER_TIMEOUT)

        header = f"{filename}|{filesize}"
        client.sendall(header.encode("utf-8"))
        time.sleep(0.15)

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
        with jobs_lock:
            transfer_jobs[job_id].update(
                {
                    "status": "failed",
                    "error": f"Timed out connecting or sending to {host}:{port}. Check receiver IP and that TCP server is started.",
                }
            )
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
            os.remove(filepath)
        except OSError:
            pass


def _send_file_udp(job_id: str, host: str, port: int, filepath: str, filename: str):
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

    udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        udp_socket.settimeout(TRANSFER_TIMEOUT)
        header = f"{filename}|{filesize}"
        udp_socket.sendto(header.encode("utf-8"), (host, port))
        time.sleep(0.2)

        sent = 0
        with open(filepath, "rb") as f:
            while True:
                chunk = f.read(BUFFER_SIZE)
                if not chunk:
                    break
                udp_socket.sendto(chunk, (host, port))
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
        with jobs_lock:
            transfer_jobs[job_id].update(
                {
                    "status": "failed",
                    "error": f"UDP transfer timed out sending to {host}:{port}.",
                }
            )
    except OSError as e:
        with jobs_lock:
            transfer_jobs[job_id].update(
                {
                    "status": "failed",
                    "error": f"Cannot send UDP to {host}:{port}. ({e})",
                }
            )
    except Exception as e:
        with jobs_lock:
            transfer_jobs[job_id].update({"status": "failed", "error": str(e)})
    finally:
        udp_socket.close()
        try:
            os.remove(filepath)
        except OSError:
            pass


def _is_listable_file(name: str) -> bool:
    """Hide temp upload artifacts from the received-files list."""
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
    received_files, _ = _collect_received_files()
    sent = _transfer_stats()
    return {
        "sent_total": sent["total"],
        "sent_completed": sent["completed"],
        "sent_failed": sent["failed"],
        "sent_active": sent["active"],
        "received_total": len(received_files),
    }


def _run_tcp_server():
    try:
        run_automated_server()
    finally:
        server_running["tcp"] = False


def _run_udp_server():
    try:
        run_udp_server()
    finally:
        server_running["udp"] = False


def _stop_protocol(protocol: str) -> dict:
    """Stop a TCP or UDP receiver thread and release its port."""
    protocol = protocol.lower()
    if protocol == "tcp":
        stop_tcp_server()
    else:
        stop_udp_server()

    thread = server_threads.get(protocol)
    if thread and thread.is_alive():
        thread.join(timeout=3.0)

    server_running[protocol] = False
    server_threads.pop(protocol, None)

    return {
        "protocol": protocol,
        "running": False,
        "message": f"{protocol.upper()} server stopped",
    }


def _start_protocol(protocol: str) -> dict:
    """Start a TCP or UDP receiver thread."""
    protocol = protocol.lower()
    local_ip = get_local_ip()
    port = TCP_PORT if protocol == "tcp" else UDP_PORT
    address = f"{local_ip}:{port}"

    thread = server_threads.get(protocol)
    if server_running[protocol] and thread and thread.is_alive():
        return {
            "protocol": protocol,
            "running": True,
            "local_ip": local_ip,
            "address": address,
            "message": f"{protocol.upper()} server already running at {address}",
        }

    if thread and thread.is_alive():
        _stop_protocol(protocol)

    if protocol == "tcp":
        target = _run_tcp_server
        wait_ready = wait_tcp_ready
        get_bind_error = get_tcp_bind_error
    else:
        target = _run_udp_server
        wait_ready = wait_udp_ready
        get_bind_error = get_udp_bind_error

    thread = threading.Thread(target=target, daemon=True)
    server_threads[protocol] = thread
    thread.start()

    if not wait_ready(5.0):
        _stop_protocol(protocol)
        return {
            "protocol": protocol,
            "running": False,
            "local_ip": local_ip,
            "address": address,
            "message": f"{protocol.upper()} server failed to start (timed out)",
        }

    bind_error = get_bind_error()
    if bind_error:
        _stop_protocol(protocol)
        return {
            "protocol": protocol,
            "running": False,
            "local_ip": local_ip,
            "address": address,
            "message": f"{protocol.upper()} server failed to start: {bind_error}",
        }

    server_running[protocol] = True
    return {
        "protocol": protocol,
        "running": True,
        "local_ip": local_ip,
        "address": address,
        "message": f"{protocol.upper()} server started at {address}",
    }


def _serve_static(handler: BaseHTTPRequestHandler, rel_path: str):
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
    def log_message(self, fmt, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.address_string()} - {fmt % args}")

    def do_OPTIONS(self):
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
            local_ip = get_local_ip()
            stats = _session_stats()
            return _json_response(
                self,
                {
                    "local_ip": local_ip,
                    "servers": {
                        "tcp": {
                            "running": server_running["tcp"],
                            "port": TCP_PORT,
                            "address": f"{local_ip}:{TCP_PORT}",
                            "save_dir": DEFAULT_SAVE_DIR,
                        },
                        "udp": {
                            "running": server_running["udp"],
                            "port": UDP_PORT,
                            "address": f"{local_ip}:{UDP_PORT}",
                            "save_dir": DEFAULT_SAVE_DIR,
                        },
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
            try:
                data = _read_json(self)
            except json.JSONDecodeError:
                return _error(self, "Invalid JSON body")

            protocol = str(data.get("protocol", "")).lower()
            if protocol not in ("tcp", "udp"):
                return _error(self, "Protocol must be 'tcp' or 'udp'")

            if path.endswith("/start"):
                result = _start_protocol(protocol)
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

            result = _stop_protocol(protocol)
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

            protocol = fields.get("protocol", {}).get("content", b"tcp").decode().lower()
            if protocol not in ("tcp", "udp"):
                return _error(self, "Protocol must be 'tcp' or 'udp'")

            host = fields.get("host", {}).get("content", b"127.0.0.1").decode()
            port_raw = fields.get("port", {}).get("content", b"").decode().strip()
            port = int(port_raw) if port_raw else (TCP_PORT if protocol == "tcp" else UDP_PORT)

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
                    "protocol": protocol,
                    "host": host,
                    "port": port,
                    "filename": safe_name,
                    "filesize": len(file_data),
                    "sent": 0,
                    "progress": 0,
                    "created_at": datetime.now().isoformat(),
                }

            target = _send_file_tcp if protocol == "tcp" else _send_file_udp
            threading.Thread(
                target=target, args=(job_id, host, port, temp_path, safe_name), daemon=True
            ).start()

            return _json_response(self, {"job_id": job_id, "message": "Transfer started"})

        return _error(self, "Not found", 404)


def run_http_server():
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
