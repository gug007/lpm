// The lesson app's own frontend server: the repo's Vite config with file
// watching and HMR off, so edits made in the worktree during a take (another
// agent, a formatter) never reload the app mid-recording. Links the app would
// open in the browser are noted instead (lesson-opener.js).
import { fileURLToPath } from "node:url";
import base from "../../../../desktop/frontend/vite.config.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const alias = [{ find: /^@tauri-apps\/plugin-opener$/, replacement: `${here}lesson-opener.js` }];
const baseAlias = base.resolve?.alias;
const aliases = Array.isArray(baseAlias) ? [...alias, ...baseAlias] : [...alias, ...Object.entries(baseAlias || {}).map(([find, replacement]) => ({ find, replacement }))];

export default {
  ...base,
  resolve: { ...base.resolve, alias: aliases },
  optimizeDeps: { ...base.optimizeDeps, exclude: [...(base.optimizeDeps?.exclude || []), "@tauri-apps/plugin-opener"] },
  server: { ...base.server, hmr: false, watch: null, fs: { ...base.server?.fs, allow: [...(base.server?.fs?.allow || []), here, fileURLToPath(new URL("../../../../desktop/frontend", import.meta.url))] } },
};
