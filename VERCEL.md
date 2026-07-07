# Deploy to Vercel (same UI + features as local)

## Why Vercel looked different

Locally, `python start.py` runs **both** the UI and the Python API on port 8001.

Vercel only hosts the **static React UI**. Without the Python backend, API calls fail and features (start servers, send files, received files, history) do not work.

## Get the exact same experience on Vercel

### Step 1 — Deploy the UI to Vercel

1. Push this repo to GitHub
2. [vercel.com/new](https://vercel.com/new) → Import project
3. Set **Root Directory** to `frontend`
4. Framework: **Vite** (auto-detected)
5. Deploy

### Step 2 — Run the Python backend on your PC

```bash
python start.py
```

### Step 3 — Expose port 8001 to the internet

Install [ngrok](https://ngrok.com) and run:

```bash
ngrok http 8001
```

Copy the HTTPS URL, e.g. `https://abc123.ngrok-free.app`

### Step 4 — Connect Vercel to your backend

In Vercel → your project → **Settings** → **Environment Variables**, add:

| Name | Value | Example |
|------|-------|---------|
| `BACKEND_URL` | Your ngrok URL (no trailing slash) | `https://abc123.ngrok-free.app` |

Apply to **Production**, **Preview**, and **Development**.

**Redeploy** the project (Deployments → ⋯ → Redeploy).

### How it works

- Vercel serves the same built UI as local (`index.html` → `entry.tsx` → `App.tsx`)
- `/api/*` requests are proxied by `frontend/api/[...path].ts` to your `BACKEND_URL`
- Same endpoints as local: start TCP/UDP, send files, received files, transfer history

## Local development (unchanged)

```bash
cd frontend && npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8001`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API Offline on Vercel | Set `BACKEND_URL` and redeploy |
| Features missing | Backend must be running + ngrok active |
| CORS errors | `api_server.py` already allows all origins |
| Old UI on Vercel | Redeploy after `npm run build` locally to verify |
