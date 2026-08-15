# VANDANA — Independent Hosting Guide

Run the app fully independently of Emergent. Your current Emergent deployment is untouched:
the code auto-falls back to Emergent when `OPENAI_API_KEY` / `R2_BUCKET` are **not** set, and uses
OpenAI SDK + Cloudflare R2 when they **are** set.

## Files added (nothing removed / no business logic changed)
- `/app/.env.example` — every environment variable, with self-host values
- `/app/render.yaml` — Render blueprint (backend web service + static frontend)
- `/app/SELFHOST.md` — this guide
- `/app/backend/server.py` — added env-gated providers only:
  - `openai_vision_json()` / `openai_text()` → OpenAI Python SDK (GPT‑5.4 vision) when `OPENAI_API_KEY` set
  - `r2_put()` → Cloudflare R2 (S3-compatible via boto3) when `R2_BUCKET` set
- `/app/backend/requirements.txt` — added `openai`, `boto3`
- `/app/frontend/*` — unchanged behavior (already uses `REACT_APP_BACKEND_URL`)

## 1. Environment variables (exact)
Backend: `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PIN`,
`OPENAI_API_KEY`, `LLM_MODEL` (=`gpt-5.4`), `OPENAI_BASE_URL` (optional), `APP_NAME`. (No document storage — uploads are processed in memory and never persisted.)
Frontend: `REACT_APP_BACKEND_URL`.
(`EMERGENT_LLM_KEY` is NOT required once `OPENAI_API_KEY` is set.)

## 2. Frontend build command
```
cd frontend && yarn install && yarn build     # outputs frontend/build
```

## 3. Backend start command
```
cd backend && uvicorn server:app --host 0.0.0.0 --port $PORT
```
(build: `pip install -r requirements.txt`)

## 4. Render settings
- Backend: New → Web Service → root `backend`, Build `pip install -r requirements.txt`,
  Start `uvicorn server:app --host 0.0.0.0 --port $PORT`. Add all backend env vars above.
- Frontend: New → Static Site → root `frontend`, Build `yarn install && yarn build`,
  Publish dir `build`, add `REACT_APP_BACKEND_URL` = backend URL, add SPA rewrite `/* -> /index.html`.
- Or commit `render.yaml` and use Render Blueprints. (Free tier sleeps when idle.)

## 5. Document storage
- None. Uploaded photos/PDFs are processed in memory only and discarded after extraction — nothing is persisted (no R2/S3, no files on disk, no binaries in MongoDB).

## 6. OpenAI configuration
- Create key at platform.openai.com → set `OPENAI_API_KEY`, `LLM_MODEL=gpt-5.4`.
- Vision (handwritten bills + purchase PDFs rendered to images) uses `chat.completions` with
  `image_url` data URIs. Analytics uses the same model for text. Leave `OPENAI_BASE_URL` empty for OpenAI.

## 7. Database
MongoDB Atlas free (M0): create cluster, get SRV string → `MONGO_URL`; keep `DB_NAME`.

Features unchanged: sales, purchases, inventory, customers, suppliers, payments, profit,
business analytics, handwritten bill scanner, purchase PDF scanner, coil tracking.
