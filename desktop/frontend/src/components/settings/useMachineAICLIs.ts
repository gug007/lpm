import { useEffect, useState } from "react";
import { aiAvailability, checkMachineAICLIs } from "../../hooks/useAIPicker";
import type { SettingsMachine } from "../../settingsMachine";

// Which AI CLIs the machine Settings configures has installed; null until it
// answers, or when it can't say.
export function useMachineAICLIs(machine: SettingsMachine): Record<string, boolean> | null {
  const slug = machine.kind === "peer" ? machine.slug : null;
  const [available, setAvailable] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    setAvailable(null);
    let cancelled = false;
    checkMachineAICLIs(slug)
      .then((a) => {
        if (!cancelled && a && typeof a === "object" && !Array.isArray(a)) setAvailable(aiAvailability(a));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return available;
}
