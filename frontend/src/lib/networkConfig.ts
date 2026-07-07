// localStorage key for the IP the user shares as their TCP receiver address
const SERVER_IP_KEY = "transfer_server_ip";
// localStorage key for the IP the user sends files TO (client / sender role)
const CLIENT_RECEIVER_IP_KEY = "transfer_client_receiver_ip";

/** Read server IP from browser storage (receiver panel). */
export function getServerIp(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SERVER_IP_KEY)?.trim() ?? "";
}

/** Save server IP — independent from client receiver IP. */
export function setServerIp(ip: string): void {
  const value = ip.trim();
  if (value) localStorage.setItem(SERVER_IP_KEY, value);
  else localStorage.removeItem(SERVER_IP_KEY);
}

const DEFAULT_CLIENT_RECEIVER_IP = "127.0.0.1";

/** Read destination IP from browser storage (send panel). */
export function getClientReceiverIp(): string {
  if (typeof window === "undefined") return DEFAULT_CLIENT_RECEIVER_IP;
  const stored = localStorage.getItem(CLIENT_RECEIVER_IP_KEY)?.trim();
  return stored || DEFAULT_CLIENT_RECEIVER_IP;
}

/** Save client receiver IP — where uploads are sent. */
export function setClientReceiverIp(ip: string): void {
  const value = ip.trim();
  if (value) localStorage.setItem(CLIENT_RECEIVER_IP_KEY, value);
  else localStorage.removeItem(CLIENT_RECEIVER_IP_KEY);
}
