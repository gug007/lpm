import { useEffect, useRef } from "react";
import { useAppStore } from "../store/app";

/** Closes the archived project opened for now as soon as something else is
 *  shown in its place, so it never lingers in the sidebar. */
export function useCloseLeftArchived(): void {
  const showing = useAppStore((s) =>
    s.view === "projects" && s.selected === s.openedArchive ? s.openedArchive : null,
  );
  const last = useRef<string | null>(null);
  useEffect(() => {
    const left = last.current;
    last.current = showing;
    if (left && left !== showing) void useAppStore.getState().closeArchived(left);
  }, [showing]);
}
