# Transfer System — Web UI

Professional React + Shadcn UI dashboard for the TCP file transfer backend.

**No pip required.** The API uses only Python's built-in standard library.

## Architecture

```
Browser (port 8001)  →  api_server.py (stdlib HTTP)  →  TCP sockets
```

One command starts both the API and the web UI.

## Quick Start (no pip)

### 1. Start everything (recommended)

Double-click **`start.bat`** (Windows) or run:

```bash
python start.py
```

This automatically:
- Starts `api_server.py`
- Opens the UI in your browser at http://127.0.0.1:8001

No pip required.

### 2. Manual API only (optional)

```bash
python api_server.py
```

### 3. Building the UI (one-time, needs Node.js)

```bash
cd frontend
npm install
npm run build
```

Then restart `python api_server.py`.

> **Note:** `npm` is only needed to *build* the React UI, not to run the app day-to-day.

## Optional: Vercel hosting

See `VERCEL.md`. Each user connects their own PC via ngrok — servers are independent per machine.

## Optional: Development mode

For live-reload while editing the React code:

```bash
# Terminal 1
python api_server.py

# Terminal 2
cd frontend && npm run dev
```

Dev UI: http://localhost:5173 (proxies API to port 8001)

## Features

- **Receiver panel** — Start/stop TCP server (port 9999)
- **Send files** — Drag-and-drop upload with IP and port configuration
- **Live progress** — Real-time transfer progress bar
- **Received files** — Browse and download files saved to `~/Downloads/received_files`
- **Transfer history** — View recent send operations

## Usage Flow

1. On the **receiver** machine: open the UI → Start TCP server
2. On the **sender** machine: open the UI → select file → enter receiver IP → Send
3. Received files appear in the Received Files panel

## Files

| File | Purpose |
|------|---------|
| `api_server.py` | HTTP API + UI server (stdlib only) |
| `tcp_server.py` | TCP receiver |
| `frontend/dist/` | Built React UI (served automatically) |

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Shadcn UI
- **Backend:** Python `http.server` (no FastAPI, no uvicorn, no pip)
- **Transfer:** `tcp_server.py`, socket clients
