import { useCallback } from "react";
import { setClaudeLimitsEnabled } from "../../claudeLimits";
import { toast } from "../../notifications/toast";
import { useMachineClaudeStore } from "../../store/machineClaude";
import { useSettingsTarget } from "./settingsTarget";

// Turns Read Claude usage on or off for the machine Settings shows. Its
// switching pool is read again after, since the readings pause or resume it;
// this machine's store does that on its own when the setting changes.
export function useClaudeReadings(): (enabled: boolean) => Promise<void> {
  const { machine, update } = useSettingsTarget();
  const host = machine.kind === "peer" ? machine.slug : null;
  const reload = useMachineClaudeStore((s) => s.load);

  return useCallback(
    async (enabled: boolean) => {
      try {
        await setClaudeLimitsEnabled(enabled, host, update);
      } catch (err) {
        toast.error(String(err));
      }
      if (host) await reload(host).catch(() => {});
    },
    [host, update, reload],
  );
}
