import { useEffect } from "react";
import { toast } from "sonner";
import { EventsOn } from "../../bridge/runtime";
import { useAppStore } from "../store/app";
import type { SpawnTask } from "../types";

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
    const {
      selectProject,
      setView,
      setFeedbackOpen,
      addProject,
      triggerRemoteAction,
      triggerRemoteTerminalOp,
    } = useAppStore.getState();

    const cancelDock = EventsOn("dock-project-selected", (name: string) => {
      selectProject(name);
    });
    // The mobile app asks to run an action / open a terminal; activate the target
    // project and park the request for its ProjectDetail to execute (only the
    // mounted view owns the terminal tree).
    const cancelRemoteAction = EventsOn(
      "remote-run-action",
      (payload: { project: string; action?: string | null }) => {
        if (payload?.project) triggerRemoteAction(payload.project, payload.action ?? null);
      },
    );
    // The mobile app duplicates a project AND wants to run something in each copy.
    // Running a task is frontend-owned (the copy's mounted ProjectDetail types the
    // command + seeds the AI prompt), so the phone relays here and we reuse the
    // exact bulkDuplicate path the desktop modal uses.
    const cancelRemoteBulkDup = EventsOn(
      "remote-bulk-duplicate",
      (payload: {
        name: string;
        count?: number;
        labels?: string[];
        excludeUncommitted?: boolean;
        reinstallDeps?: boolean;
        pullLatest?: boolean;
        groupName?: string;
        task?: SpawnTask | null;
      }) => {
        if (!payload?.name) return;
        const count = Math.max(1, Math.min(50, payload.count ?? 1));
        const tasks = payload.task ? [payload.task] : [];
        void useAppStore.getState().bulkDuplicate(payload.name, count, {
          excludeUncommitted: !!payload.excludeUncommitted,
          reinstallDeps: !!payload.reinstallDeps,
          pullLatest: payload.pullLatest ?? true,
          labels: payload.labels ?? [],
          tasksPerCopy: Array.from({ length: count }, () => tasks),
          groupName: payload.groupName ?? "",
        });
      },
    );
    // The mobile app asks to close / rename / pin / reorder a terminal tab; the
    // mounted ProjectDetail resolves it against its live tab tree and runs it.
    // reorder carries the full new id `order`; the others address a single `id`.
    const cancelRemoteTermOp = EventsOn(
      "remote-terminal-op",
      (payload: {
        project: string;
        op: "close" | "rename" | "pin" | "reorder";
        id: string;
        label?: string;
        order?: string[];
      }) => {
        const ok = payload?.op === "reorder" ? !!payload.order?.length : !!payload?.id;
        if (payload?.project && payload?.op && ok) {
          triggerRemoteTerminalOp(
            payload.project,
            payload.op,
            payload.id,
            payload.label ?? "",
            payload.order ?? [],
          );
        }
      },
    );
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
      if (typeof cancelRemoteAction === "function") cancelRemoteAction();
      if (typeof cancelRemoteBulkDup === "function") cancelRemoteBulkDup();
      if (typeof cancelRemoteTermOp === "function") cancelRemoteTermOp();
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
