import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "5000";
const apiPort = Number(rawPort);

// Local development runs the Express API (PORT) and the Vite dev server on
// distinct ports. VITE_PORT overrides only the Vite server port and defaults
// to 5173 (or PORT if provided).
const rawVitePort = process.env.VITE_PORT ?? (process.env.PORT ? rawPort : "5173");
const port = Number(rawVitePort);

// Dev-only proxy so relative frontend `/api/*` requests reach the Express
// API server. Defaults to the API port on localhost; override for remote
// APIs. The `/api` prefix is preserved. Production builds are unaffected
// (proxy applies to the dev server only).
const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ?? `http://localhost:${apiPort}`;

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
