import { useMemo } from "react";
import { normalizeRowLayout, presetLines, type SidebarRowLayout } from "../sidebarRowLayout";
import { useRowLayoutDialog } from "../store/rowLayoutDialog";
import { useSettingsStore } from "../store/settings";

export function useSidebarRowLayout(): SidebarRowLayout {
  const raw = useSettingsStore((s) => s.sidebarRowLayout);
  return useMemo(() => normalizeRowLayout(raw), [raw]);
}

// The details to look up. While the Row builder is open that's all of them,
// so its tray can preview a detail before it's placed.
export function useRowFetchLayout(): SidebarRowLayout {
  const layout = useSidebarRowLayout();
  const building = useRowLayoutDialog((s) => s.open);
  return useMemo(() => (building ? { ...layout, lines: presetLines("all") } : layout), [layout, building]);
}
