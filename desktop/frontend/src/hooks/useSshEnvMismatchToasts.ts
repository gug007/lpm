import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { IS_MIRROR_WINDOW } from "../mirror";
import { parseSshEnvMismatch, sshEnvMismatchMessage } from "../sshEnvMismatch";

// Warns when an SSH host routes terminals into a different environment than
// lpm's own connection, which strands the notification socket (see
// sshEnvMismatch.ts). The backend already emits once per host per app run;
// the local set guards against re-mounts. Main window only — a mirror window
// would double-toast.
export function useSshEnvMismatchToasts(): void {
  const warned = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen("ssh-env-mismatch", (event) => {
      const m = parseSshEnvMismatch(event.payload);
      if (!m || warned.current.has(m.hostLabel)) return;
      warned.current.add(m.hostLabel);
      toast.warning(sshEnvMismatchMessage(m), { duration: 12000 });
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
