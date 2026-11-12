import { useState } from "react";
import { PeerSetEnabled } from "../../bridge/commands";
import { toast } from "../notifications/toast";
import { useAppStore } from "../store/app";

/** What brings back a paired machine that isn't answering: turning it on here,
 *  and opening where its connection is set up (Server for a Linux host,
 *  Another computer otherwise). */
export function usePeerRecovery(slug: string | undefined, alias: string, server: boolean) {
  const connectComputer = useAppStore((s) => s.connectComputer);
  const openServers = useAppStore((s) => s.openServers);
  const [busy, setBusy] = useState(false);

  const turnOn = () => {
    if (!slug) return;
    setBusy(true);
    PeerSetEnabled(slug, true)
      .catch((err: unknown) => toast.error(`Couldn't turn on ${alias}`, { description: String(err) }))
      .finally(() => setBusy(false));
  };

  return { turnOn, busy, openConnections: server ? openServers : connectComputer };
}
