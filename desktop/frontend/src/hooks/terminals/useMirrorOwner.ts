import { useRef, useEffect, type RefObject } from "react";
import { useAppStore } from "../../store/app";
import { type PaneNode } from "../../paneTree";
import {
  IS_MIRROR_WINDOW,
  broadcastMirrorTree,
  onMirrorTreeRequest,
  onMirrorAction,
} from "../../mirror";

interface UseMirrorOwnerProps {
  projectName: string;
  tree: PaneNode | null;
  focusedPaneId: string | null;
  treeRef: RefObject<PaneNode | null>;
  focusedRef: RefObject<string | null>;
  forwardable: Record<string, (...args: never[]) => unknown>;
}

export function useMirrorOwner({
  projectName,
  tree,
  focusedPaneId,
  treeRef,
  focusedRef,
  forwardable,
}: UseMirrorOwnerProps) {
  const mirrorActiveRef = useRef(false);
  const broadcastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Owner side of the mirror channel: answer a mirror window's request for the
  // current live tree, and lazily arm change-broadcasting (only once a mirror
  // has actually asked, so non-mirrored projects stay silent).
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    return onMirrorTreeRequest(projectName, () => {
      mirrorActiveRef.current = true;
      broadcastMirrorTree(projectName, {
        tree: treeRef.current,
        focusedPaneId: focusedRef.current,
      });
    });
  }, [projectName]);

  // Disarm broadcasting once the project is no longer detached (mirror window
  // closed / re-attached). Otherwise mirrorActiveRef stays latched for the rest
  // of the session and every tree/focus change keeps serializing + emitting the
  // pane tree over IPC to a listener that no longer exists.
  const isDetached = useAppStore((s) => s.detached.has(projectName));
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    if (!isDetached) mirrorActiveRef.current = false;
  }, [isDetached]);

  // Re-broadcast the live tree whenever it changes so the mirror follows adds,
  // closes, splits, tab switches, and divider drags. Debounced so a divider
  // drag coalesces to ~one emit per frame-burst.
  useEffect(() => {
    if (IS_MIRROR_WINDOW || !mirrorActiveRef.current) return;
    if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    broadcastTimer.current = setTimeout(() => {
      broadcastMirrorTree(projectName, {
        tree: treeRef.current,
        focusedPaneId: focusedRef.current,
      });
    }, 80);
    return () => {
      if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    };
  }, [projectName, tree, focusedPaneId]);

  const forwardableRef = useRef(forwardable);
  forwardableRef.current = forwardable;

  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    return onMirrorAction(projectName, (kind, args) => {
      // A forwarded action is proof a mirror is attached: arm change
      // broadcasting even if the arm-on-request signal was missed (e.g. this
      // hook instance remounted after the mirror joined), so the action's
      // resulting tree change always makes it back to the mirror.
      mirrorActiveRef.current = true;
      const actions = forwardableRef.current;
      if (!Object.prototype.hasOwnProperty.call(actions, kind)) return;
      const fn = actions[kind as keyof typeof actions] as unknown as (
        ...a: unknown[]
      ) => unknown;
      void fn(...args);
    });
  }, [projectName]);
}
