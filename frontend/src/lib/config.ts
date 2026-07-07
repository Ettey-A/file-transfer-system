// Key for central server URL saved in this browser
const STORAGE_KEY = "transfer_api_url";

/** Ensure URL ends with /api for fetch() paths like /status, /transfer. */
export function normalizeApiBase(url: string): string {
  const trimmed = url.trim().replace(/\/$/, ""); // Remove trailing slash
  if (!trimmed) return "";
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
}

/** True when UI is hosted on Vercel (not local python or vite dev). */
export function isHostedUI(): boolean {
  if (import.meta.env.DEV) return false; // npm run dev = local
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname.endsWith(".vercel.app") ||
    window.location.hostname.endsWith(".vercel.sh") ||
    Boolean(import.meta.env.VITE_API_URL)
  );
}

/** Saved central server URL, or null if not set. */
export function getPersonalBackendUrl(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY)?.trim();
  return stored ? normalizeApiBase(stored) : null;
}

/** On Vercel without proxy env and no saved URL, user must connect manually. */
export function needsBackendSetup(): boolean {
  if (!isHostedUI()) return false;
  if (getPersonalBackendUrl()) return false;
  if (import.meta.env.VITE_API_URL) return false;
  return true;
}

/** Base URL for all api.* fetch calls. */
export function getApiBase(): string {
  const personal = getPersonalBackendUrl();
  if (personal) return personal; // Remote central server (e.g. ngrok)

  if (import.meta.env.DEV) return "/api"; // Vite proxy → localhost:8001

  if (!isHostedUI()) return "/api"; // python start.py serves UI + API same origin

  return "/api"; // Hosted: Vercel api/[...path].ts → BACKEND_URL
}

export function setApiBase(url: string): void {
  const normalized = normalizeApiBase(url);
  if (normalized) localStorage.setItem(STORAGE_KEY, normalized);
  else localStorage.removeItem(STORAGE_KEY);
}

export function clearApiBase(): void {
  localStorage.removeItem(STORAGE_KEY);
}
