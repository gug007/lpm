import { create } from "zustand";

// The ports each project listens on, by project name (peer-marked for a
// connected computer's), as its sidebar row lists them.
interface RowPortsState {
  byProject: Record<string, number[]>;
  set: (byProject: Record<string, number[]>) => void;
}

export const useRowPorts = create<RowPortsState>((set) => ({
  byProject: {},
  set: (byProject) =>
    set((s) => (JSON.stringify(s.byProject) === JSON.stringify(byProject) ? s : { byProject })),
}));
