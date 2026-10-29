import { DEFAULT_USAGE_WINDOW, USAGE_TOOLS, type UsageWindowChoice } from "../sidebarUsage";
import type { Settings } from "../store/settings";

// Store selectors shared by the sidebar block and the Usage window's controls.
// Both return a stable reference for an unset value, so subscribing to them
// does not re-render on every store write.
export function usageSidebarTools(s: Settings): string[] {
  return s.usageSidebarTools ?? USAGE_TOOLS;
}

export function usageSidebarWindow(s: Settings): UsageWindowChoice {
  return s.usageSidebarWindow ?? DEFAULT_USAGE_WINDOW;
}

export const USAGE_WINDOW_OPTIONS: readonly { value: UsageWindowChoice; label: string }[] = [
  { value: "fiveHour", label: "5-hour" },
  { value: "weekly", label: "Weekly" },
  { value: "higher", label: "Whichever is higher" },
];

// The meter's tools with `provider` switched, kept in USAGE_TOOLS order.
export function toggledUsageTool(tools: string[], provider: string): string[] {
  return tools.includes(provider)
    ? tools.filter((tool) => tool !== provider)
    : USAGE_TOOLS.filter((tool) => tool === provider || tools.includes(tool));
}
