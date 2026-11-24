import { useEffect, useRef, type RefObject } from "react";
import { agentStates } from "../../closeGuard";
import { IS_MIRROR_WINDOW } from "../../mirror";
import {
  collectTerminals,
  findTerminalLocation,
  isTerminalTab,
  terminalDisplayLabel,
  type PaneNode,
  type TerminalInstance,
} from "../../paneTree";
import { onStatusEntriesChange, projectStatusEntries, refreshStatusEntries } from "../../projectStatusEntries";
import { hasComposerText } from "../../store/composerDrafts";
import { useSendLater } from "../../store/sendLater";
import { useTerminalCommands } from "../../store/terminalCommands";
import { terminalStripLabel } from "../../tabCommand";
import { decideClose, matchingTabs, namedTab, type ClosableTab } from "../../tabClose/decide";
import { answerTabCloses, type CloseTabAnswer, type CloseTabRequest } from "../../tabClose/request";

// How long a tab that closes after its agent's first turn waits for that turn.
const FIRST_TURN_MS = 10 * 60_000;

interface UseTabCloseRequestsProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  restoreSettled: RefObject<Promise<void>>;
  closeTerminal: (paneId: string, tabIdx: number) => void;
  closeTabWhenDone: (id: string) => void;
}

function closableTabs(projectName: string, tree: PaneNode | null, request: CloseTabRequest): ClosableTab[] {
  if (!tree) return [];
  const { byId } = useTerminalCommands.getState();
  const scheduled = new Set(
    useSendLater.getState().items.filter((i) => i.projectName === projectName).map((i) => i.historyKey),
  );
  const holds = (t: TerminalInstance): ClosableTab["holds"] => {
    if (hasComposerText(t.id, t.historyKey)) return "unsent";
    return t.historyKey && scheduled.has(t.historyKey) ? "scheduled" : null;
  };
  return collectTerminals(tree)
    .filter(isTerminalTab)
    .map((t) => ({
      id: t.id,
      names: [terminalStripLabel(t, byId[t.id]), terminalDisplayLabel(t)],
      pinned: t.pinned === true,
      facts: request.facts[t.id] ?? {},
      command: byId[t.id]?.running?.command ?? null,
      ranCommand: byId[t.id] !== undefined,
      holds: holds(t),
    }));
}

// Closes asked for by `lpm close`, answered with what happened. Each is decided
// and done in one go against the tabs as they are, so nothing changes in between.
export function useTabCloseRequests(props: UseTabCloseRequestsProps): void {
  const { projectName, treeRef, restoreSettled } = props;
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    const firstTurns = new Map<string, () => void>();

    // The wait itself starts with the agent's turn: before it there is none to
    // tell from an agent that has finished.
    const closeAfterFirstTurn = (id: string) => {
      if (firstTurns.has(id)) return;
      const check = () => {
        const tab = treeRef.current && collectTerminals(treeRef.current).find((t) => t.id === id);
        if (!tab) return firstTurns.get(id)?.();
        const state = agentStates([tab], projectStatusEntries(projectName)).get(id);
        if (!state) return;
        firstTurns.get(id)?.();
        if (state !== "stopped") latest.current.closeTabWhenDone(id);
      };
      const offStatuses = onStatusEntriesChange(check);
      const timer = setTimeout(() => firstTurns.get(id)?.(), FIRST_TURN_MS);
      firstTurns.set(id, () => {
        firstTurns.delete(id);
        offStatuses();
        clearTimeout(timer);
      });
      check();
    };

    const carryOut = (tab: ClosableTab, how: "close" | "wait" | "waitForFirstTurn"): CloseTabAnswer => {
      const named = namedTab(tab);
      if (how === "waitForFirstTurn") {
        closeAfterFirstTurn(tab.id);
        return { ok: true, result: "firstTurn", ...named };
      }
      if (how === "wait") {
        latest.current.closeTabWhenDone(tab.id);
        return { ok: true, result: "whenDone", ...named };
      }
      const at = treeRef.current && findTerminalLocation(treeRef.current, tab.id);
      if (at) latest.current.closeTerminal(at.paneId, at.tabIdx);
      return { ok: true, result: "closed", ...named };
    };

    const stop = answerTabCloses(projectName, async (request) => {
      await Promise.all([
        restoreSettled.current,
        // A window that was asleep reads what its agents do before it marks a tab.
        request.whenDone && refreshStatusEntries(projectName).catch(() => {}),
      ]);
      const tabs = closableTabs(projectName, treeRef.current, request);
      const found = matchingTabs(tabs, request.tab);
      if (found.length !== 1) {
        return found.length === 0
          ? { ok: false, result: "notFound", tabs: tabs.map(namedTab) }
          : { ok: false, result: "ambiguous", tabs: found.map(namedTab) };
      }
      const verdict = decideClose(found[0], request);
      if ("do" in verdict) return carryOut(found[0], verdict.do);
      return {
        ok: false,
        result: "refused",
        reason: verdict.refuse,
        ...(verdict.detail ? { detail: verdict.detail } : {}),
        ...namedTab(found[0]),
      };
    });
    return () => {
      stop();
      for (const end of [...firstTurns.values()]) end();
    };
  }, [projectName, treeRef, restoreSettled]);
}
