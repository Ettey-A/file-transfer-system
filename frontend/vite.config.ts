/**
 * Vite dev server config.
 * - Proxies /api → localhost:8001
 * - Optionally auto-starts api_server.py during npm run dev
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function pythonApiPlugin(): Plugin {
  let proc: ChildProcess | null = null;
  const root = path.resolve(__dirname, ".."); // Project root (parent of frontend/)

  return {
    name: "python-api-server",
    configureServer() {
      const python = process.platform === "win32" ? "python" : "python3";
      proc = spawn(python, ["api_server.py"], { cwd: root, stdio: "inherit" });
      console.log("[vite] Started api_server.py on port 8001");
    },
    closeBundle() {
      proc?.kill();
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
        target: "http://127.0.0.1:8001", // Forward to Python API
        changeOrigin: true,
      },
    },
  },
}));
