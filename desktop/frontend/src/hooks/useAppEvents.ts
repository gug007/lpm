import { useEffect } from "react";
import { toast } from "sonner";
import { EventsOn } from "../../bridge/runtime";
import { RemoteTakeRunActions } from "../../bridge/commands";
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
    // The mobile app asks to run an action / open a terminal. Requests are
    // queued in Rust and pulled here (the event is just a wake-up), so one that
    // arrives before this listener mounts is drained on mount instead of lost.
    // Each request activates the target project and parks for its ProjectDetail
    // to execute (only the mounted view owns the terminal tree).
    const drainRemoteActions = async () => {
      const pending: Array<{ project?: string; action?: string | null }> =
        (await RemoteTakeRunActions().catch(() => [])) ?? [];
      for (const req of pending) {
        if (req?.project) triggerRemoteAction(req.project, req.action ?? null);
      }
    };
    const cancelRemoteAction = EventsOn("remote-run-action", () => {
      void drainRemoteActions();
    });
    void drainRemoteActions();
    // The mobile app duplicated a project (Rust already created the copy) and wants
    // to run a task in it. Running a task is frontend-owned — the copy's mounted
    // ProjectDetail types the command + seeds the AI prompt — so queue it into
    // spawnTasks and mount the copy, exactly like bulkDuplicate does.
    const cancelRemoteRunTask = EventsOn(
      "remote-run-task",
      (payload: { project: string; task?: SpawnTask | null }) => {
        if (payload?.project && payload?.task) {
          useAppStore.getState().queueSpawnTask(payload.project, payload.task);
        }
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
      if (typeof cancelRemoteRunTask === "function") cancelRemoteRunTask();
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
