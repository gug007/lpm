import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/app";

// Whether an action button is being dragged, from the drag's own start and end
// handlers. While one is, project list refreshes wait: a refresh would put the
// previewed buttons back where they are on disk.
export function useActionsDragging() {
  const [dragging, setDragging] = useState(false);
  // For effects that must skip work mid-drag without re-running when it ends.
  const draggingRef = useRef(false);
  const holdProjectsRefresh = useAppStore((s) => s.holdProjectsRefresh);
  const releaseRef = useRef<(() => void) | null>(null);
  const onDragActiveChange = useCallback(
    (active: boolean) => {
      draggingRef.current = active;
      setDragging(active);
      if (active) {
        releaseRef.current ??= holdProjectsRefresh();
        return;
      }
      releaseRef.current?.();
      releaseRef.current = null;
    },
    [holdProjectsRefresh],
  );
  useEffect(() => () => releaseRef.current?.(), []);
  return { dragging, draggingRef, onDragActiveChange };
}
