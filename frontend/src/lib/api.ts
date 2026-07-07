// HTTP client for api_server.py — all paths append to getApiBase()
import { getApiBase, usesDirectNgrok } from "./config";

export interface ServerInfo {
  running: boolean;
  port: number;
  address: string;
  save_dir: string;
}

export interface SessionStats {
  sent_total: number;
  sent_completed: number;
  sent_failed: number;
  sent_active: number;
  received_total: number;
}

export interface SystemStatus {
  local_ip: string;
  detected_ip: string;
  detected_ips?: string[];
  server: ServerInfo;
  active_transfers: number;
  stats: SessionStats;
}

export interface TransferStats {
  total: number;
  completed: number;
  failed: number;
  active: number;
}

export interface ReceivedFile {
  name: string;
  size: number;
  size_formatted: string;
  modified: string;
}

export interface TransferJob {
  id: string;
  status: "queued" | "connecting" | "transferring" | "completed" | "failed";
  protocol: string;
  host: string;
  port: number;
  filename: string;
  filesize: number;
  sent: number;
  progress: number;
  created_at: string;
  completed_at?: string;
  error?: string;
}

function requestHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (usesDirectNgrok()) {
    headers.set("ngrok-skip-browser-warning", "true");
  }
  return headers;
}

/** Shared fetch wrapper — throws if API base missing or HTTP error. */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const base = getApiBase();
  if (!base) {
    throw new Error(
      "Connect to the transfer server first — paste your ngrok URL or configure BACKEND_URL on Vercel."
    );
  }
  const headers = requestHeaders(options?.headers);
  const res = await fetch(`${base}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.message || "Request failed");
  }
  return res.json();
}

export const api = {
  getStatus: () => request<SystemStatus>("/status"),

  startServer: () => {
    const headers = requestHeaders({ "Content-Type": "application/json" });
    return request<{
      message: string;
      running: boolean;
      local_ip: string;
      detected_ip?: string;
      detected_ips?: string[];
      address: string;
      api_running: boolean;
    }>("/server/start", {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
  },

  stopServer: () => {
    const headers = requestHeaders({ "Content-Type": "application/json" });
    return request<{ message: string; running: boolean }>("/server/stop", {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
  },

  listFiles: () =>
    request<{ files: ReceivedFile[]; directory: string; count: number }>("/files"),

  downloadFile: (filename: string) =>
    `${getApiBase()}/files/download/${encodeURIComponent(filename)}`,

  downloadFileBlob: async (filename: string) => {
    const base = getApiBase();
    if (!base) throw new Error("API not connected");
    const headers = requestHeaders();
    const res = await fetch(`${base}/files/download/${encodeURIComponent(filename)}`, {
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Download failed");
    }
    return res.blob();
  },

  transferFile: (file: File, host: string, port: number) => {
    const form = new FormData();
    form.append("file", file);
    form.append("host", host);
    form.append("port", String(port));
    return request<{ job_id: string; message: string }>("/transfer", {
      method: "POST",
      body: form,
    });
  },

  checkReceiver: (host: string, port: number) =>
    request<{ reachable: boolean; host: string; port: number; message: string }>(
      `/receiver/check?host=${encodeURIComponent(host)}&port=${encodeURIComponent(String(port))}`
    ),

  getTransfer: (jobId: string) => request<TransferJob>(`/transfer/${jobId}`),

  listTransfers: () =>
    request<{
      transfers: TransferJob[];
      stats: TransferStats;
      received_count: number;
    }>("/transfers"),

  health: () => request<{ status: string }>("/health"),
};
