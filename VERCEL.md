# Deploy to Vercel

The **UI** deploys to Vercel. The **Python backend** (`api_server.py`, TCP/UDP) must run on your PC or a VPS — Vercel cannot host raw socket servers.

## Quick deploy

### Option A — Deploy from `frontend/` folder (recommended)

1. Push the repo to GitHub
2. Import project in [Vercel](https://vercel.com/new)
3. Set **Root Directory** to `frontend`
4. Framework preset: **Vite** (auto-detected)
5. Deploy

### Option B — Deploy from repo root

Uses root `vercel.json` which builds `frontend/dist`.

## Entry point

`index.html` loads **`src/App.tsx`** directly as the application entry (bootstrap + UI).

## Connect UI to your Python backend

After deploy:

1. On your machine run:
   ```bash
   python start.py
   ```
2. Expose port `8001` to the internet (e.g. [ngrok](https://ngrok.com)):
   ```bash
   ngrok http 8001
   ```
3. In the Vercel UI, paste your API URL:
   ```
   https://YOUR-NGROK-ID.ngrok-free.app/api
   ```
4. Click **Connect**

Or set in Vercel → Settings → Environment Variables:

| Variable | Example |
|----------|---------|
| `VITE_API_URL` | `https://your-tunnel.ngrok.io/api` |
| `VITE_DEPLOYMENT` | `vercel` |

Redeploy after adding env vars.

## Local development

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8001` and auto-starts `api_server.py`.

## Build locally

```bash
cd frontend
npm run build
npm run preview
```
