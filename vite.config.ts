import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { target: "chrome108", chunkSizeWarningLimit: 1600 },
  server: { port: 5173, strictPort: true },
});
