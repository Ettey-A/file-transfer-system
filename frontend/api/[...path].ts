/**
 * Vercel edge /api route — disabled on purpose.
 * Each user connects directly to their own PC (see lib/config.ts).
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
