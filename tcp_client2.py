import socket
import os
import sys
import time

def send_file(host='127.0.0.1', port=9999, filepath=None):
    if not filepath or not os.path.exists(filepath):
        print("❌ File not found!")
        return

    filename = os.path.basename(filepath)
    filesize = os.path.getsize(filepath)
    
    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        print(f"Connecting to {host}:{port}...")
        client.connect((host, port))
        
        header = f"{filename}|{filesize}"
        client.sendall(header.encode('utf-8'))
        print(f"📤 Sending: {filename} ({filesize} bytes)")
        
        time.sleep(0.1)
        
        with open(filepath, 'rb') as f:
            while True:
                chunk = f.read(4096)
                if not chunk: break
                client.sendall(chunk)
        
        print(f"✅ Successfully sent {filename}")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tcp_client.py <filepath> [server_ip]")
        sys.exit(1)
    
    filepath = sys.argv[1]
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    
    send_file(host=host, filepath=filepath)