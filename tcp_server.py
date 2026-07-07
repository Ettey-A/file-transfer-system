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
    if not os.path.exists(DEFAULT_SAVE_DIR):
        os.makedirs(DEFAULT_SAVE_DIR)
        safe_log(f"Created directory: {DEFAULT_SAVE_DIR}")
    
    threading.Thread(target=monitor_stats, daemon=True).start()
    
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    
    try:
        server.bind((DEFAULT_HOST, DEFAULT_PORT))
        server.listen(10)
        safe_log(f"🚀 Server LIVE on {DEFAULT_HOST}:{DEFAULT_PORT}")
        safe_log(f"📁 Saving to: {DEFAULT_SAVE_DIR}")
        safe_log("🔒 Synchronization: Lock + Semaphore(3) + Condition active")

        while True:
            conn, addr = server.accept()
            threading.Thread(target=handle_client, args=(conn, addr), daemon=True).start()
            
    except KeyboardInterrupt:
        safe_log("🛑 Server shutting down...")
    except Exception as e:
        safe_log(f"Server error: {e}")
    finally:
        server.close()

if __name__ == "__main__":
    safe_log("Starting improved TCP file transfer server...")
    run_automated_server()