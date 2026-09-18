import { create } from "zustand";

// ⌘P asks the focused pane's Files tab to put the cursor in its filter box,
// ⌘⇧E asks for the file tree and ⌘⇧R for every change. The tab may not exist
// yet when the key is pressed, so the request is a per-pane item the FilesPane
// picks up on mount or on change, then clears.
export type FilesView = "files" | "changes";
export type FilesRequestKind = FilesView | "filter";

export interface FilesRequest {
  kind: FilesRequestKind;
  seq: number;
}

interface FilesFocusState {
  requests: Record<string, FilesRequest>;
  request: (paneId: string, kind: FilesRequestKind) => void;
  clear: (paneId: string) => void;
}

export const useFilesFocus = create<FilesFocusState>((set) => ({
  requests: {},
  request: (paneId, kind) =>
    set((s) => ({
      requests: { ...s.requests, [paneId]: { kind, seq: (s.requests[paneId]?.seq ?? 0) + 1 } },
    })),
  clear: (paneId) =>
    set((s) => {
      if (!(paneId in s.requests)) return s;
      const next = { ...s.requests };
      delete next[paneId];
      return { requests: next };
    }),
}));
