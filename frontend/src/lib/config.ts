const STORAGE_KEY = "transfer_api_url";

/** Normalize user input to .../api base path. */
export function normalizeApiBase(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
}

export function isHostedUI(): boolean {
  if (import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname.endsWith(".vercel.app") ||
    window.location.hostname.endsWith(".vercel.sh") ||
    Boolean(import.meta.env.VITE_API_URL)
  );
}

/** This browser's personal backend URL (ngrok or LAN), stored per device. */
export function getPersonalBackendUrl(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY)?.trim();
  return stored ? normalizeApiBase(stored) : null;
}

/** Hosted UI requires each user to link their own PC's API — no shared backend. */
export function needsBackendSetup(): boolean {
  return isHostedUI() && !getPersonalBackendUrl();
}

export function getApiBase(): string {
  const personal = getPersonalBackendUrl();
  if (personal) return personal;

  // Local dev: Vite proxies /api to localhost
  if (import.meta.env.DEV) return "/api";

  // Local production: api_server serves UI + API on same origin
  if (!isHostedUI()) return "/api";

  // Hosted: no shared default — each PC must connect its own backend
  return "";
}

export function setApiBase(url: string): void {
  const normalized = normalizeApiBase(url);
  if (normalized) localStorage.setItem(STORAGE_KEY, normalized);
  else localStorage.removeItem(STORAGE_KEY);
}

export function clearApiBase(): void {
  localStorage.removeItem(STORAGE_KEY);
}
