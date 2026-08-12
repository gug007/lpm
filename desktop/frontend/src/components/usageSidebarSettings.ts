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
