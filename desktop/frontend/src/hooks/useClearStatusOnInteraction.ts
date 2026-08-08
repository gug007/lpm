import { useEffect } from "react";
import { onUserInteraction } from "../attention";
import type { StatusKind } from "../components/PaneView";

/**
 * Retires the given statuses on the tab the user is looking at, but only once
 * they actually touch the app again.
 *
 * Having a tab selected used to be treated as having seen it, so a run that
 * finished while the user was away from the Mac was wiped before they got back
 * — and with it the phone notification, which is withdrawn when the status
 * disappears. Waiting for real input means the badge is still there when they
 * return and goes away the moment they engage with it.
 */
export function useClearStatusOnInteraction(
  terminalId: string | null,
  kinds: StatusKind[],
  onClear: (terminalId: string, kind: StatusKind) => void,
) {
  // Joined so a fresh array each render doesn't resubscribe (which would be
  // harmless but churns), while a genuine change in the set does.
  const pending = kinds.join(",");
  useEffect(() => {
    if (!terminalId || !pending) return;
    return onUserInteraction(() => {
      for (const kind of pending.split(",") as StatusKind[])
        onClear(terminalId, kind);
    });
  }, [terminalId, pending, onClear]);
}
