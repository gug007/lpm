// The lesson app's own frontend server: the repo's Vite config with file
// watching and HMR off, so edits made in the worktree during a take (another
// agent, a formatter) never reload the app mid-recording.
import base from "../../../../desktop/frontend/vite.config.ts";

export default { ...base, server: { ...base.server, hmr: false, watch: null } };
