import { useCallback, type RefObject } from "react";
import { askClose, busyTabs } from "../../closeGuard";
import {
  findPane,
  findTerminalLocation,
  isTabPinned,
  otherClosableTabs,
  type PaneNode,
  type TerminalInstance,
} from "../../paneTree";
import { projectStatusEntries } from "../../projectStatusEntries";

interface UseCloseGuardedTabsProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  closeTerminal: (paneId: string, tabIdx: number) => void;
  closeOtherTerminals: (paneId: string, tabIdx: number) => void;
  closePane: (paneId: string) => void;
  closeTabWhenDone: (id: string) => void;
  closeOthersWhenDone: (paneId: string, keptId: string) => void;
  closePaneWhenDone: (paneId: string) => void;
  keepOpen: (id: string) => void;
}

// The closes the user asks for here: at once when no agent is mid-task, else
// once they said what to do with it. The question can outlast the layout it was
// asked in, so the answer finds its tab again by id.
export function useCloseGuardedTabs({
  projectName,
  treeRef,
  closeTerminal,
  closeOtherTerminals,
  closePane,
  closeTabWhenDone,
  closeOthersWhenDone,
  closePaneWhenDone,
  keepOpen,
}: UseCloseGuardedTabsProps) {
  const busyAmong = useCallback(
    (tabs: TerminalInstance[]) => busyTabs(tabs, projectStatusEntries(projectName)),
    [projectName],
  );

  const at = useCallback(
    (id: string) => (treeRef.current ? findTerminalLocation(treeRef.current, id) : null),
    [treeRef],
  );

  const requestCloseTab = useCallback(
    (paneId: string, tabIdx: number) => {
      const pane = treeRef.current && findPane(treeRef.current, paneId);
      const tab = pane?.tabs[tabIdx];
      const agents = pane && tab && !isTabPinned(pane, tabIdx) ? busyAmong([tab]) : [];
      if (!tab || agents.length === 0) return closeTerminal(paneId, tabIdx);
      askClose({
        what: "tab",
        agents,
        closeNow: () => {
          const now = at(tab.id);
          if (now) closeTerminal(now.paneId, now.tabIdx);
        },
        closeWhenDone: () => closeTabWhenDone(tab.id),
        keepOpen: tab.closeWhenDone && (() => keepOpen(tab.id)),
      });
    },
    [treeRef, busyAmong, at, closeTerminal, closeTabWhenDone, keepOpen],
  );

  const requestCloseOthers = useCallback(
    (paneId: string, tabIdx: number) => {
      const pane = treeRef.current && findPane(treeRef.current, paneId);
      const kept = pane?.tabs[tabIdx];
      const agents = pane && kept ? busyAmong(otherClosableTabs(pane.tabs, kept.id)) : [];
      if (!kept || agents.length === 0) return closeOtherTerminals(paneId, tabIdx);
      askClose({
        what: "others",
        agents,
        closeNow: () => {
          const now = at(kept.id);
          if (now?.paneId === paneId) closeOtherTerminals(paneId, now.tabIdx);
        },
        closeWhenDone: () => closeOthersWhenDone(paneId, kept.id),
      });
    },
    [treeRef, busyAmong, at, closeOtherTerminals, closeOthersWhenDone],
  );

  const requestClosePane = useCallback(
    (paneId: string) => {
      const pane = treeRef.current && findPane(treeRef.current, paneId);
      const agents = pane ? busyAmong(pane.tabs) : [];
      if (!pane || agents.length === 0) return closePane(paneId);
      const waiting = pane.tabs.find((t) => t.closeWhenDone === "pane");
      askClose({
        what: "pane",
        agents,
        closeNow: () => closePane(paneId),
        closeWhenDone: () => closePaneWhenDone(paneId),
        keepOpen: waiting && (() => keepOpen(waiting.id)),
      });
    },
    [treeRef, busyAmong, closePane, closePaneWhenDone, keepOpen],
  );

  return { requestCloseTab, requestCloseOthers, requestClosePane };
}
