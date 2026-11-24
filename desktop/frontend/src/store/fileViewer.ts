import { create } from "zustand";

export interface FileViewerRequest {
  absPath: string;
  line: number;
  col: number;
  // Project root for resolving the path inside `git diff` and other context-aware
  // operations. Empty when the file isn't tied to a project.
  projectRoot: string;
  // The path is on the SSH project's host even where it is outside the project.
  onHost?: boolean;
  // Files a terminal reference could mean when it names more than one; the
  // viewer asks which before opening.
  choices?: string[];
  // Opened from a dialog, which it has to sit above.
  overDialog?: boolean;
}

// Minimized and docked keep the file (and a playing video) up while the app
// behind it stays usable.
export type FileViewerMode = "open" | "minimized" | "docked";

interface FileViewerState {
  current: FileViewerRequest | null;
  mode: FileViewerMode;
  // Width the docked viewer takes from the window's right edge; the app
  // shrinks by it so nothing sits under the panel.
  dockInset: number;
  open: (req: FileViewerRequest) => void;
  close: () => void;
  setMode: (mode: FileViewerMode) => void;
  setDockInset: (width: number) => void;
}

export const useFileViewerStore = create<FileViewerState>((set) => ({
  current: null,
  mode: "open",
  dockInset: 0,
  open: (req) => set({ current: req, mode: "open" }),
  close: () => set({ current: null, mode: "open" }),
  setMode: (mode) => set({ mode }),
  setDockInset: (dockInset) => set({ dockInset }),
}));

export function openFileViewer(req: FileViewerRequest): void {
  useFileViewerStore.getState().open(req);
}
