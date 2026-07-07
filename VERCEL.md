# Deploy to Vercel (multi-user, each PC independent)

## Important: one backend per PC

Vercel only hosts the **UI**. The TCP server always runs on **your physical PC** via `python start.py`.

**Do not use a single shared `BACKEND_URL` for everyone.** If all users pointed at one ngrok URL, they would all see the same server status and think starting/stopping affects every PC.

Instead, **each person connects their own browser to their own PC**:

1. Run `python start.py` on your machine
2. Run `ngrok http 8001` on your machine
3. Open the Vercel app and paste **your** ngrok URL (saved only in your browser)

Starting the server on your PC only starts TCP on **your** machine.

## Deploy the UI

1. Push this repo to GitHub
2. [vercel.com/new](https://vercel.com/new) → Import project
3. Set **Root Directory** to `frontend`
4. Framework: **Vite** (auto-detected)
5. Deploy

No `BACKEND_URL` environment variable is required.

## Per-user setup (each computer)

On **each PC** that will send or receive files:

```bash
python start.py
```

In another terminal:

```bash
ngrok http 8001
```

Copy the HTTPS URL (e.g. `https://abc123.ngrok-free.app`).

In the Vercel-hosted UI:

1. Paste your ngrok URL in **Connect my PC**
2. Click **Connect my PC**
3. The header shows **Your PC: x.x.x.x** — that is the machine you control

To switch computers, click **Change PC** and enter a different URL.

## Local development (unchanged)

```bash
cd frontend && npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8001` on the same machine.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server starts on "someone else's PC" | You are connected to their ngrok URL — use **Change PC** and paste yours |
| API Offline on Vercel | Run `python start.py` + ngrok on your PC, then connect your URL |
| CORS errors | `api_server.py` already allows all origins |
| Wrong IP shown in header | Disconnect and reconnect with your ngrok URL |
