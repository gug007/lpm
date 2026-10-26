import { useEffect, useRef } from "react";
import { toast } from "../notifications/toast";
import { EventsOn } from "../../bridge/runtime";
import {
  DrainPendingJobTasks,
  RemoteSetAgentOptions,
  RemoteTakeRestoreRequests,
  RemoteTakeRunActions,
} from "../../bridge/commands";
import { agentOptionsForRemote, type RemoteTabRequest } from "../remoteAgentTabs";
import { type RemoteTerminalOp, useAppStore } from "../store/app";
import { useAutomationOpen } from "../store/automationOpen";
import { applyRemoteDraft } from "../store/composerDrafts";
import { onFocusMainTerminal } from "../windowFocus";
import { getSettings, useSettingsStore } from "../store/settings";
import { applySettingsOutsideStore } from "../settingsEffects";
import type { SpawnTask } from "../types";
import { displayNameForProjectName } from "../components/ProjectNameDisplay";
import { announceJobResult } from "../jobResultToast";
import { isPeerName, peerSlugOf, stripMarker } from "../peer/markers";
import { peerAlias, usePeerState, type PeerClient } from "../peer/usePeerState";

// A project as a toast names it: a paired machine's by its own name and where.
function projectPhrase(name: string, peers: PeerClient[]): string {
  if (!isPeerName(name)) return name;
  const label = displayNameForProjectName(name, useAppStore.getState().projects);
  return `${label} on ${peerAlias(peers, peerSlugOf(name) ?? "")}`;
}

// The app-wide Automations page, on the job a toast is about.
function openAutomationPage(id: string, project: string | null) {
  useAutomationOpen.getState().open({ id, project, host: null });
  useAppStore.getState().setView("scheduled");
}

// Events safe to handle in every window — they don't reach into
// main-window-only state (selection, settings view, modals). The main window
// passes `openAutomation` so a toast can take the user to the job.
export function useAmbientAppEvents(
  openAutomation?: (id: string, project: string | null) => void,
): void {
  const { state: peerState } = usePeerState();
  const peersRef = useRef(peerState.peers);
  peersRef.current = peerState.peers;
  useEffect(() => {
    const cancelSyncError = EventsOn("sync-error", (msg: string) => {
      toast.error(`Sync push failed: ${msg}`);
    });

    // A scheduled job finished a run. Only the outcomes worth interrupting for
    // get a toast — quiet days and skipped runs stay silent.
    const cancelJobStatus = EventsOn(
      "job-status",
      (payload: {
        project: string;
        jobId: string;
        label?: string;
        result: string;
        copy?: string;
        detail?: string;
        manual?: boolean;
        notify?: boolean;
      }) => {
        if (!payload?.result) return;
        // A quiet run that found nothing stays silent unless someone pressed
        // Run now and is waiting to hear it finished; a job that sends its
        // results elsewhere stays silent here.
        if (payload.result === "quiet" ? !payload.manual : payload.notify === false) return;
        const inProject = !!payload.project && !!stripMarker(payload.project);
        // Outcomes of a run inside a project need the project to make sense;
        // only a question can come from an app-wide automation.
        if (!inProject && payload.result !== "asked" && payload.result !== "quiet") return;
        announceJobResult(
          {
            jobId: payload.jobId,
            name: payload.label || payload.jobId,
            result: payload.result,
            project: inProject ? projectPhrase(payload.project, peersRef.current) : "",
            projectKey: payload.project,
            copy: payload.copy ? projectPhrase(payload.copy, peersRef.current) : undefined,
            detail: payload.detail,
            manual: payload.manual,
          },
          openAutomation,
        );
      },
    );

    // A job's results couldn't reach an outside destination — say so here, or
    // the message it carried would vanish without a word.
    const cancelSendToFailed = EventsOn(
      "send-to-failed",
      (payload: { destination: string; title: string; error: string }) => {
        if (!payload?.destination) return;
        toast.error(`Couldn't send to ${payload.destination}`, {
          description: `${payload.title} ${payload.error}`,
        });
      },
    );

    // A synced folder stopped on something it cannot get past on its own — a branch
    // carrying the user's commits, an ignored file that would be overwritten.
    const cancelFollowPaused = EventsOn(
      "follow-paused",
      (payload: { project: string; reason: string }) => {
        if (!payload?.project) return;
        toast.error(`Sync paused — ${payload.project}`, {
          description: payload.reason,
          duration: 15000,
        });
      },
    );

    // A mirror took the other Mac's version over something that was here. It is not
    // a failure and needs no answer, but where the old contents went is not
    // something the user should have to work out.
    const cancelFollowReplaced = EventsOn(
      "follow-replaced",
      (payload: { project: string; ref: string }) => {
        if (!payload?.project) return;
        toast.info(`Replaced local changes in ${payload.project}`, {
          description: `Recoverable with git restore --source ${payload.ref}`,
        });
      },
    );

    // A paired Mac changed some of this machine's settings on disk.
    const cancelPeerSettings = EventsOn("peer-settings-changed", () => {
      void useSettingsStore
        .getState()
        .hydrate()
        .then(() => applySettingsOutsideStore(getSettings()));
    });

    return () => {
      if (typeof cancelSyncError === "function") cancelSyncError();
      if (typeof cancelJobStatus === "function") cancelJobStatus();
      if (typeof cancelSendToFailed === "function") cancelSendToFailed();
      if (typeof cancelFollowPaused === "function") cancelFollowPaused();
      if (typeof cancelFollowReplaced === "function") cancelFollowReplaced();
      if (typeof cancelPeerSettings === "function") cancelPeerSettings();
    };
  }, []);
}

// Main-window only — these events drive navigation and selection that
// only the main shell renders; firing them in a detached window would
// silently mutate store fields nothing reads.
export function useAppEvents(): void {
  useAmbientAppEvents(openAutomationPage);
  useEffect(() => {
    const {
      selectProject,
      setView,
      setUsageOpen,
      setSettingsTab,
      setFeedbackOpen,
      addProject,
      triggerRemoteAction,
      triggerRemoteTerminalOp,
      markVisited,
      focusProjectTerminal,
      openProjectDetailView,
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
      const pending: Array<
        {
          project?: string;
          action?: string | null;
          inputValues?: Record<string, string>;
          confirmed?: boolean;
        } & RemoteTabRequest
      > = (await RemoteTakeRunActions().catch(() => [])) ?? [];
      for (const req of pending) {
        if (req?.project)
          triggerRemoteAction(req.project, req.action ?? null, req.inputValues, req.confirmed, {
            agent: req.agent,
            resume: req.resume,
            prompt: req.prompt,
          });
      }
    };
    const cancelRemoteAction = EventsOn("remote-run-action", () => {
      void drainRemoteActions();
    });
    void drainRemoteActions();
    // What a phone's New Tab sheet may start: this build's own agents and models.
    void RemoteSetAgentOptions(agentOptionsForRemote()).catch(() => {});
    // The mobile app duplicated a project (Rust already created the copy) and wants
    // to run a task in it. Running a task is frontend-owned — the copy's mounted
    // ProjectDetail types the command + seeds the AI prompt — so queue it into
    // spawnTasks and mount the copy, exactly like bulkDuplicate does.
    const cancelRemoteRunTask = EventsOn(
      "remote-run-task",
      (payload: { project: string; task?: SpawnTask | null; select?: boolean }) => {
        if (payload?.project && payload?.task) {
          const store = useAppStore.getState();
          // A freshly-duplicated copy is flagged for selection so its detail
          // mounts and the queued task fires without a manual click.
          if (payload.select) store.selectProject(payload.project);
          store.queueSpawnTask(payload.project, payload.task);
        }
      },
    );
    // A phone or a paired Mac asks to close / rename / pin / reorder a tab, or
    // to give it back its conversation title; the project's ProjectDetail
    // resolves it against its live tab tree and runs it. reorder carries the
    // full new id `order`; the others address a single `id`.
    const cancelRemoteTermOp = EventsOn(
      "remote-terminal-op",
      (payload: {
        project: string;
        op: RemoteTerminalOp;
        id: string;
        label?: string;
        emoji?: string | null;
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
            payload.emoji ?? undefined,
          );
        }
      },
    );
    // A phone or a paired Mac asked for the tabs of a project not shown since
    // launch: mount it off screen so its saved tabs come back. Asks made before
    // this listener was up are waiting in Rust.
    const cancelRestoreProject = EventsOn("remote-restore-project", (project: string) => {
      if (typeof project === "string" && project) markVisited(project);
    });
    void RemoteTakeRestoreRequests()
      .then((projects: string[] | null) => projects?.forEach((project) => markVisited(project)))
      .catch(() => {});
    // The phone typed into a terminal's composer. Mirror it into the matching
    // terminal's draft (and its mounted composer, if any).
    const cancelComposerDraft = EventsOn(
      "remote-composer-draft",
      (payload: { id: string; text: string; rev: number }) => {
        if (payload?.id !== undefined && typeof payload.text === "string") {
          applyRemoteDraft(payload.id, payload.text);
        }
      },
    );
    const cancelNavView = EventsOn("navigate-main-view", (view: string) => {
      // Usage is an overlay rather than a main-area view (a detached window asks
      // for it via FocusMainWindow("usage")), so route it to the modal.
      if (view === "usage") {
        setUsageOpen(true);
        return;
      }
      // "mobile" is a Settings tab rather than a view of its own.
      if (view === "mobile") {
        setSettingsTab("mobile");
        setView("settings");
        return;
      }
      setView(view as Parameters<typeof setView>[0]);
    });
    // `lpm automations open`: a project's automation opens in that project's
    // Automations tab; one with no project, or an SSH project's (no tab), on
    // the app-wide page.
    const cancelOpenAutomation = EventsOn(
      "open-automation",
      (payload: { id: string; project?: string | null }) => {
        if (!payload?.id) return;
        const project = payload.project ?? null;
        const inTab =
          project !== null &&
          useAppStore.getState().projects.some((p) => p.name === project && !p.isRemote);
        useAutomationOpen.getState().open({
          id: payload.id,
          project,
          host: inTab ? project : null,
        });
        if (inTab) openProjectDetailView(project, "automations");
        else setView("scheduled");
      },
    );
    const cancelNewProject = EventsOn("open-new-project", () => {
      addProject();
    });
    const cancelSettings = EventsOn("menu-open-settings", () => {
      setView("settings");
    });
    const cancelPRInstr = EventsOn("navigate-pr-instructions", () => {
      setView("pr-instructions");
    });
    const cancelFeedback = EventsOn("menu-open-feedback", () => {
      setFeedbackOpen(true);
    });
    const cancelFocusTerminal = onFocusMainTerminal(({ projectName, terminalId }) =>
      focusProjectTerminal(projectName, terminalId),
    );

    // A job that found work while the app window was closed parked its task in
    // Rust. Now that the main window (and the remote-run-task listener above)
    // exists, drain those parked tasks so each mounts its copy and runs. Safe to
    // call unconditionally — it's a no-op when nothing is parked.
    void DrainPendingJobTasks().catch(() => {});

    return () => {
      if (typeof cancelDock === "function") cancelDock();
      if (typeof cancelRemoteAction === "function") cancelRemoteAction();
      if (typeof cancelRemoteRunTask === "function") cancelRemoteRunTask();
      if (typeof cancelRemoteTermOp === "function") cancelRemoteTermOp();
      if (typeof cancelRestoreProject === "function") cancelRestoreProject();
      if (typeof cancelComposerDraft === "function") cancelComposerDraft();
      if (typeof cancelNavView === "function") cancelNavView();
      if (typeof cancelOpenAutomation === "function") cancelOpenAutomation();
      if (typeof cancelNewProject === "function") cancelNewProject();
      if (typeof cancelSettings === "function") cancelSettings();
      if (typeof cancelPRInstr === "function") cancelPRInstr();
      if (typeof cancelFeedback === "function") cancelFeedback();
      cancelFocusTerminal();
    };
  }, []);
}
