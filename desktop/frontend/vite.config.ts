import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wails from "@wailsio/runtime/plugins/vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  plugins: [react(), tailwindcss(), wails("./bindings")],
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
