import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { ReadMemorySessions } from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { basename } from "../../path";
import {
  collectTerminals,
  findPane,
  findTerminalLocation,
  isTerminalTab,
  mapPane,
  type PaneNode,
  type TerminalInstance,
} from "../../paneTree";
import { isMemoryPending, mergeMemoryRef, soleChangedSession } from "../../terminalMemory";
import { MEMORY_CHANGED_EVENT, type MemoryState } from "../../types";

interface UseTerminalMemoryProps {
  projectName: string;
  tree: PaneNode | null;
  treeRef: RefObject<PaneNode | null>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  forward: (kind: string, ...args: unknown[]) => void;
}

interface FolderState {
  // Whoever owns the folder the backend answered with: this project, or the
  // original it is a copy of (duplicates share the original's memory). Saves are
  // announced under the owner's name, so that's what the change event carries.
  owner: string;
  // Session name -> last write, which is all the adoption diff needs.
  times: Map<string, number>;
}

// Null when the folder can't be read — an SSH project, or an unknown one.
async function readFolder(projectName: string): Promise<FolderState | null> {
  try {
    const state = (await ReadMemorySessions(projectName)) as MemoryState;
    return {
      owner: basename(state.dir) || projectName,
      times: new Map(state.sessions.map((s) => [s.name, s.updatedAt])),
    };
  } catch {
    return null;
  }
}

// Returns null when the tab is missing OR when `fn` left it untouched, so the
// caller applies a tree only when something actually moved.
function updateTab(
  tree: PaneNode,
  terminalId: string,
  fn: (tab: TerminalInstance) => TerminalInstance,
): PaneNode | null {
  const at = findTerminalLocation(tree, terminalId);
  if (!at) return null;
  const tab = findPane(tree, at.paneId)?.tabs[at.tabIdx];
  if (!tab) return null;
  const updated = fn(tab);
  if (updated === tab) return null;
  return mapPane(tree, at.paneId, (pane) => ({
    ...pane,
    tabs: pane.tabs.map((t, i) => (i === at.tabIdx ? updated : t)),
  }));
}

/**
 * Tracks which terminals are working under an lpm-memory session.
 *
 * A mark is set from the prompt on its way in (see `scanMemoryInvocation`) —
 * the only signal that doesn't lie. Reading it back out of the agent's own
 * transcripts was measured and abandoned: Codex injects the skill's description
 * (which contains the memory path) into every session, so a transcript match
 * there is ~87% boilerplate and zero true positives.
 *
 * The bare "remember this conversation" form has no session id at send time —
 * the agent picks the slug — so the mark starts unnamed and is adopted from the
 * memory folder once the agent writes. Adoption stands down unless exactly one
 * terminal is waiting: with two unnamed marks in flight there is no way to tell
 * which save belongs to which.
 */
export function useTerminalMemory({
  projectName,
  tree,
  treeRef,
  applyTree,
  forward,
}: UseTerminalMemoryProps) {
  // The terminal waiting for a name, with the folder as it stood when it started
  // waiting. Null whenever adoption isn't in play, which is also what keeps the
  // change-event handler from re-reading every session file for nothing.
  const waiting = useRef<{ terminalId: string; folder: FolderState } | null>(null);

  const noteTerminalMemory = useCallback(
    (terminalId: string, session: string | null) => {
      const current = treeRef.current;
      if (!current) return;
      // `session` is null (never undefined) for the bare form: the mirror strips
      // trailing undefined args off a forwarded action, which would turn a bare
      // save into a no-arg call on the owner side.
      if (IS_MIRROR_WINDOW) forward("noteTerminalMemory", terminalId, session);
      const next = updateTab(current, terminalId, (tab) => {
        const memory = mergeMemoryRef(tab.memory, session);
        return memory === tab.memory ? tab : { ...tab, memory };
      });
      if (next) applyTree(next);
    },
    [applyTree, forward, treeRef],
  );

  const detachTerminalMemory = useCallback(
    (terminalId: string) => {
      const current = treeRef.current;
      if (!current) return;
      if (IS_MIRROR_WINDOW) forward("detachTerminalMemory", terminalId);
      const next = updateTab(current, terminalId, (tab) => {
        if (!tab.memory) return tab;
        const { memory: _detached, ...rest } = tab;
        return rest;
      });
      if (next) applyTree(next);
    },
    [applyTree, forward, treeRef],
  );

  // The single terminal waiting to be named, or null when none is — or when
  // more than one is, which is exactly when adoption must stand down. A plain
  // string is a stable effect dependency, unlike the tab objects it came from.
  const solePendingId = useMemo(() => {
    if (!tree) return null;
    const pending = collectTerminals(tree).filter(
      (tab) => isTerminalTab(tab) && isMemoryPending(tab.memory),
    );
    return pending.length === 1 ? pending[0].id : null;
  }, [tree]);

  // Snapshot the folder as it stands BEFORE the agent writes, so the save can be
  // told apart from everything already there. Read fresh rather than kept warm:
  // the agent has to receive the prompt and think first, so a read starting now
  // lands long before it saves.
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    if (!solePendingId) {
      waiting.current = null;
      return;
    }
    if (waiting.current?.terminalId === solePendingId) return;
    waiting.current = null;
    let cancelled = false;
    void (async () => {
      const folder = await readFolder(projectName);
      if (cancelled || !folder) return;
      waiting.current = { terminalId: solePendingId, folder };
    })();
    return () => {
      cancelled = true;
    };
  }, [solePendingId, projectName]);

  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    return EventsOn(MEMORY_CHANGED_EVENT, (changed: string) => {
      const pending = waiting.current;
      // Nothing is waiting for a name, so there is nothing to learn from the
      // folder — and reading it means reading every session file's contents.
      if (!pending) return;
      // A duplicate's saves are announced under the ORIGINAL's name, since that
      // is the folder they land in.
      if (changed !== projectName && changed !== pending.folder.owner) return;
      void (async () => {
        const after = await readFolder(projectName);
        const current = treeRef.current;
        if (!after || !current || waiting.current !== pending) return;
        const session = soleChangedSession(pending.folder.times, after.times);
        if (!session) return;
        const next = updateTab(current, pending.terminalId, (tab) =>
          isMemoryPending(tab.memory) ? { ...tab, memory: { session } } : tab,
        );
        if (next) applyTree(next);
      })();
    });
  }, [applyTree, projectName, treeRef]);

  return { noteTerminalMemory, detachTerminalMemory };
}
