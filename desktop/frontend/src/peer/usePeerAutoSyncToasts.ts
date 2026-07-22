import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { IS_MIRROR_WINDOW } from "../mirror";
import type { PeerClient } from "./usePeerState";
import { autoSyncToast, type AutoSyncResult } from "./autoSyncToast";

// Surfaces auto-sync outcomes to the user. The engine emits `peer-autosync-result`
// after every unattended run; only the ones that need a human — a both-sides change
// (resolved, backup kept) or a failure — toast, and errors are throttled per peer.
// Mounted once at the app root in the MAIN window only: the event is a local emit
// from this Mac's engine, and a mirror window would double-toast (like
// usePeerDispatcher).
export function usePeerAutoSyncToasts(peers: PeerClient[]): void {
  // Latest peer list for name lookup, without re-subscribing on each change.
  const peersRef = useRef(peers);
  peersRef.current = peers;
  const lastErrorAt = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen("peer-autosync-result", (event) => {
      const p = event.payload as Partial<AutoSyncResult> | null;
      if (!p || typeof p.slug !== "string") return;
      const res: AutoSyncResult = {
        slug: p.slug,
        applied: p.applied ?? 0,
        pushed: p.pushed ?? 0,
        errors: p.errors ?? [],
        conflicts: p.conflicts ?? [],
      };
      const peer = peersRef.current.find((x) => x.slug === res.slug);
      const name = peer?.alias || peer?.host || "the other Mac";
      const now = Date.now();
      const decision = autoSyncToast(res, name, lastErrorAt.current.get(res.slug), now);
      if (!decision) return;
      if (decision.kind === "error") {
        lastErrorAt.current.set(res.slug, now);
        toast.error(decision.message);
      } else {
        toast(decision.message);
      }
    })
      .then((un) => {
        if (disposed) un();
        else unlisten = un;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
