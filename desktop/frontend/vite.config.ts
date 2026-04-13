import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
