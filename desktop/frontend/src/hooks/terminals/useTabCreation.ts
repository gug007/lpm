import { useCallback, type RefObject } from "react";
import {
  StartTerminal,
  StartTerminalForConfig,
  StartTerminalForRestore,
  StartTerminalWithCwdEnv,
} from "../../../bridge/commands";
import { sendTerminalInput } from "../../terminal-io";
import { buildForkLaunch, claudeSessionIdOf } from "../../forkSession";
import { isInteractivePaneSessionDead } from "../../components/InteractivePane";
import {
  getProjectTerminals,
  removeHistoryEntry,
  updateProjectTerminalsCache,
  type PersistedHistoryEntry,
} from "../../terminals";
import {
  type PaneNode,
  type TerminalInstance,
  makePaneLeaf,
  makeTerminal,
  makeBrowser,
  makeReview,
  isTerminalTab,
  collectPanes,
  collectTerminals,
  findPane,
  firstPaneId,
  mapPane,
} from "../../paneTree";
import { useTabScroll } from "../../store/tabScroll";
import { useAppStore } from "../../store/app";
import { disambiguateLabel, pickTerminalLabel } from "../../terminalLabels";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { nextId, appendTerminal, foldAgentPrompt } from "./util";
import { type TerminalStartOpts } from "./types";

interface UseTabCreationProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  focusedRef: RefObject<string | null>;
  restoreSettled: RefObject<Promise<void>>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  forward: (kind: string, ...args: unknown[]) => void;
  scheduleCmdInject: (id: string, cmd: string, prompt?: string | string[]) => void;
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
    (term: TerminalInstance, targetPaneId?: string) => {
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
      const paneId = targetPaneId ?? focusedRef.current ?? firstPaneId(current);
      applyTree(mapPane(current, paneId, (p) => appendTerminal(p, labeled)), paneId);
    },
    [applyTree],
  );

  const createTerminal = useCallback(async () => {
    if (IS_MIRROR_WINDOW) return forward("createTerminal");
    await restoreSettled.current;
    try {
      const id = await StartTerminal(projectName);
      addTerminal(makeTerminal(id, pickTerminalLabel(treeRef.current)));
    } catch {}
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
      opts?: { startCmd?: string; resumeCmd?: string; actionName?: string },
    ) => {
      if (IS_MIRROR_WINDOW) return;
      await restoreSettled.current;
      const current = treeRef.current;
      // Idempotent: a re-fired op must not add a second tab for the same pty.
      if (current && collectTerminals(current).some((t) => t.id === id)) return;
      addTerminal(makeTerminal(id, label || pickTerminalLabel(current), opts));
    },
    [addTerminal],
  );

  const createTerminalWithCmd = useCallback(
    async (label: string, cmd: string, opts?: TerminalStartOpts) => {
      if (IS_MIRROR_WINDOW) return forward("createTerminalWithCmd", label, cmd, opts);
      await restoreSettled.current;
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
            if (pane.activeTabIdx !== idx || pane.activeServiceName !== undefined) {
              applyTree(mapPane(treeRef.current, pane.id, (p) => ({
                ...p,
                activeTabIdx: idx,
                activeServiceName: undefined,
              })), pane.id);
            }
            // Always bring the reused tab into view: when it's already active no
            // pane state changes, so PaneView's activation effect wouldn't fire.
            useTabScroll.getState().requestScroll(pane.id);
            const reused = foldAgentPrompt(cmd, opts.prompt);
            await sendTerminalInput(pane.tabs[idx].id, reused.cmd + "\n");
            scheduleSeedInject(pane.tabs[idx].id, reused.prompt);
            return;
          }
        }
      }

      // Named configs go through the restore-aware RPC: the Go side owns
      // the session-id rewrite so launch.startCmd is authoritative, and a
      // non-empty resumeCmd is the signal that this terminal opted into
      // restore and both cmds should be persisted.
      if (opts?.configName) {
        const launch = await StartTerminalForConfig(projectName, opts.configName);
        const term = makeTerminal(launch.id, label, {
          ...(launch.resumeCmd && { startCmd: launch.startCmd, resumeCmd: launch.resumeCmd }),
          actionName: opts.actionName,
          emoji: opts.emoji,
          color: opts.color,
        });
        addTerminal(term);
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
      const id = (opts?.cwd || opts?.env)
        ? await StartTerminalWithCwdEnv(projectName, opts.cwd ?? "", opts.env ?? {})
        : await StartTerminal(projectName);
      addTerminal(
        makeTerminal(id, label, {
          actionName: opts?.actionName,
          emoji: opts?.emoji,
          color: opts?.color,
          startCmd: opts?.startCmd,
          resumeCmd: opts?.resumeCmd,
        }),
      );
      const folded = foldAgentPrompt(cmd, opts?.prompt);
      scheduleCmdInject(id, folded.cmd, folded.prompt);
    },
    [projectName, addTerminal, applyTree, scheduleCmdInject, scheduleSeedInject, forward],
  );

  const resumeFromHistory = useCallback(
    async (entry: PersistedHistoryEntry) => {
      if (IS_MIRROR_WINDOW) return forward("resumeFromHistory", entry);
      let id: string;
      try {
        id = entry.actionName
          ? await StartTerminalForRestore(projectName, entry.actionName)
          : await StartTerminal(projectName);
      } catch {
        return;
      }
      const stateAfterRemove = removeHistoryEntry(
        getProjectTerminals(projectName),
        entry.resumeCmd,
      );
      updateProjectTerminalsCache(projectName, stateAfterRemove);
      const term = makeTerminal(id, entry.label, {
        startCmd: entry.startCmd,
        resumeCmd: entry.resumeCmd,
        actionName: entry.actionName,
      });
      addTerminal(term);
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
      try {
        id = tab.actionName
          ? await StartTerminalForRestore(projectName, tab.actionName)
          : await StartTerminal(projectName);
      } catch {
        return;
      }
      addTerminal(
        makeTerminal(id, tab.label, {
          startCmd: tab.startCmd,
          resumeCmd: launch.resumeCmd,
          actionName: tab.actionName,
          emoji: tab.emoji,
          color: tab.color,
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
      if (IS_MIRROR_WINDOW) return forward("forkTerminalIntoCopy", paneId, termId);
      const current = treeRef.current;
      if (!current) return;
      const tab = findPane(current, paneId)?.tabs.find((t) => t.id === termId);
      if (!tab?.resumeCmd || !isTerminalTab(tab)) return;
      const launch = buildForkLaunch(tab.resumeCmd);
      if (!launch) return;
      const sessionId = claudeSessionIdOf(tab.resumeCmd);
      await useAppStore.getState().bulkDuplicate(projectName, 1, {
        excludeUncommitted: false,
        reinstallDeps: false,
        pullLatest: false,
        tasksPerCopy: [
          [
            {
              kind: "fork",
              command: launch.cmd,
              label: tab.label,
              startCmd: tab.startCmd,
              resumeCmd: launch.resumeCmd,
              actionName: tab.actionName,
              emoji: tab.emoji,
              color: tab.color,
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
    async (paneId: string) => {
      if (IS_MIRROR_WINDOW) return forward("addTerminalToPane", paneId);
      try {
        const id = await StartTerminal(projectName);
        addTerminal(makeTerminal(id, pickTerminalLabel(treeRef.current)), paneId);
      } catch {}
    },
    [projectName, addTerminal, forward],
  );

  // Browser tabs have no PTY — no StartTerminal, just a webview keyed by id.
  // Still owner-created so the tab id is minted once, in the tree of record.
  const addBrowserToPane = useCallback(
    (paneId?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addBrowserToPane", paneId);
      addTerminal(makeBrowser(nextId("browser")), paneId);
    },
    [addTerminal, forward],
  );

  // Review tabs have no PTY — they render the git diff review pane keyed by id.
  const addReviewToPane = useCallback(
    (paneId?: string) => {
      if (IS_MIRROR_WINDOW) return forward("addReviewToPane", paneId);
      addTerminal(makeReview(nextId("review")), paneId);
    },
    [addTerminal, forward],
  );

  return {
    createTerminal,
    adoptTerminal,
    createTerminalWithCmd,
    resumeFromHistory,
    forkTerminal,
    forkTerminalIntoCopy,
    addTerminalToPane,
    addBrowserToPane,
    addReviewToPane,
  };
}
