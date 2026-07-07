/**
 * Vercel serverless proxy — forwards /api/* to your Python backend.
 * Set BACKEND_URL in Vercel → Settings → Environment Variables
 * Example: https://your-id.ngrok-free.app
 */
export const config = {
  runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {
  const backend = process.env.BACKEND_URL?.replace(/\/$/, "");

  if (!backend) {
    return new Response(
      JSON.stringify({
        detail:
          "BACKEND_URL not set. Add it in Vercel project settings (your ngrok or server URL).",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const target = `${backend}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body:
      request.method !== "GET" && request.method !== "HEAD"
        ? request.body
        : undefined,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
