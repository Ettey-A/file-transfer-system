import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function pythonApiPlugin(): Plugin {
  let proc: ChildProcess | null = null;
  const root = path.resolve(__dirname, "..");

  return {
    name: "python-api-server",
    configureServer() {
      const python = process.platform === "win32" ? "python" : "python3";
      proc = spawn(python, ["api_server.py"], {
        cwd: root,
        stdio: "inherit",
      });
      console.log("[vite] Started api_server.py on port 8001");
    },
    closeBundle() {
      proc?.kill();
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pythonApiPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
});
