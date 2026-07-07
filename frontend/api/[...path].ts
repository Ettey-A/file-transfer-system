/**
 * Vercel proxy: forwards /api/* to the Python transfer server (ngrok URL).
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

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, ngrok-skip-browser-warning, Accept, Authorization",
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const origin = backendOrigin();
  if (!origin) {
    return new Response(
      JSON.stringify({
        detail:
          "Hosted API proxy is not configured. Set BACKEND_URL on Vercel to your ngrok URL, or paste your ngrok URL in the app.",
      }),
      { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }

  const incoming = new URL(request.url);
  const target = `${origin}${incoming.pathname}${incoming.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") return;
    headers.set(key, value);
  });
  headers.set("ngrok-skip-browser-warning", "true");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  try {
    const response = await fetch(target, init);
    const outHeaders = new Headers(response.headers);
    outHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy request failed";
    return new Response(
      JSON.stringify({
        detail: `Cannot reach transfer server at ${origin}. Is python start.py running and ngrok active? (${message})`,
      }),
      { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }
}
