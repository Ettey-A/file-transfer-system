import socket
import os
import sys
import time

def send_file_udp(host='127.0.0.1', port=9998, filepath=None):
    if not filepath or not os.path.exists(filepath):
        print("❌ File not found!")
        return

    filename = os.path.basename(filepath)
    filesize = os.path.getsize(filepath)
    
    udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        print(f"Connecting to UDP server {host}:{port}...")
        
        # Send header
        header = f"{filename}|{filesize}"
        udp_socket.sendto(header.encode('utf-8'), (host, port))
        print(f"📤 Sending: {filename} ({filesize} bytes)")
        
        time.sleep(0.2)   # Increased delay so server can start tracking the transfer
        
        # Send file data
        sent = 0
        with open(filepath, 'rb') as f:
            while True:
                chunk = f.read(4096)
                if not chunk:
                    break
                udp_socket.sendto(chunk, (host, port))
                sent += len(chunk)
                if sent % (4096 * 100) == 0:   # Progress every ~400KB
                    print(f"📤 Progress: {sent}/{filesize} bytes")
        
        print(f"✅ File sent successfully: {filename}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        udp_socket.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python udp_client.py <filepath> [server_ip]")
        sys.exit(1)
    
    filepath = sys.argv[1]
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    send_file_udp(host=host, filepath=filepath)