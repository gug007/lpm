import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { IS_MIRROR_WINDOW } from "../mirror";
import {
  parseSshEnvMismatch,
  parseSshUndeliverable,
  sshEnvMismatchMessage,
  sshStatusUndeliverableMessage,
} from "../sshEnvMismatch";

// Warns when an SSH host's agents can't get their status to lpm: its terminals
// open in a different environment than lpm's own connection, which strands the
// notification socket, or it has nothing to deliver a status with (see
// sshEnvMismatch.ts). The backend probes once per host per app run; the local
// set guards against re-mounts. Main window only — a mirror window would
// double-toast.
export function useSshStatusWarnings(): void {
  const warned = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    const warnOnce = (id: string, message: string) => {
      if (warned.current.has(id)) return;
      warned.current.add(id);
      toast.warning(message, { duration: 12000 });
    };
    const unlistens = [
      listen("ssh-env-mismatch", (event) => {
        const m = parseSshEnvMismatch(event.payload);
        if (m) warnOnce(`env:${m.hostLabel}`, sshEnvMismatchMessage(m));
      }),
      listen("ssh-status-undeliverable", (event) => {
        const u = parseSshUndeliverable(event.payload);
        if (u) warnOnce(`${u.reason}:${u.hostLabel}`, sshStatusUndeliverableMessage(u));
      }),
    ];
    return () => {
      for (const unlisten of unlistens) void unlisten.then((un) => un()).catch(() => {});
    };
  }, []);
}
