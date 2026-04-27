import { useCallback, useEffect, useState } from "react";
import { getProjectTerminals, saveProjectTerminals } from "../terminals";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

export type DetailView = "terminal" | "config" | "notes";

export interface UseDetailViewOptions {
  projectName: string;
  visible: boolean;
}

export interface UseDetailViewResult {
  detailView: DetailView;
  switchDetailView: (view: DetailView) => void;
}

// Owns the terminal/config/notes tab state for a project view: persists
// the choice per-project, snaps back to "terminal" when the view is
// hidden, and binds the ⌘E (config) / ⌘⇧N (notes) shortcuts. The ⌘T
// shortcut lives at the call site because it composes with the
// terminal-view ref, which doesn't belong here.
export function useDetailView({ projectName, visible }: UseDetailViewOptions): UseDetailViewResult {
  const [detailView, setDetailView] = useState<DetailView>("terminal");

  useEffect(() => {
    if (!visible && detailView !== "terminal") setDetailView("terminal");
  }, [visible, detailView]);

  const switchDetailView = useCallback(
    (view: DetailView) => {
      setDetailView(view);
      const state = getProjectTerminals(projectName);
      saveProjectTerminals(projectName, { ...state, detailView: view });
    },
    [projectName],
  );

  useKeyboardShortcut(
    { key: "e", meta: true },
    () => switchDetailView(detailView === "config" ? "terminal" : "config"),
    visible,
  );

  useKeyboardShortcut(
    { key: "n", meta: true, shift: true },
    () => switchDetailView(detailView === "notes" ? "terminal" : "notes"),
    visible,
  );

  return { detailView, switchDetailView };
}
