import { getApiBase } from "./config";
import type { ReceivedFile, SystemStatus, TransferJob, TransferStats } from "./api.types";

export type {
  ServerInfo,
  SessionStats,
  SystemStatus,
  TransferStats,
  ReceivedFile,
  TransferJob,
} from "./api.types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
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
