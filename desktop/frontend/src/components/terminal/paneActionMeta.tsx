import type { ReactNode } from "react";
import type { PaneActionId } from "../../paneActions";
import { FolderIcon, GlobeIcon, HistoryIcon, LayersIcon, SourceControlIcon } from "../icons";
import type { UtilityTabKind } from "./utilityTabToggle";

export interface PaneActionMeta {
  label: string;
  icon: ReactNode;
  shortcut?: string;
  // The utility tab the action shows, when it is one: a toolbar button for it
  // toggles the tab and lights up while the tab is in front.
  tab?: UtilityTabKind;
}

export const PANE_ACTION_META: Record<PaneActionId, PaneActionMeta> = {
  review: { label: "Review changes", icon: <SourceControlIcon />, shortcut: "⌘⇧R" },
  files: { label: "Files", icon: <FolderIcon />, shortcut: "⌘⇧E", tab: "files" },
  toolkit: { label: "Skills & tools", icon: <LayersIcon />, shortcut: "⌘⇧K", tab: "toolkit" },
  browser: { label: "Open browser", icon: <GlobeIcon /> },
  resume: { label: "Resume session", icon: <HistoryIcon /> },
};
