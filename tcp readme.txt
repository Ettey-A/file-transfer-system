=======================================
    TCP FILE TRANSFER APPLICATION
=======================================

Files:
- tcp_server.py     → Receiver (Server)
- tcp_client2.py    → Sender (Client)

How to Use:

1. RECEIVER (Server PC)
   - Run this command:
     python tcp_server.py

   - Keep this window open. It will listen for incoming files.


2. SENDER (Client PC)
   - Run this command:
     python tcp_client2.py "full\path\to\file" [SERVER_IP]

   Example:
     python tcp_client2.py "C:\Users\HP\Downloads\document.pdf" 10.195.107.213


Important Notes:
- Both PCs must be on the same network
- Use the Server PC's current IP address (run ipconfig to check)
- Files will be saved in: Downloads\received_files folder
- You can send multiple files from different PCs

Troubleshooting:
- If connection fails, restart the server and try again
- Make sure firewall allows Python or port 9999

Good luck with the GUI part!