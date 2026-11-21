import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In `npm run dev`, requests to /api and /health are proxied to the backend,
// so the dashboard always calls the API on its own origin (same as nginx in Docker).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8000";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": apiTarget,
        "/health": apiTarget,
      },
    },
  };
});
