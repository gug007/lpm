import { useEffect, useRef } from "react";
import { useIsControlled } from "../../store/terminalControl";

// Re-sync a terminal's geometry after control is handed BACK to this surface.
//
// A terminal this window doesn't own sits display:none behind the "Take control"
// placeholder, and the reveal happens in the same React commit that records the
// new owner. The imperative `onControlChange` listeners run before that commit,
// so a resync there measures a host that still has no layout: the fit is skipped
// and the size re-assert no-ops, leaving the PTY at the PREVIOUS owner's
// geometry. That's how a terminal viewed on the phone comes back to the desktop
// rendering full width while the program still wraps at the phone's columns.
//
// Effects run after the commit, so this is the first point a newly-owning window
// can measure its host — hence the resync belongs here, not in the listener.
export function useControlRevealResync(
  terminalId: string,
  visible: boolean,
  resync: () => void,
): void {
  const controlled = useIsControlled(terminalId);
  const resyncRef = useRef(resync);
  resyncRef.current = resync;
  useEffect(() => {
    if (!controlled || !visible) return;
    resyncRef.current();
  }, [controlled, visible, terminalId]);
}
