import { useState, useRef, useCallback, type RefObject } from "react";
import { getProjectTerminals, saveProjectTerminals } from "../../terminals";
import { type PaneNode, collectTerminals, panePath } from "../../paneTree";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { treeToPersisted } from "./persistedTree";

// High-frequency events (divider drags, pane focus clicks) mutate state
// on every tick; batch the resulting disk writes to the trailing edge so
// a burst produces ~1 write.
const DEFERRED_PERSIST_MS = 200;

interface UseTreeCoreProps {
  projectName: string;
  onCountRef: RefObject<((count: number) => void) | undefined>;
}

export function useTreeCore({ projectName, onCountRef }: UseTreeCoreProps) {
  const [tree, setTree] = useState<PaneNode | null>(null);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);

  const treeRef = useRef(tree);
  treeRef.current = tree;
  const focusedRef = useRef(focusedPaneId);
  focusedRef.current = focusedPaneId;

  const deferredPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    (next: PaneNode | null) => {
      // A mirror window never owns the persisted tree — the owner (main
      // window) is the single source of truth for terminals.json.
      if (IS_MIRROR_WINDOW) return;
      const focusedId = focusedRef.current;
      // serviceFilterModes is a removed field (filter mode is now a single
      // global setting); strip it so a dead key from an earlier build doesn't
      // round-trip back into terminals.json.
      const { serviceFilterModes: _legacy, ...state } = getProjectTerminals(
        projectName,
      ) as ReturnType<typeof getProjectTerminals> & {
        serviceFilterModes?: unknown;
      };
      saveProjectTerminals(projectName, {
        ...state,
        panes: next ? treeToPersisted(next) : undefined,
        focusedPanePath:
          next && focusedId ? panePath(next, focusedId) ?? undefined : undefined,
        // Drop the legacy terminals[] field on save so the old format
        // doesn't get re-read after a round trip.
        terminals: undefined,
      });
    },
    [projectName],
  );

  const cancelDeferredPersist = useCallback(() => {
    if (deferredPersistTimer.current) {
      clearTimeout(deferredPersistTimer.current);
      deferredPersistTimer.current = null;
    }
  }, []);

  const schedulePersist = useCallback(() => {
    cancelDeferredPersist();
    deferredPersistTimer.current = setTimeout(() => {
      deferredPersistTimer.current = null;
      persist(treeRef.current);
    }, DEFERRED_PERSIST_MS);
  }, [cancelDeferredPersist, persist]);

  const applyTree = useCallback(
    (next: PaneNode | null, focus?: string | null) => {
      cancelDeferredPersist();
      setTree(next);
      if (focus !== undefined) {
        setFocusedPaneId(focus);
        // Sync ref so persist sees the new focus without waiting for the
        // next render's ref assignment.
        focusedRef.current = focus;
      }
      persist(next);
      onCountRef.current?.(next ? collectTerminals(next).length : 0);
    },
    [cancelDeferredPersist, persist],
  );

  // Teardown helper for the orchestrator's unmount effect: flush any debounced
  // persist so in-flight ratio changes aren't lost.
  const flushDeferredPersist = useCallback(() => {
    if (deferredPersistTimer.current) {
      clearTimeout(deferredPersistTimer.current);
      deferredPersistTimer.current = null;
      persist(treeRef.current);
    }
  }, [persist]);

  return {
    tree,
    focusedPaneId,
    setTree,
    setFocusedPaneId,
    treeRef,
    focusedRef,
    deferredPersistTimer,
    persist,
    cancelDeferredPersist,
    schedulePersist,
    applyTree,
    flushDeferredPersist,
  };
}
