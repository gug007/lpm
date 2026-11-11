import type { Plugin } from "vite";

// Monaco ships its own copy of DOMPurify, which no package.json pin reaches.
// The alias swaps in the npm package; if Monaco ever reaches its copy another
// way, the build fails instead of quietly shipping it.
const VENDORED = /\/monaco-editor\/.*dompurify/i;

export function monacoDompurify(): Plugin {
  return {
    name: "monaco-dompurify",
    config: () => ({
      resolve: { alias: [{ find: /^\.\/dompurify\/dompurify\.js$/, replacement: "dompurify" }] },
      optimizeDeps: { include: ["dompurify"] },
    }),
    load(id) {
      if (VENDORED.test(id)) {
        throw new Error(`Monaco loaded its own DOMPurify (${id}); point the alias in vite-monaco-dompurify.ts at it`);
      }
    },
  };
}
