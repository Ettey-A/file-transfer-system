// Key for per-browser backend URL when bypassing the Vercel proxy
const STORAGE_KEY = "transfer_api_url";

/** Ensure URL ends with /api for fetch() paths like /status, /transfer. */
export function normalizeApiBase(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
}

/** True when UI is hosted on Vercel (not local python or vite dev). */
export function isHostedUI(): boolean {
  if (import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname.endsWith(".vercel.app") ||
    window.location.hostname.endsWith(".vercel.sh") ||
    Boolean(import.meta.env.VITE_API_URL)
  );
}

/** Direct ngrok URL saved in this browser (bypasses Vercel /api proxy). */
export function getPersonalBackendUrl(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY)?.trim();
  return stored ? normalizeApiBase(stored) : null;
}

/** Hosted UI using same-origin /api proxy instead of a direct ngrok URL. */
export function usesHostedProxy(): boolean {
  return isHostedUI() && !getPersonalBackendUrl();
}

/** On Vercel without proxy env and no saved URL, user must connect manually. */
export function needsBackendSetup(): boolean {
  if (!isHostedUI()) return false;
  if (getPersonalBackendUrl()) return false;
  // Shared hosted deploy: VITE_API_URL means Vercel proxy is configured at build time
  if (import.meta.env.VITE_API_URL) return false;
  return true;
}

/** Base URL for all api.* fetch calls. */
export function getApiBase(): string {
  const personal = getPersonalBackendUrl();
  if (personal) return personal;

  if (import.meta.env.DEV) return "/api";

  if (!isHostedUI()) return "/api";

  // Hosted: same-origin proxy → Vercel api/[...path].ts → BACKEND_URL
  return "/api";
}

/** True when API calls go directly to ngrok (needs skip-browser-warning header). */
export function usesDirectNgrok(): boolean {
  const base = getApiBase();
  return base.startsWith("http") && base.includes("ngrok");
}

export function setApiBase(url: string): void {
  const normalized = normalizeApiBase(url);
  if (normalized) localStorage.setItem(STORAGE_KEY, normalized);
  else localStorage.removeItem(STORAGE_KEY);
}

export function clearApiBase(): void {
  localStorage.removeItem(STORAGE_KEY);
}
