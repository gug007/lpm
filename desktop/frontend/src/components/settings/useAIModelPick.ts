import { AI_CLI_OPTIONS, resolveAIPick, type AICLI } from "../../types";
import { useSettingsTarget } from "./settingsTarget";
import { useMachineAICLIs } from "./useMachineAICLIs";

const EVERY_CLI: Record<string, boolean> = Object.fromEntries(AI_CLI_OPTIONS.map((o) => [o.value, true]));

// The pick the Commit, PR and branch windows open with: the saved one when its
// CLI is installed, else the first installed CLI, as useAIPicker resolves it.
export function useAIModelPick(): { cli: AICLI; model: string; available: Record<string, boolean> | null } {
  const { machine, settings } = useSettingsTarget();
  const available = useMachineAICLIs(machine);
  const pick = resolveAIPick(settings.aiCli, settings.aiModel, available ?? EVERY_CLI) ?? {
    cli: (settings.aiCli as AICLI) || "claude",
    model: settings.aiModel ?? "",
  };
  return { ...pick, available };
}
