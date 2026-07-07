/**
 * Legacy Vercel proxy — not used for multi-user setups.
 * Each browser connects directly to its own PC's ngrok URL (stored in localStorage).
 */
export const config = {
  runtime: "edge",
};

export default async function handler(): Promise<Response> {
  return new Response(
    JSON.stringify({
      detail:
        "This shared proxy is disabled. On the hosted UI, connect your own PC: run python start.py, ngrok http 8001, then paste your ngrok URL in the app.",
    }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}
