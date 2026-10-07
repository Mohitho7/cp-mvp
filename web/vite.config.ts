import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  base: "/",
  // No @vitejs/plugin-react: esbuild handles JSX/TS directly (offline-safe).
  // Fast Refresh is unavailable; full reload applies in dev.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: true },
  },
});