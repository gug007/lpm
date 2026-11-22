import type { CommandMap } from "../backend";
import { project } from "./state";

const GB = 1024 ** 3;

// A copy's own size made up from its name, the same on every visit.
function demoOwn(name: string): number {
  let h = 11;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 300_000_000 + (h % 2_400_000_000);
}

// Copies whose dependencies and caches the demo has freed.
const freed = new Set<string>();

const freeable = (name: string) =>
  freed.has(name)
    ? []
    : [
        { path: "node_modules", bytes: Math.round(demoOwn(name) * 0.64) },
        { path: ".next", bytes: Math.round(demoOwn(name) * 0.11) },
      ];
const freeableTotal = (name: string) => freeable(name).reduce((n, f) => n + f.bytes, 0);

export const diskSpaceCommands: CommandMap = {
  // The demo is a Mac on APFS, where a copy shares its files until they change.
  machine_disk_space: () => ({ free: 182 * GB, total: 494 * GB, clones: true }),
  duplicate_space: ({ name, worktree }) => {
    const p = project(String(name));
    if (!p || p.remote) return null;
    return {
      bytes: worktree ? Math.round(demoOwn(p.name) * 0.2) : null,
      free: 182 * GB,
      total: 494 * GB,
      clones: true,
    };
  },
  copy_space: ({ name }) => {
    const p = project(String(name));
    if (!p || p.remote) return null;
    const gone = freed.has(p.name) ? Math.round(demoOwn(p.name) * 0.75) : 0;
    return { bytes: demoOwn(p.name) - gone, freeable: freeable(p.name), running: p.running.size > 0 };
  },
  free_copy_space: ({ name }) => {
    const p = project(String(name));
    if (!p?.parentName) throw new Error(`${String(name)} isn't a copy`);
    if (p.running.size > 0) throw new Error(`${p.name} is running. Stop it first.`);
    const bytes = freeableTotal(p.name);
    freed.add(p.name);
    return bytes;
  },
};
