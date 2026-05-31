import { useEffect } from "react";
import { toast } from "sonner";
import { EventsOn } from "../../bridge/runtime";
import { useAppStore } from "../store/app";

// Events safe to handle in every window — they don't reach into
// main-window-only state (selection, settings view, modals).
export function useAmbientAppEvents(): void {
  useEffect(() => {
    const cancelSyncError = EventsOn("sync-error", (msg: string) => {
      toast.error(`Sync push failed: ${msg}`);
    });

    return () => {
      if (typeof cancelSyncError === "function") cancelSyncError();
    };
  }, []);
}

// Main-window only — these events drive navigation and selection that
// only the main shell renders; firing them in a detached window would
// silently mutate store fields nothing reads.
export function useAppEvents(): void {
  useAmbientAppEvents();
  useEffect(() => {
    const { selectProject, setView, setFeedbackOpen, addProject } =
      useAppStore.getState();

    const cancelDock = EventsOn("dock-project-selected", (name: string) => {
      selectProject(name);
    });
    const cancelNavView = EventsOn("navigate-main-view", (view: string) => {
      setView(view as Parameters<typeof setView>[0]);
    });
    const cancelNewProject = EventsOn("open-new-project", () => {
      addProject();
    });
    const cancelSettings = EventsOn("menu-open-settings", () => {
      setView("settings");
    });
    const cancelCommitInstr = EventsOn("navigate-commit-instructions", () => {
      setView("commit-instructions");
    });
    const cancelPRInstr = EventsOn("navigate-pr-instructions", () => {
      setView("pr-instructions");
    });
    const cancelBranchInstr = EventsOn("navigate-branch-instructions", () => {
      setView("branch-instructions");
    });
    const cancelFeedback = EventsOn("menu-open-feedback", () => {
      setFeedbackOpen(true);
    });

    return () => {
      if (typeof cancelDock === "function") cancelDock();
      if (typeof cancelNavView === "function") cancelNavView();
      if (typeof cancelNewProject === "function") cancelNewProject();
      if (typeof cancelSettings === "function") cancelSettings();
      if (typeof cancelCommitInstr === "function") cancelCommitInstr();
      if (typeof cancelPRInstr === "function") cancelPRInstr();
      if (typeof cancelBranchInstr === "function") cancelBranchInstr();
      if (typeof cancelFeedback === "function") cancelFeedback();
    };
  }, []);
}
