/**
 * Vercel edge proxy: forwards /api/* to the transfer server (ngrok or public URL).
 * Set BACKEND_URL on Vercel to e.g. https://your-subdomain.ngrok-free.app
 */
export const config = {
  runtime: "edge",
};

function backendOrigin(): string | null {
  const raw = (process.env.BACKEND_URL || process.env.VITE_API_URL || "").trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "").replace(/\/api$/, "");
}

export default async function handler(request: Request): Promise<Response> {
  const origin = backendOrigin();
  if (!origin) {
    return new Response(
      JSON.stringify({
        detail:
          "Hosted API proxy is not configured. Set BACKEND_URL on Vercel to your ngrok URL, or paste your PC's ngrok URL in the app.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const incoming = new URL(request.url);
  const target = `${origin}${incoming.pathname}${incoming.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (key.toLowerCase() === "host") return;
    headers.set(key, value);
  });
  headers.set("ngrok-skip-browser-warning", "true");

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const response = await fetch(target, init);
  const outHeaders = new Headers(response.headers);
  outHeaders.set("Access-Control-Allow-Origin", "*");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}
