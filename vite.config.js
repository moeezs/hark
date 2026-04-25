import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir: "dist",
    target: ["es2021", "chrome100", "safari15"],
    minify: process.env.TAURI_DEBUG ? false : "oxc",
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
