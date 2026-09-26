import { useCallback, useEffect, useState } from "react";
import { getProjectTerminals, saveProjectTerminals } from "../terminals";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

export type DetailView = "terminal" | "config" | "notes" | "ai";

export interface UseDetailViewOptions {
  projectName: string;
  visible: boolean;
  // Visible and the project the user is working in.
  keysActive: boolean;
}

export interface UseDetailViewResult {
  detailView: DetailView;
  switchDetailView: (view: DetailView) => void;
}

// ⌘T lives at the call site because it composes with the terminal-view
// ref, which doesn't belong here.
export function useDetailView({
  projectName,
  visible,
  keysActive,
}: UseDetailViewOptions): UseDetailViewResult {
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
    { key: "e", meta: true, shift: false },
    () => switchDetailView(detailView === "config" ? "terminal" : "config"),
    keysActive,
  );

  useKeyboardShortcut(
    { key: "n", meta: true, shift: true },
    () => switchDetailView(detailView === "notes" ? "terminal" : "notes"),
    keysActive,
  );

  return { detailView, switchDetailView };
}
