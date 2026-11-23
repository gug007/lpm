import { useEffect, useRef } from "react";
import { EventsOn } from "../../bridge/runtime";
import { GIT_CHANGED_EVENT } from "../types";

type GitChangedPayload = { path?: string; files?: string[] | null } | string;

// Calls `onRoot` for a root in `rootsRef` once its git state has been quiet for
// `delayMs`. `accept` sees the files that moved (null: .git metadata, or not
// known) and can pass on the change.
export function useGitChangedRoots(
  enabled: boolean,
  rootsRef: { readonly current: readonly string[] },
  delayMs: number,
  onRoot: (root: string) => void,
  accept: (files: string[] | null) => boolean = () => true,
): void {
  const onRootRef = useRef(onRoot);
  onRootRef.current = onRoot;
  const acceptRef = useRef(accept);
  acceptRef.current = accept;

  useEffect(() => {
    if (!enabled) return;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const cancel = EventsOn(GIT_CHANGED_EVENT, (payload: GitChangedPayload) => {
      const root = typeof payload === "string" ? payload : payload?.path;
      const files = typeof payload === "string" ? null : (payload?.files ?? null);
      if (!root || !rootsRef.current.includes(root) || !acceptRef.current(files)) return;
      clearTimeout(pending.get(root));
      pending.set(
        root,
        setTimeout(() => {
          pending.delete(root);
          onRootRef.current(root);
        }, delayMs),
      );
    });
    return () => {
      if (typeof cancel === "function") cancel();
      pending.forEach(clearTimeout);
    };
  }, [enabled, rootsRef, delayMs]);
}
