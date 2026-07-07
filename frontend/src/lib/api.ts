// HTTP client for api_server.py — all clients share one central server URL
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
  display_name: string;
  size: number;
  size_formatted: string;
  modified: string;
}

export interface TransferJob {
  id: string;
  status: "queued" | "uploading" | "completed" | "failed";
  protocol: string;
  host: string;
  port: number;
  filename: string;
  stored_name?: string;
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
    throw new Error("Connect to the central transfer server URL first.");
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

  listFiles: () =>
    request<{ files: ReceivedFile[]; directory: string; count: number }>("/files"),

  downloadFile: (filename: string) =>
    `${getApiBase()}/files/download/${encodeURIComponent(filename)}`,

  downloadFileBlob: async (filename: string) => {
    const base = getApiBase();
    if (!base) throw new Error("Connect to the central transfer server URL first.");
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

  uploadFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ job_id: string; message: string }>("/transfer", {
      method: "POST",
      body: form,
    });
  },

  getTransfer: (jobId: string) => request<TransferJob>(`/transfer/${jobId}`),

  listTransfers: () =>
    request<{
      transfers: TransferJob[];
      stats: TransferStats;
      received_count: number;
    }>("/transfers"),

  health: () => request<{ status: string }>("/health"),
};
