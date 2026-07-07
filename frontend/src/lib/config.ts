const STORAGE_KEY = "transfer_api_url";

/** Same as local: /api (proxied by Vite dev or Vercel edge function). */
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
  if (normalized) localStorage.setItem(STORAGE_KEY, normalized);
  else localStorage.removeItem(STORAGE_KEY);
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
