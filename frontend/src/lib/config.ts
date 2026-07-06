const STORAGE_KEY = "transfer_api_url";

/** Resolve API base URL: localStorage → VITE_API_URL → /api (dev proxy). */
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY)?.trim();
    if (stored) return stored.replace(/\/$/, "");
  }
  const envUrl = import.meta.env.VITE_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  return "/api";
}

export function setApiBase(url: string): void {
  const normalized = url.trim().replace(/\/$/, "");
  if (normalized) {
    localStorage.setItem(STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function clearApiBase(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** True when UI is deployed (Vercel or production without local proxy). */
export function isHostedDeployment(): boolean {
  if (import.meta.env.VITE_DEPLOYMENT === "vercel") return true;
  if (import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname.endsWith(".vercel.app") ||
    Boolean(import.meta.env.VITE_API_URL)
  );
}
