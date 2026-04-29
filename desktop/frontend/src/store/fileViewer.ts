import { create } from "zustand";

export interface FileViewerRequest {
  absPath: string;
  line: number;
  col: number;
  // Project root for resolving the path inside `git diff` and other context-aware
  // operations. Empty when the file isn't tied to a project.
  projectRoot: string;
}

interface FileViewerState {
  current: FileViewerRequest | null;
  open: (req: FileViewerRequest) => void;
  close: () => void;
}

export const useFileViewerStore = create<FileViewerState>((set) => ({
  current: null,
  open: (req) => set({ current: req }),
  close: () => set({ current: null }),
}));

export function openFileViewer(req: FileViewerRequest): void {
  useFileViewerStore.getState().open(req);
}
