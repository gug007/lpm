import { useEffect, useMemo, useState } from "react";
import { peerSlugOf } from "../../peer/markers";
import { watchConnectedPeers } from "../../peer/route";
import { machineCommands, THIS_MACHINE, type MachineScope } from "./machineCommands";
import { MACHINE } from "../../machineWords";

// The machine a project lives on: this one, or the connected one whose marker
// its name carries, where its AI generations read their global instructions.
export function useProjectMachine(projectName: string): MachineScope {
  const slug = peerSlugOf(projectName);
  const [alias, setAlias] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    return watchConnectedPeers((peers) => setAlias(peers.find((p) => p.slug === slug)?.alias ?? null));
  }, [slug]);

  return useMemo(
    () => (slug ? { slug, name: alias ?? MACHINE.anotherMachine, commands: machineCommands(slug) } : THIS_MACHINE),
    [slug, alias],
  );
}
