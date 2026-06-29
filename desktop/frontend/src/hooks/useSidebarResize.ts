import { getSettings, saveSettings } from "../store/settings";
import { useResizableWidth } from "./useResizableWidth";

export function useSidebarResize() {
  return useResizableWidth({
    initial: () => getSettings().sidebarWidth || 260,
    min: 160,
    max: 400,
    onCommit: (w) => {
      if (getSettings().sidebarWidth !== w) saveSettings({ sidebarWidth: w });
    },
  });
}
