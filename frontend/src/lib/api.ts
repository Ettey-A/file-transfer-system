import { getApiBase } from "./config";

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
  servers: {
    tcp: ServerInfo;
    udp: ServerInfo;
  };
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.message || "Request failed");
  }
  return res.json();
}

export const api = {
  getStatus: () => request<SystemStatus>("/status"),

  startServer: (protocol: "tcp" | "udp") =>
    request<{
      message: string;
      running: boolean;
      local_ip: string;
      address: string;
      api_running: boolean;
    }>("/server/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocol }),
    }),

  stopServer: (protocol: "tcp" | "udp") =>
    request<{ message: string; running: boolean }>("/server/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocol }),
    }),

  listFiles: () =>
    request<{ files: ReceivedFile[]; directory: string; count: number }>("/files"),

  downloadFile: (filename: string) =>
    `${getApiBase()}/files/download/${encodeURIComponent(filename)}`,

  transferFile: (file: File, host: string, port: number, protocol: "tcp" | "udp") => {
    const form = new FormData();
    form.append("file", file);
    form.append("host", host);
    form.append("port", String(port));
    form.append("protocol", protocol);
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
