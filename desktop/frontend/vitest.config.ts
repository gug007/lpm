import { defineConfig } from "vitest/config";

// Node 25 turns on its own localStorage, which hides happy-dom's and has no
// working methods without --localstorage-file. Node 20 doesn't know the flag.
const webStorageOff = process.allowedNodeEnvironmentFlags.has("--experimental-webstorage")
  ? ["--no-experimental-webstorage"]
  : [];

export default defineConfig({
  // As in vite.config.ts: the popup bootstrap is the one the phones bundle.
  server: { fs: { allow: [".", "../../mobile/shared/web/popup"] } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/testPlatform.ts"],
    execArgv: webStorageOff,
  },
});
