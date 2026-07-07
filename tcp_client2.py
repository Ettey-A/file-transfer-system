"""
Command-line TCP file sender.
Uses the same wire protocol as the web UI (api_server._send_file_tcp).
"""

import socket  # Low-level TCP networking
import os      # File path and size checks
import sys     # Read command-line arguments
import time    # Short pause after sending header


def send_file(host="127.0.0.1", port=9999, filepath=None):
    # Stop if no file path was given or the path does not exist on disk
    if not filepath or not os.path.exists(filepath):
        print("File not found!")
        return

    # Use only the base name (no folders) in the protocol header
    filename = os.path.basename(filepath)
    # Byte length of the file — receiver knows when to stop reading
    filesize = os.path.getsize(filepath)

    # Create a TCP (stream) socket for IPv4
    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        # Connect to the receiver's IP and port (default 9999)
        print(f"Connecting to {host}:{port}...")
        client.connect((host, port))

        # Step 1 of protocol: send "filename|filesize" as UTF-8 text
        header = f"{filename}|{filesize}"
        client.sendall(header.encode("utf-8"))
        print(f"Sending: {filename} ({filesize} bytes)")

        # Brief pause so receiver can parse header before data arrives
        time.sleep(0.1)

        # Step 2 of protocol: send raw file bytes in 4 KB chunks
        with open(filepath, "rb") as f:
            while True:
                chunk = f.read(4096)  # Read next chunk from disk
                if not chunk:           # End of file
                    break
                client.sendall(chunk)   # Send chunk over TCP

        print(f"Successfully sent {filename}")
    except Exception as e:
        # Connection refused, timeout, or network error
        print(f"Connection failed: {e}")
    finally:
        client.close()  # Always release the socket


# --- Run from terminal: python tcp_client2.py <file> [ip] ---
if __name__ == "__main__":
    # Require at least a file path argument
    if len(sys.argv) < 2:
        print("Usage: python tcp_client2.py <filepath> [server_ip]")
        sys.exit(1)

    filepath = sys.argv[1]                                    # First arg: file to send
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"  # Second arg: receiver IP (optional)
    send_file(host=host, filepath=filepath)
