 UDP File Transfer Application - Group 3

 Project Description
Presentation Topic: Synchronization mechanisms: locks, semaphores, and conditions

Project Goal: Build a simple file transfer application using UDP sockets for unreliable file transfer.

This implementation allows users to send files between two computers over a network using UDP.

---

 Files Included

- `udp_client.py` - Client (sender)
- `udp_server.py` - Server (receiver)
- `README.md` - This file

---

 Features

- Transfer any type of file (documents, images, videos, etc.)
- Header-based transfer (`filename|filesize`)
- Chunked sending (4096 bytes per packet)
- Concurrent transfer support (limited to 3 simultaneous transfers using Semaphore)
- Thread-safe logging using Lock
- Statistics monitoring using Condition Variable
- Automatic directory creation for received files
- Progress feedback on client side

---

 How to Use

1. Start the Server (Receiver)

Open PowerShell / Terminal and run:

```powershell
cd Downloads
python udp_server.py
```

You should see output like:
```
[13:28:03 UDP LOG] UDP Server LIVE on 0.0.0.0:9998
[13:28:03 UDP LOG] Saving to: C:\Users\ocran\Downloads\received_files
```

The server will listen on port 9998.

 2. Send a File (Sender)

In another terminal window:

```powershell
python udp_client.py <path_to_file> [optional_server_ip]
```

Examples:

```powershell
 Send to localhost (same computer)
python udp_client.py "Jane_Ashon_CV.docx"

 Send to another computer
python udp_client.py "WhatsApp Image.jpg" 10.195.107.102
```

---

 Expected Output

Server:
- "New transfer started..."
- "SUCCESS: Received filename (size bytes) ..."

Client:
- Sending progress messages
- "✅ File sent successfully"

Received files are saved in:  
`~/Downloads/received_files/`



Configuration Options

You can modify these constants at the top of the files:

```python
DEFAULT_PORT = 9998
BUFFER_SIZE = 4096
DEFAULT_SAVE_DIR = ...   # Change save location
```


 Synchronization Mechanisms Used (For Report)

- `threading.Lock()` → Protects logging (`safe_log`)
- `threading.Semaphore(3)` → Limits maximum concurrent file transfers
- `threading.Condition()` → Notifies monitor thread when a file is completed
- Main receive loop + dictionary for tracking active transfers



 GUI Integration Notes (For Colleague)

Recommended Way:

1. Import the client function:
   ```python
   from udp_client import send_file_udp
   ```

2. Run the server in a background thread:
   ```python
   import threading
   threading.Thread(target=run_udp_server, daemon=True).start()
   ```

3. Call `send_file_udp(filepath, host)` when user clicks Send button.

4. (Optional) I can add callback support for real-time progress if needed.

Important: 
- UDP is **unreliable** — packets may be lost on bad networks.
- Use the same port (9998) on both sides.
- Firewall must allow UDP traffic on port 9998.



Troubleshooting

| Problem                        | Solution |
|-------------------------------|---------|
| `WinError 10040`              | Already fixed in current version |
| Connection refused            | Check server is running + correct IP |
| File incomplete               | Try on same WiFi / stable network |
| Permission error              | Run as administrator or check folder permissions |
| Port already in use           | Change `DEFAULT_PORT` in both files |


Future Improvements (Optional)

- Add sequence numbers + retransmission
- Progress bar with percentage
- File integrity check (MD5)
- GUI-friendly logging / events


Prepared by: Jane  
Date: July 2026

Feel free to reach out if you need any changes or additional helper functions for the GUI.

Good luck with the interface!