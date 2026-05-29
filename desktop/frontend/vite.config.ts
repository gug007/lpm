import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Tauri injects its IPC into the webview; no framework runtime plugin needed.
  // The dev server port must match tauri.conf.json `build.devUrl`.
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
    // Don't let Rust build artifacts trigger HMR reload storms.
    watch: { ignored: ["**/src-tauri/**"] },
  },
  plugins: [react(), tailwindcss()],
  build: {
    target: "es2022",
  },
  optimizeDeps: {
    exclude: ["monaco-editor"],
    include: [
      "monaco-yaml",
      "monaco-yaml/yaml.worker.js",
      "prettier/plugins/yaml",
      "prettier/standalone",
    ],
  },
});
