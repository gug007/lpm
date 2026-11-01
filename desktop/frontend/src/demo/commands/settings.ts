import { recapWeekStart } from "../../components/recap/weeklyRecapModel";
import type { CommandMap } from "../backend";

let settings: Record<string, unknown> = {};

// The sample workspace opens on its first project with usage limits on; a
// fresh install opens on nothing.
export function seedSettings(selected?: string): void {
  settings = {
    theme: "dark",
    defaultProjectDirectory: "~/Projects",
    // A tour shouldn't be interrupted by Monday's recap toast.
    weeklyRecapToasted: recapWeekStart("last"),
    ...(selected
      ? {
          lastSelectedProject: selected,
          claudeLimitsEnabled: true,
          duplicateRunMode: "action",
          duplicateActionName: "codex",
        }
      : {}),
  };
}

export function keepsFinishedAgents(): boolean {
  return settings.keepFinishedAgents === true;
}

export function selectedProject(): string | undefined {
  const name = settings.lastSelectedProject;
  return typeof name === "string" && name ? name : undefined;
}

let quickTerminalOn = false;

export const settingsCommands: CommandMap = {
  load_settings: () => ({ ...settings }),
  save_settings: ({ s }) => {
    settings = { ...(s as Record<string, unknown>) };
    return null;
  },
  set_quick_terminal: ({ enabled }) => {
    quickTerminalOn = enabled === true;
    return { registered: quickTerminalOn, problem: null };
  },
  quick_terminal_status: () => ({ registered: quickTerminalOn, problem: null }),
  quick_terminal_cwd: () => "~",
  hide_quick_terminal: () => null,
};
