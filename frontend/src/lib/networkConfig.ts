const SERVER_IP_KEY = "transfer_server_ip";
const CLIENT_RECEIVER_IP_KEY = "transfer_client_receiver_ip";

export function getServerIp(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SERVER_IP_KEY)?.trim() ?? "";
}

export function setServerIp(ip: string): void {
  const value = ip.trim();
  if (value) localStorage.setItem(SERVER_IP_KEY, value);
  else localStorage.removeItem(SERVER_IP_KEY);
}

export function getClientReceiverIp(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(CLIENT_RECEIVER_IP_KEY)?.trim() ?? "";
}

export function setClientReceiverIp(ip: string): void {
  const value = ip.trim();
  if (value) localStorage.setItem(CLIENT_RECEIVER_IP_KEY, value);
  else localStorage.removeItem(CLIENT_RECEIVER_IP_KEY);
}
