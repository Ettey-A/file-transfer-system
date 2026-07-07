#!/usr/bin/env python3
"""
One-click launcher: starts api_server.py and opens the web UI in a browser.
"""

import os           # Paths to api_server.py
import subprocess   # Spawn API as child process
import sys          # Parse --server flag
import threading    # Open browser without blocking
import time         # Wait for API to become ready
import urllib.error
import urllib.request  # Poll /api/health
import webbrowser      # Open http://127.0.0.1:8001

# Folder containing this script and api_server.py
ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8001  # Must match HTTP_PORT in api_server.py
URL = f"http://127.0.0.1:{PORT}"  # Address shown to the user


def api_running() -> bool:
    """Return True if api_server is already responding on port 8001."""
    try:
        urllib.request.urlopen(f"{URL}/api/health", timeout=1)
        return True
    except (urllib.error.URLError, TimeoutError, OSError):
        return False  # Not running or not reachable yet


def wait_for_api(timeout: float = 15) -> bool:
    """Poll /api/health every 200 ms until success or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if api_running():
            return True
        time.sleep(0.2)
    return False  # Timed out waiting for API


def spawn_api_server() -> subprocess.Popen:
    """Start api_server.py in the background (separate process)."""
    return subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "api_server.py")],  # python api_server.py
        cwd=ROOT,                    # Working directory = project root
        stdout=subprocess.DEVNULL,   # Hide child stdout
        stderr=subprocess.DEVNULL,   # Hide child stderr
    )


def open_browser():
    """Wait briefly, then open the dashboard in the default browser."""
    time.sleep(0.8)
    webbrowser.open(URL)


def run_server():
    """Run API in the current process (foreground, no browser)."""
    import api_server

    api_server.run_http_server()


def main():
    # python start.py --server → API only, no browser
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        run_server()
        return

    proc = None  # Child process handle (if we started one)

    if not api_running():
        # API not up yet — start it
        print("[Launcher] Starting api_server.py...")
        proc = spawn_api_server()
        if not wait_for_api():
            print("[Launcher] Failed to start api_server.py")
            if proc:
                proc.terminate()
            sys.exit(1)
        print("[Launcher] API server is running")
    else:
        # User already has api_server running
        print("[Launcher] API server already running")

    # Open browser in a background thread so main can wait on the API process
    threading.Thread(target=open_browser, daemon=True).start()
    print(f"[Launcher] Open {URL} in your browser")
    print("[Launcher] Press Ctrl+C to stop")

    try:
        if proc:
            proc.wait()  # Block until child API process exits
        else:
            while True:
                time.sleep(1)  # API was already running — just keep launcher alive
    except KeyboardInterrupt:
        print("\n[Launcher] Stopping...")
        if proc:
            proc.terminate()  # Stop child API if we started it


if __name__ == "__main__":
    main()
