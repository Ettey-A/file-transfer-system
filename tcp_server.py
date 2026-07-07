import socket
import os
import threading
import time
from datetime import datetime

# --- CONFIGURATION ---
DEFAULT_SAVE_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "received_files")
DEFAULT_HOST = '0.0.0.0'
DEFAULT_PORT = 9999
BUFFER_SIZE = 4096
HEADER_SIZE = 1024

# --- SYNCHRONIZATION MECHANISMS ---
log_lock = threading.Lock()
transfer_semaphore = threading.Semaphore(3)
stats_condition = threading.Condition()
total_files_received = 0

_shutdown = threading.Event()
_listen_socket = None
_ready = threading.Event()
_bind_error = None
_monitor_started = False


def stop_tcp_server():
    """Signal the TCP listener to stop and release the port."""
    _shutdown.set()
    sock = _listen_socket
    if sock is not None:
        try:
            sock.close()
        except OSError:
            pass


def wait_tcp_ready(timeout: float = 5.0) -> bool:
  return _ready.wait(timeout)


def get_tcp_bind_error():
  return _bind_error

def safe_log(message):
    with log_lock:
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp} LOG] {message}")

def monitor_stats():
    global total_files_received
    while True:
        with stats_condition:
            stats_condition.wait()
            safe_log(f"MONITOR: Total files received: {total_files_received}")

def handle_client(client_socket, addr):
    global total_files_received
    with transfer_semaphore:
        try:
            safe_log(f"Connection from {addr}")

            # Robust header parsing
            header_data = b''
            while b'|' not in header_data:
                chunk = client_socket.recv(HEADER_SIZE)
                if not chunk:
                    raise ValueError("Client disconnected before header")
                header_data += chunk

            pipe_idx = header_data.index(b"|")
            filename = os.path.basename(header_data[:pipe_idx].decode("utf-8").strip())
            rest = header_data[pipe_idx + 1 :]

            size_digits = bytearray()
            extra_start = len(rest)
            for i, byte in enumerate(rest):
                if 48 <= byte <= 57:
                    size_digits.append(byte)
                else:
                    extra_start = i
                    break
            filesize = int(size_digits) if size_digits else 0
            initial_data = rest[extra_start:]

            filepath = os.path.join(DEFAULT_SAVE_DIR, filename)

            received = 0
            with open(filepath, "wb") as f:
                if initial_data:
                    f.write(initial_data)
                    received += len(initial_data)
                while received < filesize:
                    chunk = client_socket.recv(BUFFER_SIZE)
                    if not chunk: break
                    f.write(chunk)
                    received += len(chunk)

            if received == filesize:
                with stats_condition:
                    total_files_received += 1
                    stats_condition.notify()
                safe_log(f"✅ Successfully received {filename} ({received} bytes) from {addr}")
            else:
                safe_log(f"⚠️ Incomplete transfer: {filename} ({received}/{filesize} bytes)")

        except Exception as e:
            safe_log(f"❌ Error from {addr}: {e}")
        finally:
            client_socket.close()

def run_automated_server():
    global _listen_socket, _bind_error, _monitor_started

    _shutdown.clear()
    _ready.clear()
    _bind_error = None

    if not os.path.exists(DEFAULT_SAVE_DIR):
        os.makedirs(DEFAULT_SAVE_DIR)
        safe_log(f"Created directory: {DEFAULT_SAVE_DIR}")

    if not _monitor_started:
        threading.Thread(target=monitor_stats, daemon=True).start()
        _monitor_started = True

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        _listen_socket = server
        server.bind((DEFAULT_HOST, DEFAULT_PORT))
        server.listen(10)
        safe_log(f"🚀 Server LIVE on {DEFAULT_HOST}:{DEFAULT_PORT}")
        safe_log(f"📁 Saving to: {DEFAULT_SAVE_DIR}")
        safe_log("🔒 Synchronization: Lock + Semaphore(3) + Condition active")
        _ready.set()

        server.settimeout(1.0)
        while not _shutdown.is_set():
            try:
                conn, addr = server.accept()
                threading.Thread(target=handle_client, args=(conn, addr), daemon=True).start()
            except socket.timeout:
                continue
            except OSError:
                if _shutdown.is_set():
                    break
                raise

    except KeyboardInterrupt:
        safe_log("🛑 Server shutting down...")
    except Exception as e:
        _bind_error = str(e)
        safe_log(f"Server error: {e}")
        _ready.set()
    finally:
        _listen_socket = None
        try:
            server.close()
        except OSError:
            pass

if __name__ == "__main__":
    safe_log("Starting improved TCP file transfer server...")
    run_automated_server()