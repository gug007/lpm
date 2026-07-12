import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { PeerDispatchReply } from "../../bridge/commands";
import { IS_MIRROR_WINDOW } from "../mirror";

// Host-side generic dispatcher. When another Mac drives this one, its host Rust
// emits `peer-invoke` for any command it can't fast-path; the main window runs
// the real command locally and replies. Runs only in the main window (a mirror
// window has no authority) and executes concurrently — each request resolves
// independently, errors reported as ok:false with the error string.
export function usePeerDispatcher(): void {
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen("peer-invoke", (event) => {
      const req = event.payload as { reqId?: unknown; cmd?: unknown; args?: unknown } | null;
      if (!req || req.reqId == null || typeof req.cmd !== "string") return;
      const reqId = req.reqId;
      invoke(req.cmd, (req.args ?? {}) as Record<string, unknown>)
        .then((value) => PeerDispatchReply(reqId, true, value ?? null))
        .catch((err) => PeerDispatchReply(reqId, false, String(err)));
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
