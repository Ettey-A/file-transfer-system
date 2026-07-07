"""
TCP file receiver — listens on port 9999 and saves files to disk.

Protocol (must match sender):
  1. Client sends:  filename|filesize  (UTF-8 text)
  2. Client sends:  raw file bytes (exactly filesize bytes)
"""

import socket     # TCP listen/accept/receive
import os         # Create save folder, write files
import threading  # One thread per client + background monitor
import time       # (reserved for future timeouts)
from datetime import datetime  # Timestamps in log messages

# --- Where received files are saved on this PC ---
DEFAULT_SAVE_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "received_files")
DEFAULT_HOST = "0.0.0.0"   # Listen on all network interfaces
DEFAULT_PORT = 9999        # Standard TCP receiver port
BUFFER_SIZE = 4096         # Bytes per recv() when reading file body
HEADER_SIZE = 1024         # Max bytes to read while waiting for "|" in header

# --- Thread synchronization primitives (Lock + Semaphore + Condition) ---
log_lock = threading.Lock()              # Only one thread prints at a time
transfer_semaphore = threading.Semaphore(3)  # At most 3 simultaneous receives
stats_condition = threading.Condition()    # Monitor thread waits for notify()
total_files_received = 0                 # Counter incremented on success

# --- Used by api_server when user clicks Stop ---
_shutdown = threading.Event()   # Set to True to exit accept loop
_listen_socket = None           # Reference so stop() can close the port
_ready = threading.Event()      # api_server waits on this after start
_bind_error = None            # Error message if bind() fails
_monitor_started = False        # Start stats monitor thread only once


def stop_tcp_server():
    """Signal the server loop to exit and close the listening socket."""
    _shutdown.set()           # Tell accept loop to stop
    sock = _listen_socket
    if sock is not None:
        try:
            sock.close()      # Releases port 9999 immediately
        except OSError:
            pass


def wait_tcp_ready(timeout: float = 5.0) -> bool:
    """Return True when bind()+listen() succeeded (or False on timeout)."""
    return _ready.wait(timeout)


def get_tcp_bind_error():
    """Return bind error string if start failed, else None."""
    return _bind_error


def safe_log(message):
    """Thread-safe print with timestamp."""
    with log_lock:
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp} LOG] {message}")


def monitor_stats():
    """Background thread: logs when total_files_received increases."""
    global total_files_received
    while True:
        with stats_condition:
            stats_condition.wait()  # Sleep until notify() from handle_client
            safe_log(f"MONITOR: Total files received: {total_files_received}")


def handle_client(client_socket, addr):
    """Receive one file from a connected client, then close the connection."""
    global total_files_received
    with transfer_semaphore:  # Limit concurrent transfers to 3
        try:
            safe_log(f"Connection from {addr}")

            # --- Read until we have the "|" that separates filename from size ---
            header_data = b""
            while b"|" not in header_data:
                chunk = client_socket.recv(HEADER_SIZE)
                if not chunk:
                    raise ValueError("Client disconnected before header")
                header_data += chunk

            # Split "myfile.pdf|12345" into name and rest
            pipe_idx = header_data.index(b"|")
            filename = os.path.basename(header_data[:pipe_idx].decode("utf-8").strip())
            rest = header_data[pipe_idx + 1 :]  # May include size digits + first data bytes

            # Parse file size digits; anything after digits may be first chunk of file
            size_digits = bytearray()
            extra_start = len(rest)
            for i, byte in enumerate(rest):
                if 48 <= byte <= 57:  # ASCII '0'-'9'
                    size_digits.append(byte)
                else:
                    extra_start = i  # First non-digit = start of file data
                    break
            filesize = int(size_digits) if size_digits else 0
            initial_data = rest[extra_start:]  # Bytes that arrived with the header

            filepath = os.path.join(DEFAULT_SAVE_DIR, filename)

            # --- Write file: initial_data first, then recv until filesize reached ---
            received = 0
            with open(filepath, "wb") as f:
                if initial_data:
                    f.write(initial_data)
                    received += len(initial_data)
                while received < filesize:
                    chunk = client_socket.recv(BUFFER_SIZE)
                    if not chunk:
                        break  # Client closed early
                    f.write(chunk)
                    received += len(chunk)

            if received == filesize:
                with stats_condition:
                    total_files_received += 1
                    stats_condition.notify()  # Wake monitor_stats thread
                safe_log(f"Successfully received {filename} ({received} bytes) from {addr}")
            else:
                safe_log(f"Incomplete transfer: {filename} ({received}/{filesize} bytes)")

        except Exception as e:
            safe_log(f"Error from {addr}: {e}")
        finally:
            client_socket.close()  # Done with this client


def run_automated_server():
    """Bind port 9999, accept connections, spawn handle_client per connection."""
    global _listen_socket, _bind_error, _monitor_started

    _shutdown.clear()   # Fresh start
    _ready.clear()
    _bind_error = None

    if not os.path.exists(DEFAULT_SAVE_DIR):
        os.makedirs(DEFAULT_SAVE_DIR)
        safe_log(f"Created directory: {DEFAULT_SAVE_DIR}")

    if not _monitor_started:
        threading.Thread(target=monitor_stats, daemon=True).start()
        _monitor_started = True

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)  # Reuse port after stop

    try:
        _listen_socket = server
        server.bind((DEFAULT_HOST, DEFAULT_PORT))  # Listen on 0.0.0.0:9999
        server.listen(10)  # Backlog queue size
        safe_log(f"Server LIVE on {DEFAULT_HOST}:{DEFAULT_PORT}")
        safe_log(f"Saving to: {DEFAULT_SAVE_DIR}")
        safe_log("Synchronization: Lock + Semaphore(3) + Condition active")
        _ready.set()  # Tell api_server that bind succeeded

        server.settimeout(1.0)  # accept() wakes every 1s to check _shutdown
        while not _shutdown.is_set():
            try:
                conn, addr = server.accept()  # Wait for incoming client
                # Handle each client in its own thread
                threading.Thread(target=handle_client, args=(conn, addr), daemon=True).start()
            except socket.timeout:
                continue  # Normal — check shutdown flag and loop
            except OSError:
                if _shutdown.is_set():
                    break  # Socket closed by stop_tcp_server()
                raise

    except KeyboardInterrupt:
        safe_log("Server shutting down...")
    except Exception as e:
        _bind_error = str(e)  # e.g. "Address already in use"
        safe_log(f"Server error: {e}")
        _ready.set()  # Unblock api_server even on failure
    finally:
        _listen_socket = None
        try:
            server.close()
        except OSError:
            pass


if __name__ == "__main__":
    safe_log("Starting improved TCP file transfer server...")
    run_automated_server()
