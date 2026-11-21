# DriveSense frontend

React 19, TypeScript, Vite 7, and Tailwind CSS 4 dashboard for the DriveSense API.

## Run locally

```powershell
cd src\frontend
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` and `/health` to `http://localhost:8000` by default. Set `VITE_BACKEND_URL` to change the dev proxy target, or set `VITE_API_BASE_URL` for a direct API origin. `VITE_*` values are bundled at build time.

## API contract

The totals response fields follow the code tour. The backend `schemas.py` was not present in this checkout, so optional event properties in `src/types.ts` should be aligned with the authoritative schema when it becomes available.
