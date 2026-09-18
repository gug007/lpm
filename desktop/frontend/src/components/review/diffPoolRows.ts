import { createStore, type StoreApi } from "zustand/vanilla";

export const DEFAULT_SLOT_HEIGHT = 220;

// What one file's row renders. Kept outside React state so a file settling
// notifies that file's row alone rather than re-rendering every row in the
// stack, which is what keeps a long changeset cheap to scroll.
export interface DiffRowState {
  // The placeholder's height while no editor is attached to the file.
  height: number;
  revealed: boolean;
  dirty: boolean;
  binary: boolean;
  tooLarge: boolean;
  // Disk content of a file that changed under unsaved edits.
  theirs?: string;
}

export const EMPTY_ROW: DiffRowState = {
  height: DEFAULT_SLOT_HEIGHT,
  revealed: false,
  dirty: false,
  binary: false,
  tooLarge: false,
};

interface DiffRowsState {
  rows: Record<string, DiffRowState>;
  dirtyPaths: Set<string>;
  patch: (path: string, patch: Partial<DiffRowState>) => void;
  drop: (paths: Iterable<string>) => void;
}

export type DiffRowsStore = StoreApi<DiffRowsState>;

export function createDiffRowsStore(): DiffRowsStore {
  return createStore<DiffRowsState>((set) => ({
    rows: {},
    dirtyPaths: new Set(),
    patch: (path, patch) =>
      set((s) => {
        const row = s.rows[path] ?? EMPTY_ROW;
        const keys = Object.keys(patch) as (keyof DiffRowState)[];
        if (keys.every((k) => row[k] === patch[k])) return s;
        const next = { ...row, ...patch };
        const rows = { ...s.rows, [path]: next };
        if (next.dirty === s.dirtyPaths.has(path)) return { rows };
        const dirtyPaths = new Set(s.dirtyPaths);
        if (next.dirty) dirtyPaths.add(path);
        else dirtyPaths.delete(path);
        return { rows, dirtyPaths };
      }),
    drop: (paths) =>
      set((s) => {
        const rows = { ...s.rows };
        let dirtyPaths = s.dirtyPaths;
        let changed = false;
        for (const path of paths) {
          if (!(path in rows)) continue;
          delete rows[path];
          changed = true;
          if (!dirtyPaths.has(path)) continue;
          if (dirtyPaths === s.dirtyPaths) dirtyPaths = new Set(dirtyPaths);
          dirtyPaths.delete(path);
        }
        return changed ? { rows, dirtyPaths } : s;
      }),
  }));
}
