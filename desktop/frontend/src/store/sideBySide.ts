import { useMemo } from "react";
import { create } from "zustand";
import { useAppStore } from "./app";
import { MAX_SIDE_BY_SIDE, addColumn, removeColumn, sideBySideColumns } from "../sideBySide";
import type { BulkDuplicateOptions } from "../components/BulkDuplicateDialog";

// The projects shown side by side, in column order. It stays set while the user
// visits Settings and the like, and ProjectColumns clears it once they move to a
// project outside it. A single name is a set still being built (Run in
// duplicates adds each copy as it's created) and draws as one project.
interface SideBySideStore {
  names: string[];
  // Shows `names`, the first one in front.
  open: (names: string[]) => void;
  add: (name: string, anchor: string, focus?: boolean) => void;
  remove: (name: string) => void;
  close: () => void;
  prune: (existing: ReadonlySet<string>) => void;
}

// A column's detail must be mounted to draw, and App mounts only visited ones.
function mount(names: string[]): void {
  const { markVisited } = useAppStore.getState();
  for (const name of names) markVisited(name);
}

export const useSideBySide = create<SideBySideStore>((set, get) => ({
  names: [],

  open: (names) => {
    const next = names.slice(0, MAX_SIDE_BY_SIDE);
    mount(next);
    set({ names: next });
    if (next[0]) useAppStore.getState().selectProject(next[0]);
  },

  add: (name, anchor, focus = false) => {
    const next = addColumn(get().names, anchor, name);
    mount(next);
    set({ names: next });
    if (focus && next.includes(name)) useAppStore.getState().selectProject(name);
  },

  remove: (name) => {
    const { names } = get();
    const at = names.indexOf(name);
    if (at < 0) return;
    set({ names: removeColumn(names, name) });
    const app = useAppStore.getState();
    const neighbor = names[at === 0 ? 1 : at - 1];
    if (app.selected === name && neighbor) app.selectProject(neighbor);
  },

  close: () => set({ names: [] }),

  prune: (existing) =>
    set((s) => {
      const live = s.names.filter((n) => existing.has(n));
      if (live.length === s.names.length) return s;
      return { names: live.length < 2 ? [] : live };
    }),
}));

const NONE: string[] = [];

// The columns on screen while `selected` is side by side, else none.
export function useSideBySideColumns(selected: string | null): string[] {
  const names = useSideBySide((s) => s.names);
  const projects = useAppStore((s) => s.projects);
  return useMemo(
    () =>
      names.length < 2
        ? NONE
        : sideBySideColumns(names, selected, new Set(projects.map((p) => p.name))),
    [names, selected, projects],
  );
}

// Run in duplicates' copies. With "Open side by side", run #1's project opens
// first and each copy joins it as it's created, while the user stays in run #1.
export function duplicateBeside(
  project: string,
  count: number,
  opts: BulkDuplicateOptions,
): Promise<void> {
  const { bulkDuplicate } = useAppStore.getState();
  if (!opts.sideBySide) return bulkDuplicate(project, count, opts);
  useSideBySide.getState().open([project]);
  return bulkDuplicate(project, count, {
    ...opts,
    keepSelection: true,
    onCreated: (copy) => useSideBySide.getState().add(copy, project),
  });
}
