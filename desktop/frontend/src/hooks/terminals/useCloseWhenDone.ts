import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { agentStates, type TabAgentState } from "../../closeGuard";
import {
  closingGroups,
  markCloseWhenDone,
  markKeptOpen,
  settlePaneWaits,
  type ClosingGroup,
} from "../../closeWhenDone";
import { hasUnsavedFiles } from "../../components/files/fileDrafts";
import { IS_MIRROR_WINDOW } from "../../mirror";
import {
  collectTerminals,
  findPane,
  findTerminalLocation,
  mapPane,
  otherClosableTabs,
  otherTerminals,
  type PaneNode,
  type TerminalInstance,
} from "../../paneTree";
import { knownStatusEntries, onStatusEntriesChange, refreshStatusEntries } from "../../projectStatusEntries";
import { hasComposerText } from "../../store/composerDrafts";

// An agent that ends one turn and starts the next at once (a queued message, a
// background task reporting back) isn't done in between.
const SETTLE_MS = 3000;

interface UseCloseWhenDoneProps {
  projectName: string;
  tree: PaneNode | null;
  treeRef: RefObject<PaneNode | null>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  forward: (kind: string, ...args: unknown[]) => void;
  closeTerminal: (paneId: string, tabIdx: number) => void;
  closeTerminalsById: (ids: string[]) => void;
  closePane: (paneId: string) => void;
}

// Tabs and panes waiting for their agents to finish before they close. The tab
// tree carries the wait, so a detached window shows it too, and the window that
// owns the tabs does the closing. Only a finish its agent reported, and that
// stands a moment, closes a tab. A turn interrupted or cut off by an error, an
// agent that quit, and a finish someone came to look at take the wait back.
export function useCloseWhenDone({
  projectName,
  tree,
  treeRef,
  applyTree,
  forward,
  closeTerminal,
  closeTerminalsById,
  closePane,
}: UseCloseWhenDoneProps) {
  // The tabs whose agents are waited for, and whether one was done while others
  // of its pane still worked.
  const doneEarly = useRef(new Map<string, boolean>());
  const settling = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const statesNow = useCallback((): Map<string, TabAgentState> | null => {
    const entries = knownStatusEntries(projectName);
    return entries && treeRef.current ? agentStates(collectTerminals(treeRef.current), entries) : null;
  }, [projectName, treeRef]);

  const stopSettling = useCallback((key: string) => {
    clearTimeout(settling.current.get(key));
    settling.current.delete(key);
  }, []);

  const verdict = useCallback(
    ({ ids }: ClosingGroup, states: Map<string, TabAgentState>): "wait" | "due" | "keep" => {
      const pending = ids.filter((id) => states.get(id) === "pending");
      for (const id of pending) doneEarly.current.set(id, false);
      const agents = ids.filter((id) => doneEarly.current.has(id));
      const done = agents.filter((id) => states.get(id) === "done");
      if (pending.length > 0) {
        for (const id of done) doneEarly.current.set(id, true);
        return "wait";
      }
      const finished = agents.every(
        (id) => states.get(id) === "done" || (!states.has(id) && doneEarly.current.get(id)),
      );
      return finished && done.length > 0 ? "due" : "keep";
    },
    [],
  );

  const keepGroups = useCallback(
    (groups: ClosingGroup[]) => {
      if (!treeRef.current || groups.length === 0) return;
      applyTree(groups.flatMap((g) => g.ids).reduce(markKeptOpen, treeRef.current));
    },
    [treeRef, applyTree],
  );

  const close = useCallback(
    (group: ClosingGroup) => {
      const at = treeRef.current && findTerminalLocation(treeRef.current, group.ids[0]);
      if (!at) return;
      if (group.pane) closePane(at.paneId);
      else closeTerminal(at.paneId, at.tabIdx);
    },
    [treeRef, closePane, closeTerminal],
  );

  // A finish has stood for a moment: ask once more, then close, unless
  // something typed or edited there would go with it.
  const finish = useCallback(
    async (key: string) => {
      await refreshStatusEntries(projectName).catch(() => {});
      if (!settling.current.delete(key)) return;
      const group = closingGroups(treeRef.current).find((g) => g.key === key);
      const states = statesNow();
      if (!group || !states || !treeRef.current || verdict(group, states) !== "due") return;
      const ids = new Set(group.ids);
      const tabs = collectTerminals(treeRef.current).filter((t) => ids.has(t.id));
      if (tabs.some((t) => hasUnsavedFiles(t.id) || hasComposerText(t.id, t.historyKey))) keepGroups([group]);
      else close(group);
    },
    [projectName, treeRef, statesNow, verdict, keepGroups, close],
  );

  const check = useCallback(() => {
    if (!treeRef.current) return;
    const states = statesNow();
    if (states) {
      const settled = settlePaneWaits(treeRef.current, (id) => states.get(id) === "pending");
      // Comes back here with the new tree.
      if (settled !== treeRef.current) return applyTree(settled);
    }
    const groups = closingGroups(treeRef.current);
    const keys = new Set(groups.map((g) => g.key));
    for (const key of [...settling.current.keys()]) if (!keys.has(key)) stopSettling(key);
    const waiting = new Set(groups.flatMap((g) => g.ids));
    for (const id of [...doneEarly.current.keys()]) if (!waiting.has(id)) doneEarly.current.delete(id);
    const keep: ClosingGroup[] = [];
    for (const group of groups) {
      const now = states ? verdict(group, states) : "wait";
      if (now !== "due") stopSettling(group.key);
      else if (!settling.current.has(group.key)) {
        settling.current.set(group.key, setTimeout(() => void finish(group.key), SETTLE_MS));
      }
      if (now === "keep") keep.push(group);
    }
    keepGroups(keep);
  }, [treeRef, statesNow, applyTree, verdict, stopSettling, finish, keepGroups]);

  const waiting = useMemo(() => (tree ? collectTerminals(tree).some((t) => t.closeWhenDone) : false), [tree]);
  useEffect(() => {
    if (IS_MIRROR_WINDOW || !waiting) return;
    return onStatusEntriesChange(check);
  }, [waiting, check]);
  useEffect(() => {
    if (!IS_MIRROR_WINDOW) check();
  }, [tree, check]);
  useEffect(
    () => () => {
      for (const timer of settling.current.values()) clearTimeout(timer);
      settling.current.clear();
    },
    [],
  );

  const wait = useCallback(
    (ids: string[], how: "tab" | "pane", agents: string[] = ids) => {
      if (!treeRef.current || ids.length === 0) return;
      for (const id of agents) if (!doneEarly.current.has(id)) doneEarly.current.set(id, false);
      applyTree(markCloseWhenDone(treeRef.current, new Set(ids), how));
    },
    [treeRef, applyTree],
  );

  const closeTabWhenDone = useCallback(
    (id: string) => {
      if (IS_MIRROR_WINDOW) return forward("closeTabWhenDone", id);
      const tab = treeRef.current && collectTerminals(treeRef.current).find((t) => t.id === id);
      if (tab && !tab.pinned) wait([id], "tab");
    },
    [treeRef, forward, wait],
  );

  const closeSplitByBusy = useCallback(
    (tabs: TerminalInstance[]) => {
      const states = statesNow();
      if (!states) return;
      const pending = (t: TerminalInstance) => states.get(t.id) === "pending";
      wait(tabs.filter(pending).map((t) => t.id), "tab");
      const idle = tabs.filter((t) => !pending(t)).map((t) => t.id);
      if (idle.length > 0) closeTerminalsById(idle);
    },
    [statesNow, wait, closeTerminalsById],
  );

  // The other tabs of a pane: idle ones close now, the rest as they finish.
  const closeOthersWhenDone = useCallback(
    (paneId: string, keptId: string) => {
      if (IS_MIRROR_WINDOW) return forward("closeOthersWhenDone", paneId, keptId);
      const pane = treeRef.current && findPane(treeRef.current, paneId);
      if (!pane?.tabs.some((t) => t.id === keptId)) return;
      closeSplitByBusy(otherClosableTabs(pane.tabs, keptId));
      if (!treeRef.current) return;
      applyTree(
        mapPane(treeRef.current, paneId, (p) => ({
          ...p,
          activeTabIdx: Math.max(0, p.tabs.findIndex((t) => t.id === keptId)),
        })),
      );
    },
    [treeRef, forward, closeSplitByBusy, applyTree],
  );

  // A phone's Close Other Tabs, which reaches every pane. Asked while this
  // window may have been asleep, so what the agents do is read first.
  const closeOthersEverywhereWhenDone = useCallback(
    async (keptId: string) => {
      if (IS_MIRROR_WINDOW) return;
      await refreshStatusEntries(projectName).catch(() => {});
      if (treeRef.current) closeSplitByBusy(otherTerminals(treeRef.current, keptId));
    },
    [projectName, treeRef, closeSplitByBusy],
  );

  const closePaneWhenDone = useCallback(
    (paneId: string) => {
      if (IS_MIRROR_WINDOW) return forward("closePaneWhenDone", paneId);
      const pane = treeRef.current && findPane(treeRef.current, paneId);
      const states = statesNow();
      if (!pane || !states) return;
      const ids = pane.tabs.map((t) => t.id);
      const pending = ids.filter((id) => states.get(id) === "pending");
      if (pending.length > 0) wait(ids, "pane", pending);
      else closePane(paneId);
    },
    [treeRef, forward, statesNow, wait, closePane],
  );

  const keepOpen = useCallback(
    (id: string) => {
      if (IS_MIRROR_WINDOW) return forward("keepOpen", id);
      if (treeRef.current) applyTree(markKeptOpen(treeRef.current, id));
    },
    [treeRef, forward, applyTree],
  );

  return { closeTabWhenDone, closeOthersWhenDone, closeOthersEverywhereWhenDone, closePaneWhenDone, keepOpen };
}
