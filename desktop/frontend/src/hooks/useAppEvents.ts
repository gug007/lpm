import { useEffect } from "react";
import { toast } from "sonner";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/app";
import { playDoneSound, playErrorSound, playWaitingSound } from "../sounds";

/**
 * Subscribes to backend events that drive global app state (menu navigation,
 * dock integration, sound notifications) and forwards them to the store.
 */
export function useAppEvents(): void {
  useEffect(() => {
    const { selectProject, setView, setFeedbackOpen } = useAppStore.getState();

    const cancelDock = EventsOn("dock-project-selected", (name: string) => {
      selectProject(name);
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
    const cancelSound = EventsOn("play-sound", (kind: string) => {
      if (kind === "Done") playDoneSound();
      else if (kind === "Waiting") playWaitingSound();
      else if (kind === "Error") playErrorSound();
    });
    const cancelSyncError = EventsOn("sync-error", (msg: string) => {
      toast.error(`Sync push failed: ${msg}`);
    });

    return () => {
      if (typeof cancelDock === "function") cancelDock();
      if (typeof cancelSettings === "function") cancelSettings();
      if (typeof cancelCommitInstr === "function") cancelCommitInstr();
      if (typeof cancelPRInstr === "function") cancelPRInstr();
      if (typeof cancelBranchInstr === "function") cancelBranchInstr();
      if (typeof cancelFeedback === "function") cancelFeedback();
      if (typeof cancelSound === "function") cancelSound();
      if (typeof cancelSyncError === "function") cancelSyncError();
    };
  }, []);
}
