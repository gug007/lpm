import { useEffect } from "react";
import { create } from "zustand";
import type { View } from "./app";

// Every view that isn't Settings or one of the pages it opens, by name.
const APP_VIEWS: Partial<Record<View, string>> = {
  projects: "Projects",
  terminals: "Terminals",
  stats: "Stats",
  scheduled: "Automations",
  shared: "Shared tab",
};

export function isSettingsView(view: View): boolean {
  return !(view in APP_VIEWS);
}

export function settingsReturnLabel(view: View): string {
  return APP_VIEWS[view] ?? "Projects";
}

// The view Settings was opened from, which leaving it goes back to.
export const useSettingsReturn = create<{ from: View }>(() => ({ from: "projects" }));

export function useTrackSettingsReturn(view: View): void {
  useEffect(() => {
    if (!isSettingsView(view)) useSettingsReturn.setState({ from: view });
  }, [view]);
}
