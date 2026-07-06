import socket
import os
import threading
import time
from datetime import datetime
from collections import defaultdict

# --- CONFIG ---
DEFAULT_SAVE_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "received_files")
DEFAULT_HOST = '0.0.0.0'
DEFAULT_PORT = 9998
BUFFER_SIZE = 4096

# --- SYNCHRONIZATION ---
log_lock = threading.Lock()
transfer_semaphore = threading.Semaphore(3)
stats_condition = threading.Condition()
total_files_received = 0

# Track active transfers: addr -> (file, filesize, received, file_handle)
active_transfers = {}
transfers_lock = threading.Lock()

def safe_log(message):
    with log_lock:
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp} UDP LOG] {message}")

def monitor_stats():
    global total_files_received
    while True:
        with stats_condition:
            stats_condition.wait()
            safe_log(f"MONITOR: Total files received: {total_files_received}")

def run_udp_server():
    if not os.path.exists(DEFAULT_SAVE_DIR):
        os.makedirs(DEFAULT_SAVE_DIR)
        safe_log(f"Created directory: {DEFAULT_SAVE_DIR}")
    
    threading.Thread(target=monitor_stats, daemon=True).start()
    
    udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp_socket.bind((DEFAULT_HOST, DEFAULT_PORT))
    udp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 2*1024*1024)
    
    safe_log(f"UDP Server LIVE on {DEFAULT_HOST}:{DEFAULT_PORT}")
    safe_log(f"Saving to: {DEFAULT_SAVE_DIR}")
    safe_log("Using Lock + Semaphore(3) + Condition + Transfer Tracking")
    
    while True:
        try:
            data, addr = udp_socket.recvfrom(BUFFER_SIZE)
            key = addr
            
            with transfers_lock:
                if key not in active_transfers:
                    # Try to parse as new header
                    try:
                        header_str = data.decode('utf-8').strip()
                        if '|' in header_str:
                            filename, filesize_str = header_str.split('|', 1)
                            filesize = int(filesize_str)
                            filename = os.path.basename(filename)
                            filepath = os.path.join(DEFAULT_SAVE_DIR, filename)
                            
                            f = open(filepath, 'wb')
                            active_transfers[key] = {
                                'file': f,
                                'filename': filename,
                                'filesize': filesize,
                                'received': 0,
                                'start_time': time.time()
                            }
                            safe_log(f"New transfer: {filename} ({filesize} bytes) from {addr}")
                            continue
                    except:
                        pass
                
                # Handle data chunk for active transfer
                if key in active_transfers:
                    transfer = active_transfers[key]
                    transfer['file'].write(data)
                    transfer['received'] += len(data)
                    
                    if transfer['received'] >= transfer['filesize']:
                        transfer['file'].close()
                        with stats_condition:
                            global total_files_received
                            total_files_received += 1
                            stats_condition.notify()
                        safe_log(f"SUCCESS: Received {transfer['filename']} ({transfer['received']} bytes) from {addr}")
                        del active_transfers[key]
                    
                    # Timeout cleanup
                    if time.time() - transfer['start_time'] > 30:
                        transfer['file'].close()
                        safe_log(f"Timeout: {transfer['filename']} from {addr}")
                        del active_transfers[key]
                        
        except Exception as e:
            safe_log(f"Server error: {e}")

if __name__ == "__main__":
    safe_log("Starting UDP File Transfer Server...")
    run_udp_server()