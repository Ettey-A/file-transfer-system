/**
 * Vite dev server config.
 * - Proxies /api → localhost:8001
 * - Auto-starts `python start.py --server` during npm run dev / preview
 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_HEALTH_URL = "http://127.0.0.1:8001/api/health";

function apiAlreadyRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(API_HEALTH_URL, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function pythonApiPlugin(): Plugin {
  let proc: ChildProcess | null = null;
  let startedByVite = false;
  const root = path.resolve(__dirname, "..");

  const stopPython = () => {
    if (startedByVite && proc && !proc.killed) {
      proc.kill();
      proc = null;
      startedByVite = false;
    }
  };

  const startPython = async () => {
    if (proc) return;

    if (await apiAlreadyRunning()) {
      console.log("[vite] Python API already running on port 8001");
      return;
    }

    const python = process.platform === "win32" ? "python" : "python3";
    proc = spawn(python, ["start.py", "--server"], { cwd: root, stdio: "inherit" });
    startedByVite = true;
    console.log("[vite] Started python start.py --server on port 8001");

    proc.on("exit", () => {
      proc = null;
      startedByVite = false;
    });
  };

  const attachShutdown = (server: ViteDevServer | PreviewServer) => {
    server.httpServer?.on("close", stopPython);
  };

  return {
    name: "python-api-server",
    configureServer(server) {
      void startPython();
      attachShutdown(server);
    },
    configurePreviewServer(server) {
      void startPython();
      attachShutdown(server);
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), ...(command === "serve" ? [pythonApiPlugin()] : [])],
  root: path.resolve(__dirname),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
    },
  },
}));
