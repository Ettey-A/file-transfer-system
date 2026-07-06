#!/usr/bin/env python3
"""
One-click launcher for the Transfer System.
Starts api_server.py automatically, then opens the UI in your browser.

Usage:
  python start.py          # start API + open browser
  python start.py --server # run API only (used internally)
"""
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8001
URL = f"http://127.0.0.1:{PORT}"


def api_running() -> bool:
    try:
        urllib.request.urlopen(f"{URL}/api/health", timeout=1)
        return True
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def wait_for_api(timeout: float = 15) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if api_running():
            return True
        time.sleep(0.2)
    return False


def spawn_api_server() -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "api_server.py")],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def open_browser():
    time.sleep(0.8)
    webbrowser.open(URL)


def run_server():
    import api_server

    api_server.run_http_server()


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        run_server()
        return

    proc = None
    if not api_running():
        print("[Launcher] Starting api_server.py...")
        proc = spawn_api_server()
        if not wait_for_api():
            print("[Launcher] Failed to start api_server.py")
            if proc:
                proc.terminate()
            sys.exit(1)
        print("[Launcher] API server is running")
    else:
        print("[Launcher] API server already running")

    threading.Thread(target=open_browser, daemon=True).start()
    print(f"[Launcher] Open {URL} in your browser")
    print("[Launcher] Press Ctrl+C to stop")

    try:
        if proc:
            proc.wait()
        else:
            while True:
                time.sleep(1)
    except KeyboardInterrupt:
        print("\n[Launcher] Stopping...")
        if proc:
            proc.terminate()


if __name__ == "__main__":
    main()
