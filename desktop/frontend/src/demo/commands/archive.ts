import type { CommandMap } from "../backend";
import { stopServices } from "./services";
import { changed, project, projects } from "./state";

// The demo's archived projects, name → when (ms), as settings.json keeps them.
const archived = new Map<string, number>();

/** Whether the demo lists a project: not archived, nor a copy of one that is. */
export function demoListed(name: string, parentName?: string): boolean {
  return !archived.has(name) && !(parentName && archived.has(parentName));
}

const family = (name: string) =>
  [...projects.values()].filter((p) => p.name === name || p.parentName === name);

// A folder's size made up from its name, the same on every visit.
function demoSize(name: string): number {
  let h = 7;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 40_000_000 + (h % 1_900_000_000);
}

// What a reinstall would recreate in the demo's folders, until it's freed.
const freed = new Set<string>();
const demoRebuildable = (name: string) =>
  freed.has(name)
    ? []
    : [
        { path: "node_modules", bytes: Math.round(demoSize(name) * 0.7) },
        { path: ".next", bytes: Math.round(demoSize(name) * 0.08) },
      ];
const freeable = (name: string) => demoRebuildable(name).reduce((n, f) => n + f.bytes, 0);

export const archiveCommands: CommandMap = {
  archive_preview: ({ name }) => {
    const members = family(String(name));
    return {
      running: members.some((p) => p.running.size > 0),
      copies: members.length - 1,
      automations: 0,
    };
  },
  archive_project: ({ name }) => {
    const n = String(name);
    if (!project(n)) throw new Error(`no project named "${n}"`);
    family(n).forEach((p) => stopServices(p.name));
    if (!archived.has(n)) archived.set(n, Date.now());
    changed();
    return null;
  },
  unarchive_project: ({ name }) => {
    archived.delete(String(name));
    changed();
    return null;
  },
  list_archived_projects: () =>
    [...archived]
      .filter(([name]) => projects.has(name))
      .map(([name, at]) => {
        const p = projects.get(name)!;
        return {
          name,
          label: p.label ?? null,
          root: p.root,
          isRemote: p.remote,
          parentName: p.parentName ?? null,
          worktree: p.worktree,
          archivedAt: at,
          copies: family(name).length - 1,
          automations: 0,
        };
      }),
  project_disk_size: ({ name }) => {
    const p = project(String(name));
    return p && !p.remote ? demoSize(p.name) - (freed.has(p.name) ? Math.round(demoSize(p.name) * 0.78) : 0) : null;
  },
  project_size_breakdown: ({ name }) => {
    const p = project(String(name));
    if (!p || p.remote) return null;
    const rebuildable = demoRebuildable(p.name);
    const gone = freed.has(p.name) ? Math.round(demoSize(p.name) * 0.78) : 0;
    return { bytes: demoSize(p.name) - gone, rebuildable };
  },
  free_project_space: ({ name }) => {
    const n = String(name);
    const bytes = freeable(n);
    freed.add(n);
    return bytes;
  },
};
