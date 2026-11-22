import { useCallback, type RefObject } from "react";
import { toast } from "../../notifications/toast";
import {
  CopyClaudeSessionForFork,
  StartTerminal,
  StartTerminalForConfig,
  StartTerminalForRestore,
  StartTerminalWithCwdEnv,
} from "../../../bridge/commands";
import { sendTerminalInput } from "../../terminal-io";
import { setBrowserStartUrl } from "../../browserStartUrls";
import { logDiagnostic } from "../../diagnostics";
import { terminalStartFailed } from "./terminalStartFailed";
import { buildForkLaunch, claudeSessionIdOf } from "../../forkSession";
import { claudeResumeSessionId } from "../../agentSession";
import { isInteractivePaneSessionDead } from "../../components/InteractivePane";
import { useTerminalCommands } from "../../store/terminalCommands";
import {
  getProjectTerminals,
  removeHistoryEntry,
  updateProjectTerminalsCache,
  type PersistedHistoryEntry,
} from "../../terminals";
import {
  type AdoptedTabOpts,
  type PaneNode,
  type TerminalInstance,
  makePaneLeaf,
  makeTerminal,
  makeBrowser,
  makeMemory,
  makeToolkit,
  makeFiles,
  makeAutomations,
  makeCommands,
  makeApp,
  type AppTabSeed,
  isTerminalTab,
  collectPanes,
  collectTerminals,
  findPane,
  firstPaneId,
  mapPane,
  terminalDisplayLabel,
  forkLabel,
} from "../../paneTree";
import { useTabScroll } from "../../store/tabScroll";
import { useAppStore } from "../../store/app";
import {
  disambiguateLabel,
  disambiguateLabelAgainst,
  pickTerminalLabel,
} from "../../terminalLabels";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { noteOpenedByOtherMac } from "../../peer/openedByOtherMac";
import { nextId, appendTerminal, configLaunchCmds, foldAgentPrompt, reuseLaunch } from "./util";
import { type TerminalStartOpts } from "./types";
import { pinLaunchCommand } from "../../agentLaunchModel";
import { agentFolderRoots, withAgentFolders } from "../../agentFolders";
import { DEFAULT_SHELL } from "../../shells";

interface UseTabCreationProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  focusedRef: RefObject<string | null>;
  restoreSettled: RefObject<Promise<void>>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  forward: (kind: string, ...args: unknown[]) => void;
  scheduleCmdInject: (
    id: string,
    cmd: string,
    prompt?: string | string[],
  ) => void;
  scheduleSeedInject: (id: string, prompt?: string | string[]) => void;
}

export function useTabCreation({
  projectName,
  treeRef,
  focusedRef,
  restoreSettled,
  applyTree,
  forward,
  scheduleCmdInject,
  scheduleSeedInject,
}: UseTabCreationProps) {
  // Central path for adding a terminal: either to an explicit pane, the
  // focused pane, or a fresh root pane if the tree is empty.
  const addTerminal = useCallback(
    (term: TerminalInstance, targetPaneId?: string, background = false) => {
      const current = treeRef.current;
      // Suffix duplicate PTY-tab labels ("Ultracode 2", "Ultracode 3") at the
      // one path every add funnels through, so no caller can reintroduce a
      // collision. Generic "Terminal N" labels are already unique (no-op);
      // browser/review tabs keep their bare shared names.
      const labeled = isTerminalTab(term)
        ? { ...term, label: disambiguateLabel(current, term.label) }
        : term;
      if (!current) {
        const paneId = targetPaneId ?? nextId("pane");
        applyTree(makePaneLeaf(paneId, [labeled], 0), paneId);
        return;
      }
      const target = targetPaneId && findPane(current, targetPaneId) ? targetPaneId : undefined;
      const paneId = target ?? focusedRef.current ?? firstPaneId(current);
      const next = mapPane(current, paneId, (p) => appendTerminal(p, labeled, background));
      if (background) applyTree(next);
      else applyTree(next, paneId);
    },
    [applyTree],
  );

  const createTerminal = useCallback(async (background = false, shell = DEFAULT_SHELL) => {
    if (IS_MIRROR_WINDOW) return forward("createTerminal", background, shell);
    await restoreSettled.current;
    try {
      const id = await StartTerminal(projectName, undefined, undefined, undefined, undefined, shell);
      addTerminal(makeTerminal(id, pickTerminalLabel(treeRef.current), { shell }), undefined, background);
    } catch (err) {
      // Swallowing this silently makes a failed spawn look like a dead button —
      // which is exactly how a host that couldn't find its shell presented.
      logDiagnostic("error", "terminal.create", "Could not open a terminal", {
        project: projectName,
        error: String(err),
      });
      terminalStartFailed(err);
    }
  }, [projectName, addTerminal, forward]);

  // Adopt an already-spawned pty as a tab WITHOUT starting a new one or
  // injecting any command — used when a peer Mac spawned the terminal on this
  // host via the generic dispatcher (the peer injects its own startCmd). The
  // tab attaches to the existing pty-output-{id} stream; control ownership shows
  // the "Take control" placeholder while the peer drives it.
  const adoptTerminal = useCallback(
    async (
      id: string,
      label?: string,
      opts?: AdoptedTabOpts,
    ) => {
      if (IS_MIRROR_WINDOW) return;
      await restoreSettled.current;
      const current = treeRef.current;
      // Idempotent: a re-fired op must not add a second tab for the same pty.
      if (current && collectTerminals(current).some((t) => t.id === id)) return;
      noteOpenedByOtherMac(id);
      // Someone at this Mac keeps the tab they're on.
      addTerminal(
        makeTerminal(id, label || pickTerminalLabel(current), {
          ...opts,
          peerAdopted: true,
        }),
        undefined,
        true,
      );
    },
    [addTerminal],
  );

  // A tab moved here from another project (tabMove.ts): the same tab, its pty
  // still running, added behind the one on screen. It keeps the folder it
  // started in unless that is this project's own.
  const takeInTerminal = useCallback(
    async (tab: TerminalInstance, root: string) => {
      if (IS_MIRROR_WINDOW) return;
      await restoreSettled.current;
      const current = treeRef.current;
      if (current && collectTerminals(current).some((t) => t.id === tab.id)) return;
      const { cwd, ...rest } = tab;
      addTerminal(cwd && cwd !== root ? { ...rest, cwd } : rest, undefined, true);
    },
    [addTerminal],
  );

  const createTerminalWithCmd = useCallback(
    async (label: string, cmd: string, opts?: TerminalStartOpts) => {
      if (IS_MIRROR_WINDOW)
        return forward("createTerminalWithCmd", label, cmd, opts);
      await restoreSettled.current;
      const folders = agentFolderRoots(projectName);
      cmd = withAgentFolders(pinLaunchCommand(cmd, opts?.launchModel), folders);
      // When reuse is requested, find an existing live terminal tagged with
      // the same actionName. A dead session (process exited) falls through
      // so the user gets a fresh PTY instead of typing into a dead tab.
      if (opts?.reuse && opts?.actionName && treeRef.current) {
        for (const pane of collectPanes(treeRef.current)) {
          const idx = pane.tabs.findIndex(
            (t) =>
              t.actionName === opts.actionName &&
              !isInteractivePaneSessionDead(t.id),
          );
          if (idx !== -1) {
            if (
              !opts.background &&
              (pane.activeTabIdx !== idx || pane.activeServiceName !== undefined)
            ) {
              applyTree(
                mapPane(treeRef.current, pane.id, (p) => ({
                  ...p,
                  activeTabIdx: idx,
                  activeServiceName: undefined,
                })),
                pane.id,
              );
            }
            // Always bring the reused tab into view: when it's already active no
            // pane state changes, so PaneView's activation effect wouldn't fire.
            if (!opts.background) useTabScroll.getState().requestScroll(pane.id);
            const tabId = pane.tabs[idx].id;
            const busy = Boolean(useTerminalCommands.getState().byId[tabId]?.running);
            const reused = reuseLaunch(cmd, opts.prompt, busy);
            if (reused.cmd) await sendTerminalInput(tabId, reused.cmd + "\n");
            scheduleSeedInject(tabId, reused.prompt);
            return;
          }
        }
      }

      // Named configs go through the restore-aware RPC: the Go side owns
      // the session-id rewrite so launch.startCmd is authoritative, and a
      // non-empty resumeCmd is the signal that this terminal opted into
      // restore (see configLaunchCmds for what the tab keeps).
      if (opts?.configName) {
        // The backend writes this command itself, so it is pinned here too.
        const tab = { label, emoji: opts.emoji, color: opts.color, actionName: opts.actionName };
        let started: Awaited<ReturnType<typeof StartTerminalForConfig>>;
        try {
          started = await StartTerminalForConfig(projectName, opts.configName, opts.fixedAccount, tab);
        } catch (err) {
          terminalStartFailed(err, label);
          return;
        }
        const launch = {
          ...started,
          startCmd: withAgentFolders(pinLaunchCommand(started.startCmd, opts.launchModel), folders),
          resumeCmd: withAgentFolders(pinLaunchCommand(started.resumeCmd, opts.launchModel), folders),
        };
        const term = makeTerminal(launch.id, label, {
          ...configLaunchCmds(launch),
          actionName: opts.actionName,
          emoji: opts.emoji,
          color: opts.color,
        });
        addTerminal(term, opts.paneId, opts.background);
        if (launch.startCmd) {
          // Fold into the injected command only; `term` persists the original
          // startCmd so a later restore relaunches without re-seeding the task.
          const folded = foldAgentPrompt(launch.startCmd, opts.prompt);
          scheduleCmdInject(launch.id, folded.cmd, folded.prompt);
        } else {
          scheduleSeedInject(launch.id, opts.prompt);
        }
        return;
      }

      // Ad-hoc command terminals (e.g. action-as-terminal invocations) are
      // ephemeral — the command is typed once but not persisted.
      const sessionId = claudeResumeSessionId(cmd);
      const tab = { label, emoji: opts?.emoji, color: opts?.color, actionName: opts?.actionName };
      let id: string;
      try {
        id =
          opts?.cwd || opts?.env
            ? await StartTerminalWithCwdEnv(
                projectName,
                opts.cwd ?? "",
                opts.env ?? {},
                sessionId,
                opts.fixedAccount,
                tab,
              )
            : await StartTerminal(projectName, sessionId, opts?.fixedAccount, tab, undefined, opts?.shell);
      } catch (err) {
        terminalStartFailed(err, label);
        return;
      }
      addTerminal(
        makeTerminal(id, label, {
          shell: opts?.shell,
          actionName: opts?.actionName,
          emoji: opts?.emoji,
          color: opts?.color,
          startCmd: opts?.startCmd,
          resumeCmd: opts?.resumeCmd,
          memory: opts?.memory,
        }),
        opts?.paneId,
        opts?.background,
      );
      const folded = foldAgentPrompt(cmd, opts?.prompt);
      scheduleCmdInject(id, folded.cmd, folded.prompt);
    },
    [
      projectName,
      addTerminal,
      applyTree,
      scheduleCmdInject,
      scheduleSeedInject,
      forward,
    ],
  );

  const resumeFromHistory = useCallback(
    async (entry: PersistedHistoryEntry, background = false) => {
      if (IS_MIRROR_WINDOW) return forward("resumeFromHistory", entry, background);
      let id: string;
      const sessionId = claudeResumeSessionId(entry.resumeCmd);
      try {
        id = entry.actionName
          ? await StartTerminalForRestore(projectName, entry.actionName, sessionId)
          : await StartTerminal(projectName, sessionId);
      } catch (err) {
        terminalStartFailed(err, "Couldn't resume the session");
        return;
      }
      const stateAfterRemove = removeHistoryEntry(
        getProjectTerminals(projectName),
        entry.resumeCmd,
      );
      updateProjectTerminalsCache(projectName, stateAfterRemove);
      const sessionTitle =
        entry.sessionTitle && entry.sessionTitleSource !== "manual"
          ? disambiguateLabel(treeRef.current, entry.sessionTitle)
          : entry.sessionTitle;
      const term = makeTerminal(id, entry.label, {
        sessionTitle,
        sessionTitleId: entry.sessionTitleId,
        sessionTitleSource: entry.sessionTitleSource,
        startCmd: entry.startCmd,
        resumeCmd: entry.resumeCmd,
        actionName: entry.actionName,
      });
      addTerminal(term, undefined, background);
      scheduleCmdInject(id, entry.resumeCmd);
    },
    [projectName, addTerminal, scheduleCmdInject, forward],
  );

  // Fork a live agent session into a sibling tab: the new terminal continues
  // the tab's conversation (Claude --fork-session / Codex resume) while the
  // original keeps running. Id-addressed so a mirror-forwarded fork can't hit
  // the wrong tab after a concurrent reorder/close.
  const forkTerminal = useCallback(
    async (paneId: string, termId: string) => {
      if (IS_MIRROR_WINDOW) return forward("forkTerminal", paneId, termId);
      const current = treeRef.current;
      if (!current) return;
      const tab = findPane(current, paneId)?.tabs.find((t) => t.id === termId);
      if (!tab?.resumeCmd || !isTerminalTab(tab)) return;
      const launch = buildForkLaunch(tab.resumeCmd);
      if (!launch) return;
      let id: string;
      // The fork starts on the account this project's new sessions use, so
      // the conversation it branches from has to be there first.
      const source = claudeSessionIdOf(tab.resumeCmd);
      try {
        if (source) await CopyClaudeSessionForFork(projectName, projectName, source);
        id = tab.actionName
          ? await StartTerminalForRestore(projectName, tab.actionName)
          : await StartTerminal(projectName);
      } catch (err) {
        toast.error(`Couldn't fork the session: ${String(err)}`);
        return;
      }
      addTerminal(
        makeTerminal(id, forkLabel(tab.label), {
          startCmd: launch.startCmd ?? tab.startCmd,
          resumeCmd: launch.resumeCmd,
          actionName: tab.actionName,
          emoji: tab.emoji,
          color: tab.color,
          // A fork carries on the same conversation, memory session included.
          memory: tab.memory,
          forkOf: { label: terminalDisplayLabel(tab), at: Date.now() },
        }),
        paneId,
      );
      scheduleCmdInject(id, launch.cmd);
    },
    [projectName, addTerminal, scheduleCmdInject, forward],
  );

  // Fork a live agent session into a fresh duplicate of the project: create
  // one copy (working tree as-is — no pull, uncommitted kept) and queue a
  // "fork" spawn task that continues the conversation in the copy's terminal.
  const forkTerminalIntoCopy = useCallback(
    async (paneId: string, termId: string) => {
      if (IS_MIRROR_WINDOW)
        return forward("forkTerminalIntoCopy", paneId, termId);
      const current = treeRef.current;
      if (!current) return;
      const tab = findPane(current, paneId)?.tabs.find((t) => t.id === termId);
      if (!tab?.resumeCmd || !isTerminalTab(tab)) return;
      const launch = buildForkLaunch(tab.resumeCmd);
      if (!launch) return;
      const sessionId = claudeSessionIdOf(tab.resumeCmd);
      // The same copy a fork into a tab makes: it fails while Claude hasn't
      // saved the conversation, before a duplicate is made for nothing.
      if (sessionId) {
        try {
          await CopyClaudeSessionForFork(projectName, projectName, sessionId);
        } catch (err) {
          toast.error(`Couldn't fork the session: ${String(err)}`);
          return;
        }
      }
      await useAppStore.getState().bulkDuplicate(projectName, 1, {
        excludeUncommitted: false,
        reinstallDeps: false,
        pullLatest: false,
        tasksPerCopy: [
          [
            {
              kind: "fork",
              command: launch.cmd,
              label: forkLabel(tab.label),
              startCmd: launch.startCmd ?? tab.startCmd,
              resumeCmd: launch.resumeCmd,
              actionName: tab.actionName,
              emoji: tab.emoji,
              color: tab.color,
              // The copy shares the original's memory folder, so the session
              // the forked conversation was working under is still valid there.
              ...(tab.memory ? { memory: tab.memory } : {}),
              ...(sessionId
                ? { claudeSession: { sourceProject: projectName, sessionId } }
                : {}),
            },
          ],
        ],
      });
    },
    [projectName, forward],
  );

  const addTerminalToPane = useCallback(
    async (paneId: string, shell = DEFAULT_SHELL) => {
      if (IS_MIRROR_WINDOW) return forward("addTerminalToPane", paneId, shell);
      try {
        const id = await StartTerminal(projectName, undefined, undefined, undefined, undefined, shell);
        addTerminal(
          makeTerminal(id, pickTerminalLabel(treeRef.current), { shell }),
          paneId,
        );
      } catch (err) {
        terminalStartFailed(err);
      }
    },
    [projectName, addTerminal, forward],
  );

  // Browser tabs have no PTY — no StartTerminal, just a webview keyed by id.
  // Still owner-created so the tab id is minted once, in the tree of record.
  // With a `url` the tab opens on that page instead of its start screen.
  const addBrowserToPane = useCallback(
    (paneId?: string, url?: string, label?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addBrowserToPane", paneId, url, label);
      const id = nextId("browser");
      if (url) setBrowserStartUrl(id, url);
      addTerminal(makeBrowser(id, label), paneId);
    },
    [addTerminal, forward],
  );

  // Memory tabs have no PTY — they render the session-memory page.
  const addMemoryToPane = useCallback(
    (paneId?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addMemoryToPane", paneId);
      addTerminal(makeMemory(nextId("memory")), paneId);
    },
    [addTerminal, forward],
  );

  // Toolkit tabs have no PTY either — they render the agent-capabilities page.
  const addToolkitToPane = useCallback(
    (paneId?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addToolkitToPane", paneId);
      addTerminal(makeToolkit(nextId("toolkit")), paneId);
    },
    [addTerminal, forward],
  );

  // Files tabs have no PTY either — they render the project file browser.
  const addFilesToPane = useCallback(
    (paneId?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addFilesToPane", paneId);
      addTerminal(makeFiles(nextId("files")), paneId);
    },
    [addTerminal, forward],
  );

  // Automations tabs have no PTY either — they render the project's scheduled jobs.
  const addAutomationsToPane = useCallback(
    (paneId?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addAutomationsToPane", paneId);
      addTerminal(makeAutomations(nextId("automations")), paneId);
    },
    [addTerminal, forward],
  );

  // Skills tabs have no PTY either — they render the lpm skills lists.
  const addCommandsToPane = useCallback(
    (paneId?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addCommandsToPane", paneId);
      addTerminal(makeCommands(nextId("commands")), paneId);
    },
    [addTerminal, forward],
  );

  // App tabs have no PTY either — they render an action's page.
  const addAppToPane = useCallback(
    (seed: AppTabSeed, paneId?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addAppToPane", seed, paneId);
      addTerminal(makeApp(nextId("app"), seed), paneId);
    },
    [addTerminal, forward],
  );

  return {
    createTerminal,
    adoptTerminal,
    takeInTerminal,
    createTerminalWithCmd,
    resumeFromHistory,
    forkTerminal,
    forkTerminalIntoCopy,
    addTerminalToPane,
    addAppToPane,
    addBrowserToPane,
    addMemoryToPane,
    addToolkitToPane,
    addFilesToPane,
    addAutomationsToPane,
    addCommandsToPane,
  };
}
